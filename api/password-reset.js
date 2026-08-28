/**
 * Shared password-reset helpers for users (homeowner/contractor/admin) and partners.
 * Tokens are stored as SHA-256 hashes — raw tokens only appear in the email link.
 * Email is sent via direct Gmail SMTP (api/mail.js).
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { brand } from './brand.js';
import { writeAudit } from './audit.js';
import { sendMail } from './mail.js';

export const RESET_ROLES = ['homeowner', 'contractor', 'admin', 'partner'];
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

export function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

export function createRawResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function portalLabelForRole(role) {
  switch (String(role || '').toLowerCase()) {
    case 'homeowner':
      return 'Homeowner';
    case 'contractor':
      return 'Contractor';
    case 'admin':
      return 'Staff';
    case 'partner':
      return 'Partner';
    default:
      return 'Account';
  }
}

export function loginPathHintForRole(role) {
  switch (String(role || '').toLowerCase()) {
    case 'homeowner':
      return 'homeowner sign-in';
    case 'contractor':
      return 'contractor sign-in';
    case 'admin':
      return 'staff sign-in';
    case 'partner':
      return 'partner portal';
    default:
      return 'sign-in';
  }
}

function appOrigin() {
  return String(brand.domain || process.env.APP_URL || 'http://localhost:5000')
    .trim()
    .replace(/\/$/, '');
}

export function buildResetUrl(rawToken, role) {
  return `${appOrigin()}/reset-password?token=${encodeURIComponent(rawToken)}&role=${encodeURIComponent(role)}`;
}

export function buildResetEmailHtml({ userName, resetUrl, role }) {
  const product = brand.productName || 'FixBridge';
  const primary = brand.primaryColor || '#FF4D1C';
  const portal = portalLabelForRole(role);
  const safeName = String(userName || 'there')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
      <div style="padding:28px 32px 24px;">
        <p style="font-weight:800;font-size:20px;letter-spacing:0.04em;color:#111;margin:0 0 20px;">
          ${product}<span style="color:${primary};"></span>
        </p>
        <h1 style="font-size:22px;font-weight:700;color:#111;margin:0 0 12px;">Reset your password</h1>
        <p style="color:#4b5563;font-size:15px;line-height:1.55;margin:0 0 8px;">Hi ${safeName},</p>
        <p style="color:#4b5563;font-size:15px;line-height:1.55;margin:0 0 24px;">
          We received a request to reset the password for your ${product} ${portal.toLowerCase()} account.
        </p>
        <a href="${resetUrl}" style="display:inline-block;background:${primary};color:#fff;padding:14px 28px;text-decoration:none;font-weight:700;font-size:14px;border-radius:12px;">
          Reset Password
        </a>
        <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:28px 0 0;">
          This link will expire in <strong>60 minutes</strong> and can only be used once.
        </p>
        <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:20px 0 0;border-top:1px solid #e5e7eb;padding-top:16px;">
          If you didn&apos;t request this, you can ignore this email. Your password will not change.
        </p>
      </div>
    </div>
  `;
}

/** @returns account object or null */
export async function findResetAccount(pool, role, email) {
  const normalized = String(email || '').trim().toLowerCase();
  const r = String(role || '').toLowerCase();
  if (!normalized || !RESET_ROLES.includes(r)) return null;

  if (r === 'partner') {
    const { rows } = await pool.query(
      `SELECT id, email, name, password_hash FROM partner_users WHERE LOWER(email)=LOWER($1) LIMIT 1`,
      [normalized]
    );
    if (!rows[0]?.password_hash) return null;
    return {
      email: rows[0].email,
      name: rows[0].name || 'Partner',
      userId: null,
      partnerUserId: Number(rows[0].id),
      role: 'partner',
    };
  }

  // Include former social-login accounts so they can set a password via reset.
  const { rows } = await pool.query(
    `SELECT id, email, name, password FROM users
     WHERE role=$1 AND LOWER(email)=LOWER($2)
     LIMIT 1`,
    [r, normalized]
  );
  if (!rows[0]) return null;
  return {
    email: rows[0].email,
    name: rows[0].name || portalLabelForRole(r),
    userId: Number(rows[0].id),
    partnerUserId: null,
    role: r,
  };
}

export async function issuePasswordReset(pool, account, { triggeredByUserId = null } = {}) {
  const rawToken = createRawResetToken();
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  const role = account.role;

  await pool.query(
    `UPDATE password_reset_tokens SET used=true
     WHERE LOWER(email)=LOWER($1) AND role=$2 AND used=false`,
    [account.email, role]
  );
  await pool.query(
    `INSERT INTO password_reset_tokens (email, role, token, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [account.email, role, tokenHash, expiresAt]
  );

  const resetUrl = buildResetUrl(rawToken, role);
  const subject = `Reset your ${brand.productName} password`;
  const html = buildResetEmailHtml({
    userName: account.name,
    resetUrl,
    role,
  });

  const mailed = await sendMail({
    to: account.email,
    subject,
    html,
    text: `Reset your password: ${resetUrl}\nThis link expires in 60 minutes.`,
  });
  if (!mailed.ok) {
    console.log(`\n[${brand.productName}] Password reset link for ${account.email} (${role}):\n${resetUrl}\n`);
  }

  const auditAction = triggeredByUserId
    ? 'password_reset_email_triggered_by_admin'
    : 'password_reset_requested';
  await writeAudit(
    pool,
    triggeredByUserId || account.userId || null,
    auditAction,
    'user',
    account.userId || account.partnerUserId,
    {
      email: account.email,
      role,
      triggeredByAdmin: Boolean(triggeredByUserId),
    }
  );

  return { ok: true, expiresAt, emailed: mailed.ok === true };
}

export async function completePasswordReset(pool, { rawToken, role, password }) {
  const r = String(role || '').toLowerCase();
  if (!RESET_ROLES.includes(r)) {
    return { ok: false, code: 'invalid', message: 'This reset link has expired or is no longer valid.' };
  }
  if (!rawToken || String(password || '').length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      code: 'weak_password',
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  const tokenHash = hashResetToken(rawToken);
  // P0-13: only compare hashed token — never accept the stored hash as the credential
  const { rows } = await pool.query(
    `SELECT * FROM password_reset_tokens
     WHERE role=$1 AND used=false AND expires_at > NOW()
       AND token=$2
     ORDER BY created_at DESC
     LIMIT 1`,
    [r, tokenHash]
  );

  if (!rows.length) {
    return { ok: false, code: 'invalid', message: 'This reset link has expired or is no longer valid.' };
  }

  const row = rows[0];
  const hashed = await bcrypt.hash(password, 10);

  if (r === 'partner') {
    const upd = await pool.query(
      `UPDATE partner_users SET password_hash=$1 WHERE LOWER(email)=LOWER($2) RETURNING id`,
      [hashed, row.email]
    );
    if (!upd.rows.length) {
      return { ok: false, code: 'invalid', message: 'This reset link has expired or is no longer valid.' };
    }
    await pool.query(`UPDATE password_reset_tokens SET used=true WHERE id=$1`, [row.id]);
    await pool.query(
      `UPDATE password_reset_tokens SET used=true WHERE LOWER(email)=LOWER($1) AND role=$2 AND used=false`,
      [row.email, r]
    );
    await writeAudit(pool, Number(upd.rows[0].id), 'password_reset_completed', 'partner_user', upd.rows[0].id, {
      email: row.email,
      role: r,
    });
    return { ok: true, role: r, email: row.email };
  }

  const upd = await pool.query(
    `UPDATE users SET password=$1 WHERE LOWER(email)=LOWER($2) AND role=$3 RETURNING id`,
    [hashed, row.email, r]
  );
  if (!upd.rows.length) {
    return { ok: false, code: 'invalid', message: 'This reset link has expired or is no longer valid.' };
  }

  await pool.query(`UPDATE password_reset_tokens SET used=true WHERE id=$1`, [row.id]);
  await pool.query(
    `UPDATE password_reset_tokens SET used=true WHERE LOWER(email)=LOWER($1) AND role=$2 AND used=false`,
    [row.email, r]
  );

  await writeAudit(pool, Number(upd.rows[0].id), 'password_reset_completed', 'user', upd.rows[0].id, {
    email: row.email,
    role: r,
  });

  return { ok: true, role: r, email: row.email, userId: Number(upd.rows[0].id) };
}
