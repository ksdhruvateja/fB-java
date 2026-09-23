/**
 * Shared security helpers for the FixBridge API.
 */

import { railwayPublicOrigin } from './hosting.js';

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

/** Build allowed CORS origin list from APP_URL + optional CORS_ORIGINS. */
export function getAllowedOrigins() {
  const fromEnv = [
    process.env.APP_URL,
    process.env.URL, // Netlify
    process.env.DEPLOY_PRIME_URL,
    process.env.RAILWAY_STATIC_URL,
    railwayPublicOrigin(),
    process.env.CORS_ORIGINS,
  ]
    .filter(Boolean)
    .flatMap((v) => String(v).split(','))
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const list = new Set(fromEnv);
  if (process.env.NODE_ENV !== 'production') {
    DEFAULT_DEV_ORIGINS.forEach((o) => list.add(o));
  }
  return list;
}

export function corsOriginDelegate(origin, callback) {
  // Non-browser clients (curl, server-to-server, same-origin proxy) may omit Origin.
  if (!origin) return callback(null, true);

  const allowed = getAllowedOrigins();
  // If no allowlist configured in production yet, allow same-site requests only via empty Origin;
  // still reject unknown browser origins when APP_URL is set.
  if (allowed.size === 0) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[security] APP_URL / CORS_ORIGINS not set; rejecting cross-origin request.');
      return callback(null, false);
    }
    return callback(null, true);
  }

  const normalized = origin.replace(/\/$/, '');
  if (allowed.has(normalized)) return callback(null, true);
  return callback(null, false);
}

/** Standard browser security headers (helmet-lite). */
export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // GIS popups need this; same-origin blanks the Google account chooser.
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    // Light CSP: Stripe Checkout + Google Identity Services. Avoid breaking either.
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data: https:",
        "style-src 'self' 'unsafe-inline' https:",
        "script-src 'self' 'unsafe-inline' https://js.stripe.com https://cdn.jsdelivr.net https://accounts.google.com https://apis.google.com",
        "connect-src 'self' https://api.stripe.com https://*.stripe.com https://*.neon.tech https://accounts.google.com https://*.googleapis.com https:",
        "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://accounts.google.com https://*.google.com",
      ].join('; ')
    );
  }
  // API responses should not be cached by shared caches.
  if (_req.path && _req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
}

/** Strip stack / internal details from client-facing errors in production. */
export function publicErrorMessage(err, fallback = 'Server error') {
  if (process.env.NODE_ENV !== 'production') {
    return err?.message || fallback;
  }
  return fallback;
}

/** Clamp and sanitize free-text input. */
export function clampString(value, max = 2000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export function isPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}
