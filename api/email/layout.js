/**
 * FixBridge branded email layout — table-based, inline CSS, ~600px max width.
 */
import { EMAIL_COLORS, EMAIL_LEGAL_LINKS, EMAIL_SUPPORT, emailLogoUrl } from './email-config.js';
import { escapeHtml, greetingLine } from './formatters.js';

const LAYOUT_MARKER = 'data-fixbridge-email-layout="1"';

export function isBrandedEmail(html) {
  return String(html || '').includes(LAYOUT_MARKER);
}

export function renderButton({ label, href }) {
  if (!href || !label) return '';
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 8px;">
      <tr>
        <td align="center" bgcolor="${EMAIL_COLORS.primary}" style="border-radius:10px;">
          <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;letter-spacing:0.03em;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

export function renderDetailsCard({ title, rows = [] }) {
  const filtered = rows.filter((r) => r && r.label);
  if (!filtered.length) return '';
  const rowHtml = filtered
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${EMAIL_COLORS.muted};vertical-align:top;width:38%;">${escapeHtml(r.label)}</td>
        <td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${EMAIL_COLORS.text};vertical-align:top;font-weight:600;">${escapeHtml(r.value)}</td>
      </tr>`
    )
    .join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background:${EMAIL_COLORS.cardBg};border:1px solid ${EMAIL_COLORS.border};border-radius:12px;">
      <tr>
        <td style="padding:18px 20px;">
          ${title ? `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${EMAIL_COLORS.muted};">${escapeHtml(title)}</p>` : ''}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rowHtml}</table>
        </td>
      </tr>
    </table>`;
}

function renderFooter() {
  const year = new Date().getFullYear();
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;border-top:1px solid ${EMAIL_COLORS.border};">
      <tr>
        <td style="padding:24px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:${EMAIL_COLORS.muted};text-align:center;">
          <p style="margin:0 0 8px;font-weight:700;color:${EMAIL_COLORS.text};">Need help?</p>
          <p style="margin:0 0 16px;">Reply to this email or contact us at <a href="mailto:${EMAIL_SUPPORT}" style="color:${EMAIL_COLORS.primary};text-decoration:none;">${EMAIL_SUPPORT}</a>.</p>
          <p style="margin:0 0 4px;font-weight:700;color:${EMAIL_COLORS.text};">FixBridge</p>
          <p style="margin:0 0 16px;">Home services, coordinated simply.</p>
          <p style="margin:0 0 16px;font-size:12px;">
            <a href="${EMAIL_LEGAL_LINKS.terms}" style="color:${EMAIL_COLORS.muted};text-decoration:underline;">Terms</a>
            &nbsp;|&nbsp;
            <a href="${EMAIL_LEGAL_LINKS.privacy}" style="color:${EMAIL_COLORS.muted};text-decoration:underline;">Privacy</a>
            &nbsp;|&nbsp;
            <a href="${EMAIL_LEGAL_LINKS.visitCancellation}" style="color:${EMAIL_COLORS.muted};text-decoration:underline;">Visit &amp; Cancellation Policy</a>
          </p>
          <p style="margin:0;font-size:11px;color:#9CA3AF;">&copy; ${year} FixBridge. All rights reserved.</p>
        </td>
      </tr>
    </table>`;
}

function renderHeader({ category } = {}) {
  const logo = emailLogoUrl();
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding:28px 24px 20px;">
          <img src="${escapeHtml(logo)}" width="180" alt="FixBridge" style="display:block;max-width:180px;width:180px;height:auto;border:0;outline:none;text-decoration:none;" />
          ${category ? `<p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${EMAIL_COLORS.muted};">${escapeHtml(category)}</p>` : ''}
        </td>
      </tr>
    </table>`;
}

/**
 * @param {object} opts
 * @param {string} [opts.category]
 * @param {string} [opts.headline]
 * @param {string} [opts.firstName]
 * @param {string[]} [opts.paragraphs]
 * @param {string} [opts.bodyHtml] - additional safe HTML fragment
 * @param {object} [opts.detailsCard]
 * @param {object} [opts.cta]
 * @param {string} [opts.afterCtaHtml]
 */
export function renderEmailLayout({
  category,
  headline,
  firstName,
  paragraphs = [],
  bodyHtml = '',
  detailsCard,
  cta,
  afterCtaHtml = '',
} = {}) {
  const greeting = greetingLine(firstName);
  const paraHtml = paragraphs
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${EMAIL_COLORS.text};">${p}</p>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(headline || 'FixBridge')}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;" ${LAYOUT_MARKER}>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F4F6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${EMAIL_COLORS.white};border:1px solid ${EMAIL_COLORS.border};border-radius:16px;overflow:hidden;">
          <tr><td>
            ${renderHeader({ category })}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:0 28px 28px;">
                  ${headline ? `<h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:${EMAIL_COLORS.text};">${escapeHtml(headline)}</h1>` : ''}
                  <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${EMAIL_COLORS.text};">${escapeHtml(greeting)}</p>
                  ${paraHtml}
                  ${bodyHtml || ''}
                  ${detailsCard ? renderDetailsCard(detailsCard) : ''}
                  ${cta ? renderButton(cta) : ''}
                  ${afterCtaHtml || ''}
                  ${renderFooter()}
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return html;
}

export function renderPlainText({
  headline,
  firstName,
  paragraphs = [],
  detailsCard,
  cta,
  afterCtaText = '',
} = {}) {
  const lines = [];
  if (headline) lines.push(headline, '');
  lines.push(greetingLine(firstName), '');
  for (const p of paragraphs.filter(Boolean)) {
    lines.push(stripHtml(p), '');
  }
  if (detailsCard?.rows?.length) {
    if (detailsCard.title) lines.push(detailsCard.title.toUpperCase(), '');
    for (const r of detailsCard.rows) {
      if (r?.label) lines.push(`${r.label}: ${r.value || '—'}`);
    }
    lines.push('');
  }
  if (cta?.label && cta?.href) {
    lines.push(`${cta.label}: ${cta.href}`, '');
  }
  if (afterCtaText) lines.push(stripHtml(afterCtaText), '');
  lines.push(
    '—',
    'Need help?',
    `Reply to this email or contact ${EMAIL_SUPPORT}.`,
    '',
    'FixBridge',
    'Home services, coordinated simply.',
    '',
    `Terms: ${EMAIL_LEGAL_LINKS.terms}`,
    `Privacy: ${EMAIL_LEGAL_LINKS.privacy}`,
    `Visit & Cancellation Policy: ${EMAIL_LEGAL_LINKS.visitCancellation}`,
    '',
    `© ${new Date().getFullYear()} FixBridge. All rights reserved.`
  );
  return lines.join('\n').trim();
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** Wrap legacy inline HTML in the branded shell. */
export function wrapLegacyEmail({ subject, html, text, firstName } = {}) {
  if (isBrandedEmail(html)) {
    return { html, text: text || stripHtml(html) };
  }
  const bodyHtml = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${EMAIL_COLORS.text};">${html || ''}</div>`;
  const wrappedHtml = renderEmailLayout({
    headline: subject,
    firstName,
    bodyHtml,
  });
  const wrappedText = text || renderPlainText({
    headline: subject,
    firstName,
    paragraphs: [stripHtml(html)],
  });
  return { html: wrappedHtml, text: wrappedText };
}
