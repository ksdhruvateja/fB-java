/**
 * Central FixBridge email identity and asset configuration.
 */
import { brand } from '../brand.js';

export const EMAIL_FROM_NAME = process.env.FIXBRIDGE_FROM_NAME?.trim() || 'FixBridge Support';
export const EMAIL_FROM_ADDRESS = process.env.FIXBRIDGE_FROM_EMAIL?.trim() || 'support@fixbridge.us';
export const EMAIL_REPLY_TO = process.env.FIXBRIDGE_REPLY_TO_EMAIL?.trim() || 'support@fixbridge.us';

export function emailFromHeader() {
  const legacy = (process.env.FROM_EMAIL || '').trim();
  if (legacy && legacy.includes('@') && !legacy.toLowerCase().includes('gmail.com')) {
    return legacy;
  }
  return `${EMAIL_FROM_NAME} <${EMAIL_FROM_ADDRESS}>`;
}

export function appBaseUrl() {
  return (process.env.APP_URL || process.env.URL || brand.domain || 'https://fixbridge.netlify.app')
    .trim()
    .replace(/\/$/, '');
}

export function emailLogoUrl() {
  const configured = (process.env.FIXBRIDGE_EMAIL_LOGO_URL || '').trim();
  if (configured) return configured;
  const base = appBaseUrl();
  if (base && !/localhost|127\.0\.0\.1/i.test(base)) {
    return `${base}/fixbridge-logo-lockup.png`;
  }
  return 'https://fixbridge.netlify.app/fixbridge-logo-lockup.png';
}

export const EMAIL_LEGAL_LINKS = {
  terms: `${appBaseUrl()}/legal/terms`,
  privacy: `${appBaseUrl()}/legal/privacy`,
  visitCancellation: `${appBaseUrl()}/legal/visit-cancellation`,
};

export const EMAIL_COLORS = {
  primary: brand.primaryColor || '#FF4D1C',
  text: '#111827',
  muted: '#6B7280',
  border: '#E5E7EB',
  cardBg: '#F9FAFB',
  white: '#FFFFFF',
};

export const EMAIL_SUPPORT = EMAIL_REPLY_TO;
