import { createHash, createHmac, randomUUID } from 'node:crypto';

/*
 * Case photos in object storage (AWS S3, Cloudflare R2, or any S3-compatible service).
 *
 * With MEDIA_STORAGE=s3 the bytes go to the bucket and the database keeps only a reference
 * ("objstore:<key>"). Without it, photos stay in the database as before, so nothing changes until
 * the bucket is configured. The bucket must be private: browsers get short-lived signed links.
 *
 * Settings: MEDIA_STORAGE=s3, S3_BUCKET, S3_REGION (R2: "auto"), S3_ENDPOINT (R2/MinIO; omit for
 * AWS), S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_FORCE_PATH_STYLE (default true when
 * S3_ENDPOINT is set), MEDIA_PRESIGN_TTL_S (default 600).
 *
 * Requests are signed with AWS Signature Version 4 using node:crypto, so no SDK is needed.
 */

export const OBJECT_REF_PREFIX = 'objstore:';
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export function isObjectRef(value) {
  return typeof value === 'string' && value.startsWith(OBJECT_REF_PREFIX);
}

export function objectStorageConfig(env = process.env) {
  if (String(env.MEDIA_STORAGE || '').toLowerCase() !== 's3') return null;
  const cfg = {
    bucket: env.S3_BUCKET,
    region: env.S3_REGION || 'auto',
    endpoint: env.S3_ENDPOINT ? env.S3_ENDPOINT.replace(/\/$/, '') : null,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  };
  cfg.pathStyle = env.S3_FORCE_PATH_STYLE != null ? env.S3_FORCE_PATH_STYLE === 'true' : Boolean(cfg.endpoint);
  if (!cfg.bucket || !cfg.accessKeyId || !cfg.secretAccessKey) {
    throw new Error('MEDIA_STORAGE=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.');
  }
  return cfg;
}

export function objectStorageEnabled() {
  return String(process.env.MEDIA_STORAGE || '').toLowerCase() === 's3';
}

const sha256Hex = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

function encodeRfc3986(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeKeyPath(key) {
  return key.split('/').map(encodeRfc3986).join('/');
}

function target(cfg, key) {
  const path = encodeKeyPath(key);
  if (cfg.endpoint) {
    const u = new URL(cfg.endpoint);
    if (cfg.pathStyle) return { host: u.host, origin: `${u.protocol}//${u.host}`, uri: `/${encodeRfc3986(cfg.bucket)}/${path}` };
    return { host: `${cfg.bucket}.${u.host}`, origin: `${u.protocol}//${cfg.bucket}.${u.host}`, uri: `/${path}` };
  }
  const host = cfg.pathStyle ? `s3.${cfg.region}.amazonaws.com` : `${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;
  return { host, origin: `https://${host}`, uri: cfg.pathStyle ? `/${encodeRfc3986(cfg.bucket)}/${path}` : `/${path}` };
}

function amzDates(now) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function signingKey(cfg, dateStamp) {
  return hmac(hmac(hmac(hmac(`AWS4${cfg.secretAccessKey}`, dateStamp), cfg.region), 's3'), 'aws4_request');
}

/** Header-signed request (PUT/GET/DELETE). Exported for signature tests. */
export function signRequest(cfg, { method, key, body = null, contentType = null, now = new Date() }) {
  const t = target(cfg, key);
  const { amzDate, dateStamp } = amzDates(now);
  const payloadHash = body ? sha256Hex(body) : EMPTY_SHA256;
  const headers = { host: t.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  if (contentType) headers['content-type'] = contentType;
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${String(headers[n]).trim()}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [method, t.uri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = createHmac('sha256', signingKey(cfg, dateStamp)).update(stringToSign).digest('hex');
  return {
    url: `${t.origin}${t.uri}`,
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

/** Pre-signed GET link (query-string signature). Exported for signature tests. */
export function presignGet(cfg, key, { expiresIn = Number(process.env.MEDIA_PRESIGN_TTL_S || 600), now = new Date(), extraQuery = {} } = {}) {
  const t = target(cfg, key);
  const { amzDate, dateStamp } = amzDates(now);
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const query = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    // As in the official AWS SDK presigner: the body of a GET is not signed.
    'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
    'X-Amz-Credential': `${cfg.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(Math.max(1, Math.min(604800, Math.floor(expiresIn)))),
    'X-Amz-SignedHeaders': 'host',
    ...extraQuery,
  };
  // Sorted by byte value, as SigV4 requires.
  const canonicalQuery = Object.keys(query).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(query[k])}`).join('&');
  const canonicalRequest = ['GET', t.uri, canonicalQuery, `host:${t.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = createHmac('sha256', signingKey(cfg, dateStamp)).update(stringToSign).digest('hex');
  return `${t.origin}${t.uri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

async function s3Fetch(cfg, args) {
  const signed = signRequest(cfg, args);
  const res = await fetch(signed.url, {
    method: args.method,
    headers: Object.fromEntries(Object.entries(signed.headers).filter(([k]) => k !== 'host')),
    body: args.body || undefined,
  });
  if (!res.ok && !(args.method === 'DELETE' && res.status === 404)) {
    const text = await res.text().catch(() => '');
    throw Object.assign(new Error(`Object storage ${args.method} failed (${res.status})`), { status: res.status, detail: text.slice(0, 300) });
  }
  return res;
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };

/** Uploads a data URL; returns the reference to store in the database. */
export async function putDataUrl(dataUrl, { prefix }) {
  const cfg = objectStorageConfig();
  const m = String(dataUrl || '').match(/^data:([^;,]+);base64,(.*)$/s);
  if (!m) throw new Error('Not a base64 data URL.');
  const contentType = m[1].toLowerCase();
  const body = Buffer.from(m[2], 'base64');
  const key = `${prefix.replace(/^\/+|\/+$/g, '')}/${randomUUID()}.${EXT[contentType] || 'bin'}`;
  await s3Fetch(cfg, { method: 'PUT', key, body, contentType });
  return `${OBJECT_REF_PREFIX}${key}`;
}

export async function getObject(ref) {
  const cfg = objectStorageConfig();
  const key = ref.slice(OBJECT_REF_PREFIX.length);
  const res = await s3Fetch(cfg, { method: 'GET', key });
  return { body: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') || 'application/octet-stream' };
}

export async function deleteObject(ref) {
  const cfg = objectStorageConfig();
  await s3Fetch(cfg, { method: 'DELETE', key: ref.slice(OBJECT_REF_PREFIX.length) });
}

export function presignedUrlForRef(ref, opts) {
  return presignGet(objectStorageConfig(), ref.slice(OBJECT_REF_PREFIX.length), opts);
}

/**
 * Returns a data URL for the AI pipeline: data URLs pass through, object references are fetched.
 * Unreadable media returns null (the assessment continues without that photo).
 */
export async function resolveMediaDataUrl(value) {
  if (!value) return null;
  if (!isObjectRef(value)) return value;
  try {
    const obj = await getObject(value);
    return `data:${obj.contentType};base64,${obj.body.toString('base64')}`;
  } catch (e) {
    console.warn('[object-storage] read failed', e?.status || e?.message);
    return null;
  }
}

/**
 * Moves a stored data URL into the bucket. Returns the new reference, or the input unchanged
 * when object storage is off or the value is not a data URL.
 */
export async function offloadDataUrl(value, prefix) {
  if (!objectStorageEnabled() || typeof value !== 'string' || !value.startsWith('data:')) return value;
  return putDataUrl(value, { prefix });
}
