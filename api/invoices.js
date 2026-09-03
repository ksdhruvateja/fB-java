import { brand } from './brand.js';
import { renderEmailLayout } from './email/layout.js';
import { formatCurrency, formatDate } from './email/formatters.js';
import { applyDiscountToAmount } from './discounts.js';
import {
  formatAddressLines,
  structuredFromProperty,
  normalizeBillToAddress,
} from './address-format.js';

function parseJson(val, fallback = null) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '$0.00';
  return `$${v.toFixed(2)}`;
}

function invoiceNumber(jobId) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(Date.now()).slice(-6);
  return `FB-INV-${y}${m}-${jobId}-${t}`;
}

export function normalizePhone(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (raw.startsWith('+') && digits.length >= 10) return `+${digits}`;
  return digits.length >= 10 ? `+${digits}` : '';
}

/**
 * Build a homeowner invoice from managed job + proposal + payments.
 */
export async function buildInvoiceForJob(pool, jobId, { customNote } = {}) {
  const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
  const job = jobs[0];
  if (!job) return { ok: false, message: 'Job not found.' };

  const { rows: hwRows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [job.homeowner_user_id]);
  const homeowner = hwRows[0] || null;

  const { rows: props } = await pool.query(
    `SELECT * FROM proposals WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [jobId]
  );
  const proposal = props[0] || null;

  const { rows: payments } = await pool.query(
    `SELECT * FROM payments WHERE job_id=$1 AND status IN ('succeeded','authorized','paid') ORDER BY created_at ASC`,
    [jobId]
  );

  let lineItems = [];
  if (proposal) {
    const items = parseJson(proposal.customer_line_items, null) || parseJson(proposal.line_items, []);
    if (Array.isArray(items) && items.length) {
      lineItems = items
        .filter((i) => i && i.visible !== false)
        .map((i) => ({
          label: String(i.label || 'Service'),
          amount: Number(i.amount) || 0,
        }));
    }
    if (!lineItems.length) {
      lineItems = [
        {
          label: proposal.scope_summary || job.title || 'Professional service',
          amount: Number(proposal.retail_amount) || 0,
        },
      ];
    }
  } else {
    const low = job.customer_retail_estimate_low != null ? Number(job.customer_retail_estimate_low) : null;
    const high = job.customer_retail_estimate_high != null ? Number(job.customer_retail_estimate_high) : null;
    let amount = high != null ? high : low != null ? low : 0;
    if (job.discount_type && job.discount_value != null && amount > 0) {
      const applied = applyDiscountToAmount(amount, {
        discountType: String(job.discount_type).toLowerCase() === 'amount' ? 'amount' : 'percent',
        value: Number(job.discount_value),
      });
      amount = applied.retail;
    }
    lineItems = [
      {
        label: job.title || 'Service request',
        amount,
      },
    ];
    if (job.discount_code && job.discount_label) {
      lineItems.push({ label: `Discount (${job.discount_code})`, amount: 0, note: job.discount_label });
    }
  }

  const subtotal = lineItems.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const hasVisitCreditLine = lineItems.some((i) => /visit fee credit/i.test(String(i.label || '')));
  const countablePayments = hasVisitCreditLine
    ? payments.filter((p) => p.payment_type !== 'dispatch_fee')
    : payments;
  const paid = countablePayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const visitFeePaid = payments
    .filter((p) => p.payment_type === 'dispatch_fee')
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const amountDue = Math.max(0, Math.round((subtotal - paid) * 100) / 100);

  let propertyAddr = null;
  if (job.property_id) {
    const { rows: propRows } = await pool.query(`SELECT * FROM properties WHERE id=$1`, [job.property_id]);
    if (propRows[0]) propertyAddr = structuredFromProperty(propRows[0]);
  }
  const billTo = normalizeBillToAddress({
    name: job.contact_name || homeowner?.name || 'Homeowner',
    email: homeowner?.email || homeowner?.contact_email || null,
    phone: job.contact_phone || homeowner?.phone || null,
    ...(propertyAddr || {}),
    address: job.full_address || job.city_state_zip || null,
  });

  return {
    ok: true,
    invoice: {
      invoiceNumber: invoiceNumber(jobId),
      jobId: Number(jobId),
      bookingId: job.booking_id || `FB-${jobId}`,
      issuedAt: new Date().toISOString(),
      dueDate: proposal?.quote_valid_until || null,
      billTo,
      homeownerUserId: job.homeowner_user_id ? Number(job.homeowner_user_id) : null,
      jobTitle: job.title,
      jobCategory: job.category,
      lineItems,
      subtotal,
      paid,
      visitFeePaid,
      amountDue,
      payments: payments.map((p) => ({
        type: p.payment_type,
        amount: Number(p.amount),
        status: p.status,
        date: p.created_at,
      })),
      proposalId: proposal ? Number(proposal.id) : null,
      status: job.status,
      customNote: customNote || null,
      company: {
        name: brand.legalName,
        email: brand.supportEmail,
        tagline: brand.tagline,
      },
    },
  };
}

export function renderInvoiceHtml(invoice) {
  const rows = invoice.lineItems
    .map(
      (i) =>
        `<tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee;">${escapeHtml(i.label)}${i.note ? `<br><span style="color:#666;font-size:12px;">${escapeHtml(i.note)}</span>` : ''}</td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums;">${money(i.amount)}</td>
        </tr>`
    )
    .join('');

  const bodyHtml = `
  <table style="width:100%;margin-bottom:16px;font-size:14px;">
    <tr><td><strong>Invoice</strong> ${escapeHtml(invoice.invoiceNumber)}</td>
    <td style="text-align:right;">${new Date(invoice.issuedAt).toLocaleDateString()}</td></tr>
    <tr><td colspan="2" style="padding-top:8px;color:#666;">Booking ${escapeHtml(invoice.bookingId)} · ${escapeHtml(invoice.jobTitle || '')}</td></tr>
  </table>
  <div style="background:#f8f9fb;border-radius:12px;padding:16px;margin-bottom:24px;">
    <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#666;">Bill to</p>
    <p style="margin:0;font-weight:600;">${escapeHtml(invoice.billTo.name)}</p>
    ${invoice.billTo.email ? `<p style="margin:4px 0 0;color:#444;">${escapeHtml(invoice.billTo.email)}</p>` : ''}
    ${invoice.billTo.phone ? `<p style="margin:4px 0 0;color:#444;">${escapeHtml(invoice.billTo.phone)}</p>` : ''}
    ${formatAddressLines(invoice.billTo)
      .map((line) => `<p style="margin:4px 0 0;color:#444;">${escapeHtml(line)}</p>`)
      .join('')}
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead><tr>
      <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #ddd;">Description</th>
      <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #ddd;">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table style="width:100%;margin-top:16px;font-size:14px;">
    <tr><td style="padding:6px 0;color:#666;">Subtotal</td><td style="text-align:right;">${money(invoice.subtotal)}</td></tr>
    ${invoice.visitFeePaid > 0 && !invoice.lineItems.some((i) => /visit fee credit/i.test(String(i.label || '')))
      ? `<tr><td style="padding:6px 0;color:#666;">Visit fee paid</td><td style="text-align:right;color:#0d9488;">−${money(invoice.visitFeePaid)}</td></tr>`
      : ''}
    ${invoice.paid > 0 ? `<tr><td style="padding:6px 0;color:#666;">Payments received</td><td style="text-align:right;color:#0d9488;">−${money(invoice.paid)}</td></tr>` : ''}
    <tr><td style="padding:12px 0;font-size:18px;font-weight:700;">Amount due</td><td style="text-align:right;font-size:18px;font-weight:700;color:${brand.primaryColor};">${money(invoice.amountDue)}</td></tr>
  </table>
  ${invoice.customNote ? `<p style="margin-top:24px;padding:12px;background:#fff7ed;border-radius:8px;font-size:13px;"><strong>Note:</strong> ${escapeHtml(invoice.customNote)}</p>` : ''}`;

  return renderEmailLayout({
    category: 'Invoice',
    headline: 'Your invoice is ready',
    firstName: invoice.billTo?.name,
    paragraphs: ['Your FixBridge invoice is ready to review.'],
    bodyHtml,
    detailsCard: {
      title: 'Invoice Summary',
      rows: [
        { label: 'Invoice', value: invoice.invoiceNumber },
        { label: 'Job', value: invoice.bookingId },
        { label: 'Service', value: invoice.jobTitle || invoice.jobCategory },
        { label: 'Invoice total', value: formatCurrency(invoice.subtotal) },
        { label: 'Amount paid', value: formatCurrency(invoice.paid) },
        { label: 'Balance due', value: formatCurrency(invoice.amountDue) },
        { label: 'Due date', value: formatDate(invoice.dueDate) },
      ],
    },
    cta: invoice.amountDue > 0 ? { label: 'VIEW INVOICE', href: `${(process.env.APP_URL || '').replace(/\/$/, '')}/homeowner?job=${invoice.jobId}` } : undefined,
  });
}

export function renderInvoiceSms(invoice) {
  const lines = invoice.lineItems.slice(0, 3).map((i) => `${i.label}: ${money(i.amount)}`).join(' · ');
  return `${brand.productName} invoice ${invoice.invoiceNumber} for ${invoice.billTo.name}. ${lines}. Amount due: ${money(invoice.amountDue)}. Booking ${invoice.bookingId}. Pay or reply for help.`;
}

export function renderInvoicePlainText(invoice) {
  const items = invoice.lineItems.map((i) => `  - ${i.label}: ${money(i.amount)}`).join('\n');
  return `${invoice.company.name} Invoice ${invoice.invoiceNumber}
Booking: ${invoice.bookingId}
Date: ${new Date(invoice.issuedAt).toLocaleDateString()}

Bill to: ${invoice.billTo.name}
${invoice.billTo.email || ''}
${invoice.billTo.phone || ''}
${formatAddressLines(invoice.billTo).join('\n') || invoice.billTo.address || ''}

Line items:
${items}

Subtotal: ${money(invoice.subtotal)}
${invoice.paid > 0 ? `Paid: −${money(invoice.paid)}\n` : ''}Amount due: ${money(invoice.amountDue)}
${invoice.customNote ? `\nNote: ${invoice.customNote}\n` : ''}
Contact: ${invoice.company.email}`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
