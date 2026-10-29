/**
 * Dev-only email template preview generator.
 * Usage: node scripts/email-preview.mjs [templateId]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listEmailTemplates, renderEmailTemplate } from '../api/email/templates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '_email-preview');
const templateId = process.argv[2] || 'password_reset';

const sample = {
  firstName: 'Maria',
  jobNumber: 'FB-1048',
  jobId: 1048,
  service: 'Plumbing',
  property: '123 Main St\nDallas, TX 75201',
  viewUrl: 'https://fixbridge.netlify.app/homeowner?job=1048',
  quoteNumber: 'FB-Q-1048',
  customerTotal: 1250,
  resetUrl: 'https://fixbridge.netlify.app/reset-password?token=sample',
  portalLabel: 'Homeowner',
  code: '123456',
};

fs.mkdirSync(outDir, { recursive: true });

const ids = templateId === 'all' ? listEmailTemplates() : [templateId];
for (const id of ids) {
  const rendered = renderEmailTemplate(id, sample);
  const htmlPath = path.join(outDir, `${id}.html`);
  const txtPath = path.join(outDir, `${id}.txt`);
  fs.writeFileSync(htmlPath, rendered.html, 'utf8');
  fs.writeFileSync(txtPath, rendered.text, 'utf8');
  console.log(`Wrote ${htmlPath}`);
}

console.log(`\nOpen files in ${outDir} to preview emails.`);
