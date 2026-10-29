/**
 * Commercial sign-in. Commercial tokens are signed with their own key and carry their own scope,
 * so a homeowner, contractor or marketplace-admin token is never accepted here (and the other way
 * round: the main site's key differs, so these tokens fail there).
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { getDerivedSecret } from '../runtime-env.js';

const USER_SCOPE = 'fixbridge-commercial-user';
const ADMIN_SCOPE = 'fixbridge-commercial-admin';

function signingKey() {
  const base = getDerivedSecret('COMMERCIAL_SESSION_SECRET');
  return crypto.createHmac('sha256', base).update('fixbridge-commercial-v1').digest('hex');
}

export function makeCommercialUserToken(user) {
  return jwt.sign({ scope: USER_SCOPE, uid: user.id, cid: user.company_id }, signingKey(), { expiresIn: '12h' });
}

export function makeCommercialAdminToken(admin) {
  return jwt.sign({ scope: ADMIN_SCOPE, aid: admin.id }, signingKey(), { expiresIn: '8h' });
}

function bearer(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function verify(req, scope) {
  const token = bearer(req);
  if (!token) return null;
  try {
    const payload = jwt.verify(token, signingKey(), { algorithms: ['HS256'] });
    return payload?.scope === scope ? payload : null;
  } catch {
    return null;
  }
}

/** Loads the signed-in commercial user into req.cuser. Inactive users and companies are refused. */
export function requireCommercialUser(pool) {
  return async (req, res, next) => {
    const payload = verify(req, USER_SCOPE);
    if (!payload) return res.status(401).json({ ok: false, message: 'Please sign in to FixBridge Commercial.' });
    try {
      const { rows } = await pool.query(
        `SELECT u.*, c.status AS company_status
           FROM commercial_users u JOIN commercial_companies c ON c.id = u.company_id
          WHERE u.id = $1 AND u.company_id = $2`,
        [payload.uid, payload.cid]
      );
      const user = rows[0];
      if (!user || !user.active || !user.password_hash) {
        return res.status(401).json({ ok: false, message: 'This account is not active.' });
      }
      if (user.company_status === 'suspended' || user.company_status === 'cancelled') {
        return res.status(403).json({ ok: false, message: 'This company account is not active. Contact FixBridge.' });
      }
      req.cuser = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireCommercialAdmin(pool) {
  return async (req, res, next) => {
    const payload = verify(req, ADMIN_SCOPE);
    if (!payload) return res.status(401).json({ ok: false, message: 'Commercial admin sign-in required.' });
    try {
      const { rows } = await pool.query('SELECT id, email, name, active FROM commercial_admins WHERE id=$1', [payload.aid]);
      if (!rows[0]?.active) return res.status(401).json({ ok: false, message: 'Commercial admin sign-in required.' });
      req.cadmin = rows[0];
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const isOffice = (user) => user?.role === 'owner' || user?.role === 'office';
export const canSeeMoney = (user) => isOffice(user) || Boolean(user?.can_view_financials);

/** One-time invite/set-password token; only its hash is stored. */
export function newInviteToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token), expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) };
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

/** Short-lived signed links for job photos and files. */
export function signedFileUrl(id, ttlSeconds = 3600) {
  const exp = Math.ceil((Date.now() / 1000 + ttlSeconds) / 300) * 300;
  return `/api/commercial/files/${id}?exp=${exp}&sig=${fileSignature(id, exp)}`;
}

function fileSignature(id, exp) {
  return crypto.createHmac('sha256', signingKey()).update(`file:${id}:${exp}`).digest('base64url');
}

export function verifyFileSignature(id, exp, sig) {
  const e = Number(exp);
  if (!Number.isFinite(e) || e < Date.now() / 1000) return false;
  const expected = Buffer.from(fileSignature(id, e));
  const given = Buffer.from(String(sig || ''));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
