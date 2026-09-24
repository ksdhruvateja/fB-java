/**
 * FixBridge email system smoke tests.
 * Usage: node scripts/smoke-email.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  emailFromHeader,
  EMAIL_REPLY_TO,
  emailLogoUrl,
} from '../api/email/email-config.js';
import { listEmailTemplates, renderEmailTemplate } from '../api/email/templates.js';
import { isBrandedEmail } from '../api/email/layout.js';
import { sendFixBridgeEmail } from '../api/email/send-fixbridge-email.js';
import { greetingLine, formatCurrency, formatDate, safeName } from '../api/email/formatters.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '_email-preview');

let passed = 0;
let failed = 0;

function ok(label, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const CORE_TEMPLATES = [
  'homeowner_welcome',
  'password_reset',
  'service_request_received',
  'ai_assessment_ready',
  'professional_request_confirmation',
  'quote_ready',
  'invoice_ready',
  'payment_confirmation',
  'payment_failed',
  'refund_issued',
  'job_completed',
  'support_ticket_created',
  'contractor_application_received',
  'job_invitation',
  'stripe_connect_onboarding',
  'payout_released',
  'payout_failed',
  'partner_referral_update',
];

function sampleData(templateId) {
  const base = {
    firstName: 'Maria',
    jobNumber: 'FB-1048',
    jobId: 1048,
    service: 'Plumbing',
    property: '123 Main St\nDallas, TX 75201',
    viewUrl: 'https://fixbridge.netlify.app/homeowner?job=1048',
    quoteNumber: 'FB-Q-1048',
    customerTotal: 1250,
    invoiceNumber: 'FB-INV-1048',
    invoiceTotal: 1250,
    amountPaid: 250,
    balanceDue: 1000,
    amount: 250,
    paymentDate: new Date().toISOString(),
    resetUrl: 'https://fixbridge.netlify.app/reset-password?token=sample',
    code: '123456',
    status: 'Received',
    message: 'Sample notification message.',
  };
  if (templateId === 'password_reset') {
    return { ...base, portalLabel: 'Homeowner' };
  }
  return base;
}

async function main() {
  console.log('\nFixBridge email system smoke\n');

  ok('Default sender', emailFromHeader().includes('support@fixbridge.us'), emailFromHeader());
  ok('Reply-To', EMAIL_REPLY_TO === 'support@fixbridge.us', EMAIL_REPLY_TO);
  ok('Logo URL is HTTPS', /^https:\/\//.test(emailLogoUrl()), emailLogoUrl());
  ok('Logo URL not localhost', !/localhost/i.test(emailLogoUrl()));

  ok('safeName handles undefined', safeName(undefined) === 'Hello');
  ok('formatCurrency', formatCurrency(1250) === '$1,250.00');
  ok('formatDate invalid', formatDate('not-a-date') === '—');

  const rendered = renderEmailTemplate('password_reset', sampleData('password_reset'));
  ok('HTML render', Boolean(rendered.html) && rendered.html.length > 500);
  ok('Plain-text render', Boolean(rendered.text) && rendered.text.includes('RESET PASSWORD'));
  ok('Branded layout marker', isBrandedEmail(rendered.html));
  ok('HTML includes logo img', rendered.html.includes('<img'));
  ok('HTML includes support footer', rendered.html.includes('support@fixbridge.us'));
  ok('No undefined in HTML', !/undefined|null|NaN/i.test(rendered.html));

  for (const id of CORE_TEMPLATES) {
    const all = listEmailTemplates();
    ok(`Template registered: ${id}`, all.includes(id));
    const out = renderEmailTemplate(id, sampleData(id));
    ok(`Render ${id}`, isBrandedEmail(out.html) && out.text.length > 80);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const previewPath = path.join(outDir, 'password-reset.html');
  fs.writeFileSync(previewPath, rendered.html, 'utf8');
  ok('Preview file written', fs.existsSync(previewPath), previewPath);

  const sim = await sendFixBridgeEmail({
    to: 'preview@example.com',
    template: 'homeowner_welcome',
    data: sampleData('homeowner_welcome'),
  });
  ok('Send simulation (no throw)', sim != null, sim.simulated ? 'simulated' : 'sent');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
