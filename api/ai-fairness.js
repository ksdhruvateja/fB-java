/**
 * Fair, bounded concurrency for AI requests that run while the user waits.
 *
 * - Each user may have at most AI_MAX_INFLIGHT_PER_USER requests in flight (default 2), so one
 *   user (or a script) cannot take capacity from others.
 * - Each instance runs at most AI_MAX_INFLIGHT requests (default 64). Beyond that it answers
 *   503 with Retry-After at once instead of letting every user's request slow down together.
 *   Add instances to raise total capacity.
 */
const inflightByUser = new Map();
let inflightTotal = 0;

export function aiFairnessStats() {
  return { inflightTotal, usersWithInflight: inflightByUser.size };
}

export function aiFairnessGuard({
  perUser = Number(process.env.AI_MAX_INFLIGHT_PER_USER || 2),
  global = Number(process.env.AI_MAX_INFLIGHT || 64),
} = {}) {
  return (req, res, next) => {
    const userId = req.authUser?.id != null ? String(req.authUser.id) : `ip:${req.ip || 'unknown'}`;
    const mine = inflightByUser.get(userId) || 0;
    if (mine >= perUser) {
      res.set('Retry-After', '2');
      return res.status(429).json({
        ok: false,
        code: 'AI_REQUEST_IN_PROGRESS',
        message: 'Fixera is still working on your previous request. Please wait a moment.',
      });
    }
    if (inflightTotal >= global) {
      res.set('Retry-After', '3');
      return res.status(503).json({
        ok: false,
        code: 'AI_BUSY',
        message: 'Fixera is very busy right now. Please try again in a few seconds.',
      });
    }
    inflightByUser.set(userId, mine + 1);
    inflightTotal += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      inflightTotal -= 1;
      const left = (inflightByUser.get(userId) || 1) - 1;
      if (left <= 0) inflightByUser.delete(userId);
      else inflightByUser.set(userId, left);
    };
    res.on('finish', release);
    res.on('close', release);
    next();
  };
}
