/*
 * Per-homeowner DIY profile, built only from that homeowner's own cases: outcomes, steps that
 * failed or looked different, times they stopped or chose a professional, and how often
 * Fixera's diagnosis matched what a professional found.
 *
 * It personalises that homeowner's next assessments and DIY chat (level of detail, extra
 * checkpoints where they struggled). It never changes the safety decision or guardrails: those
 * are evaluated separately from the case itself, and experience never unlocks a prohibited step.
 * No other user's or house's data is read or written.
 */

function parse(v, fallback) {
  if (!v) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function categoryOf(row) {
  return String(row.category || 'other').toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 40) || 'other';
}

/** Pure: derives the profile from the homeowner's own rows. Exported for tests. */
export function deriveProfile({ outcomes = [], jobs = [], stops = 0 }) {
  const byCat = {};
  const cat = (c) => (byCat[c] ||= { fixed: 0, still_broken: 0, professional: 0, step_failed: 0, step_different: 0, stopped: 0, matched: 0, mismatched: 0 });
  for (const o of outcomes) {
    const c = cat(categoryOf(o));
    if (o.outcome === 'DIY_FIXED') c.fixed += 1;
    else if (o.outcome === 'DIY_STILL_BROKEN') c.still_broken += 1;
    else if (o.outcome === 'PROFESSIONAL_REQUESTED' || o.outcome === 'SAFETY_DECLINED') c.professional += 1;
    else if (o.outcome === 'PROFESSIONAL_COMPLETED') {
      const m = parse(o.details, {})?.diagnosis_match;
      if (m === 'matched') c.matched += 1;
      else if (m === 'different' || m === 'partly') c.mismatched += 1;
    }
  }
  for (const j of jobs) {
    const steps = parse(j.completion_report, {})?.fixeraDiy?.attemptedSteps || [];
    const c = cat(categoryOf(j));
    for (const s of steps) {
      if (s?.event === 'step_failed') c.step_failed += 1;
      if (s?.event === 'step_different') c.step_different += 1;
    }
  }
  const categories = {};
  let attempts = 0;
  let fixes = 0;
  for (const [name, c] of Object.entries(byCat)) {
    const tries = c.fixed + c.still_broken;
    attempts += tries;
    fixes += c.fixed;
    const success = tries ? c.fixed / tries : null;
    const level = c.fixed >= 3 && (success ?? 0) >= 0.7 ? 'experienced' : c.fixed >= 1 ? 'some_experience' : 'new';
    categories[name] = {
      level,
      diy_attempts: tries,
      diy_success_rate: success == null ? null : Math.round(success * 100) / 100,
      struggled: c.still_broken + c.step_failed + c.step_different > 0,
      step_failures: c.step_failed,
      steps_looked_different: c.step_different,
      chose_professional: c.professional,
      diagnosis_matched: c.matched,
      diagnosis_mismatched: c.mismatched,
    };
  }
  const strengths = Object.entries(categories).filter(([, c]) => c.diy_success_rate != null && c.diy_success_rate >= 0.6 && c.diy_attempts >= 1).map(([n]) => n);
  const needsSupport = Object.entries(categories).filter(([, c]) => c.struggled).map(([n]) => n);
  const professionalChoices = Object.values(categories).reduce((s, c) => s + c.chose_professional, 0);
  return {
    version: 1,
    overall: {
      diy_attempts: attempts,
      diy_success_rate: attempts ? Math.round((fixes / attempts) * 100) / 100 : null,
      times_stopped_for_safety_or_comfort: stops,
      prefers_professional: professionalChoices >= 2 && professionalChoices > attempts,
    },
    categories,
    strengths,
    needs_support: needsSupport,
  };
}

export async function ensureUserProfileSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fixera_user_profiles (
      user_id    INT PRIMARY KEY,
      profile    JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/** Rebuilds one homeowner's profile from their own cases only. */
export async function rebuildUserProfile(pool, userId) {
  const uid = Number(userId);
  if (!pool || !Number.isInteger(uid) || uid <= 0) return null;
  const { rows: outcomes } = await pool.query(
    `SELECT o.outcome, o.details, j.category
       FROM fixera_case_outcomes o
       JOIN managed_jobs j ON j.id = o.job_id
      WHERE j.homeowner_user_id = $1
      ORDER BY o.created_at DESC
      LIMIT 500`,
    [uid]
  );
  const { rows: jobs } = await pool.query(
    `SELECT category, completion_report FROM managed_jobs
      WHERE homeowner_user_id = $1 AND completion_report IS NOT NULL
      ORDER BY created_at DESC LIMIT 200`,
    [uid]
  );
  let stops = 0;
  try {
    stops = (await pool.query(
      `SELECT COUNT(*)::int AS n FROM diy_safety_events WHERE user_id=$1 AND event_type IN ('user_stop','safety_concern_hire_professional')`,
      [uid]
    )).rows[0]?.n || 0;
  } catch { /* table optional */ }
  const profile = deriveProfile({ outcomes, jobs, stops });
  await pool.query(
    `INSERT INTO fixera_user_profiles (user_id, profile, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET profile = EXCLUDED.profile, updated_at = NOW()`,
    [uid, JSON.stringify(profile)]
  );
  return profile;
}

export async function getUserProfile(pool, userId) {
  if (!pool || userId == null) return null;
  try {
    const { rows } = await pool.query(`SELECT profile FROM fixera_user_profiles WHERE user_id=$1`, [Number(userId)]);
    return rows[0]?.profile || null;
  } catch {
    return null;
  }
}

const LEVEL_TEXT = {
  new: 'has not done this kind of repair with FixBridge before',
  some_experience: 'has completed this kind of repair before',
  experienced: 'has repeatedly completed this kind of repair successfully',
};

/** Prompt text for this homeowner only. Empty when there is no history yet. */
export function personalizationContext(profile, category) {
  if (!profile || !profile.overall) return '';
  const key = String(category || 'other').toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  const c = profile.categories?.[key];
  const lines = [];
  if (c) {
    lines.push(`For ${key.replace(/_/g, ' ')}, this homeowner ${LEVEL_TEXT[c.level] || LEVEL_TEXT.new}${c.diy_success_rate != null ? ` (DIY success ${Math.round(c.diy_success_rate * 100)}% over ${c.diy_attempts} attempts)` : ''}.`);
    if (c.struggled) lines.push(`They have struggled here before (${c.step_failures} failed step${c.step_failures === 1 ? '' : 's'}, ${c.steps_looked_different} that looked different). Add a clear check after each step and say exactly what they should see.`);
    if (c.diagnosis_mismatched > c.diagnosis_matched) lines.push('Past diagnoses in this category were often corrected by a professional: state uncertainty plainly and list what to confirm first.');
  } else if (profile.overall.diy_attempts === 0) {
    lines.push('This homeowner has no completed DIY repairs with FixBridge yet.');
  }
  if (profile.overall.prefers_professional) lines.push('They have usually chosen a professional; present Hire a Professional prominently alongside any DIY option.');
  if (profile.overall.times_stopped_for_safety_or_comfort > 0) lines.push('They have stopped a DIY repair before for safety or comfort; keep the stop conditions prominent.');
  const level = c?.level || 'new';
  lines.push(level === 'experienced'
    ? 'Keep explanations concise for an experienced homeowner.'
    : 'Explain each step in plain words: where the part is, what it looks like, and what "done" looks like.');
  return [
    "THIS HOMEOWNER'S OWN DIY HISTORY (from their FixBridge cases only; use it to adjust explanation and support, not to change safety):",
    ...lines.map((l) => `- ${l}`),
    '- Experience never makes a prohibited or professional-only step acceptable. Every safety rule and guardrail applies unchanged.',
  ].join('\n');
}
