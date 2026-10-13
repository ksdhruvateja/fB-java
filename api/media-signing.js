import { createHmac, timingSafeEqual } from 'node:crypto';

/*
 * Short-lived signed links for case photos, so lists can show a photo without sending its bytes
 * in the JSON. A link names one job, expires (default 1 hour) and cannot be altered.
 */

function key() {
  const secret = process.env.MEDIA_SIGNING_SECRET || process.env.SESSION_SECRET || 'local-dev-secret';
  return createHmac('sha256', secret).update('fixbridge-media-v1').digest();
}

function sign(kind, id, exp) {
  return createHmac('sha256', key()).update(`${kind}:${id}:${exp}`).digest('base64url');
}

export function signedMediaUrl(kind, id, { ttlSeconds = Number(process.env.MEDIA_URL_TTL_S || 3600) } = {}) {
  // Rounded so the same link is reused (and cached by the browser) for a while.
  const exp = Math.ceil((Date.now() / 1000 + ttlSeconds) / 300) * 300;
  return `/api/media/${kind}/${id}?exp=${exp}&sig=${sign(kind, id, exp)}`;
}

export function verifyMediaSignature(kind, id, exp, sig) {
  const e = Number(exp);
  if (!Number.isFinite(e) || e < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(kind, id, e));
  const given = Buffer.from(String(sig || ''));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function decodeDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;,]+);base64,(.*)$/s);
  if (!m) return null;
  return { contentType: m[1].toLowerCase(), body: Buffer.from(m[2], 'base64') };
}
