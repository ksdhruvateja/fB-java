/**
 * Admin professional quote / invoice workspace routes.
 * Extends proposals + homeowner_invoices without changing unrelated job logic.
 */
import { brand } from './brand.js';
import {
  computeQuoteTotals,
  displayQuoteStatus,
  ensureFbiNumber,
  money,
  normalizeLineItems,
  parseJson,
  upgradeLegacyLineItems,
} from './quote-document.js';
import { sendEmailSafe, sendSmsSafe, smsConfigured } from './notify.js';
import { normalizePhone, renderInvoiceHtml } from './invoices.js';
import { assertPaymentsAvailable, createCheckoutSession, appBaseUrl } from './stripe.js';
import { calculateCustomerPaymentTotal, dollarsToCents } from './financial-calculations.js';
import { recordPendingTip } from './tips.js';
import { processSuccessfulPayment } from './payment-settlement.js';
import { isAdminRole, isHomeownerOwner } from './auth-helpers.js';
import { formatAddressLines, normalizeBillToAddress } from './address-format.js';

async function audit(pool, actorUserId, action, entityType, entityId, detail) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, detail)
       VALUES ($1,$2,$3,$4,$5)`,
      [actorUserId || null, action, entityType, String(entityId), JSON.stringify(detail || {})]
    );
  } catch {
    /* non-fatal */
  }
}

async function logQuoteActivity(pool, {
  proposalId = null,
  invoiceId = null,
  jobId = null,
  actorUserId = null,
  action,
  detail = {},
}) {
  await pool.query(
    `INSERT INTO quote_activity (proposal_id, invoice_id, job_id, actor_user_id, action, detail)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [proposalId, invoiceId, jobId, actorUserId, action, JSON.stringify(detail || {})]
  );
}

function quoteSelectSql(whereSql = 'WHERE p.id = $1') {
  return `
    SELECT p.*,
           j.booking_id,
           j.title AS job_title,
           j.category AS job_category,
           j.zip AS job_zip,
           j.description AS job_description,
           j.full_address AS job_address,
           j.street_address AS job_street,
           j.city_state_zip AS job_city_state_zip,
           j.contact_name AS job_contact_name,
           j.contact_phone AS job_contact_phone,
           j.property_id AS job_property_id,
           j.status AS job_status,
           j.homeowner_user_id,
           j.assigned_contractor_user_id,
           j.discount_code AS job_discount_code,
           j.discount_label AS job_discount_label,
           j.discount_type AS job_discount_type,
           j.discount_value AS job_discount_value,
           hw.name AS homeowner_name,
           hw.email AS homeowner_email,
           hw.phone AS homeowner_phone,
           ct.name AS contractor_name,
           ct.email AS contractor_email,
           ct.phone AS contractor_phone,
           ct.trade AS contractor_trade,
           ct.name AS contractor_company,
           cr.name AS created_by_name,
           inv.id AS linked_invoice_id,
           inv.invoice_number AS linked_invoice_number,
           inv.status AS linked_invoice_status,
           inv.amount_due AS linked_invoice_amount_due,
           inv.paid AS linked_invoice_paid,
           inv.stripe_payment_link_url AS linked_payment_link
    FROM proposals p
    JOIN managed_jobs j ON j.id = p.job_id
    LEFT JOIN users hw ON hw.id = j.homeowner_user_id
    LEFT JOIN bids b ON b.id = p.bid_id
    LEFT JOIN users ct ON ct.id = COALESCE(j.assigned_contractor_user_id, b.contractor_user_id)
    LEFT JOIN users cr ON cr.id = p.created_by
    LEFT JOIN homeowner_invoices inv ON inv.id = p.converted_invoice_id
    ${whereSql}
  `;
}

function serializeQuoteDocument(row) {
  const legacyItems = parseJson(row.customer_line_items, []) || [];
  const lineItems = upgradeLegacyLineItems(legacyItems);
  const additionalCharges = parseJson(row.additional_charges, []) || [];
  const discountType = row.discount_type || (Number(row.admin_discount) > 0 ? 'fixed' : 'none');
  const discountValue =
    row.discount_value != null
      ? Number(row.discount_value)
      : Number(row.admin_discount) || 0;
  const totals = computeQuoteTotals({
    lineItems,
    discountType,
    discountValue,
    shippingAmount: row.shipping_amount,
    additionalCharges,
    taxMode: row.tax_mode,
    taxValue: row.tax_value,
  });

  const billTo =
    parseJson(row.bill_to, null) ||
    {
      name: row.job_contact_name || row.homeowner_name || 'Homeowner',
      companyName: row.company_name || null,
      email: row.homeowner_email || null,
      phone: row.job_contact_phone || row.homeowner_phone || null,
      street: row.job_street || row.job_address || null,
      cityStateZip: row.job_city_state_zip || row.job_zip || null,
      address: row.job_address || row.job_city_state_zip || null,
    };

  const status = displayQuoteStatus(row.status);

  return {
    id: Number(row.id),
    quoteNumber: row.quote_number || `FBQ-${String(row.id).padStart(5, '0')}`,
    jobId: Number(row.job_id),
    bidId: row.bid_id != null ? Number(row.bid_id) : null,
    status,
    rawStatus: row.status,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    approvedAt: row.approved_at,
    viewedAt: row.viewed_at,
    quoteValidUntil: row.quote_valid_until,
    lockedAt: row.locked_at,
    bookingId: row.booking_id || null,
    jobTitle: row.job_title || null,
    jobCategory: row.job_category || null,
    jobZip: row.job_zip || null,
    jobAddress: row.job_address || null,
    jobStatus: row.job_status || null,
    propertyId: row.job_property_id != null ? Number(row.job_property_id) : null,
    homeownerName: row.homeowner_name || null,
    homeownerEmail: row.homeowner_email || null,
    homeownerPhone: row.homeowner_phone || null,
    homeownerUserId: row.homeowner_user_id != null ? Number(row.homeowner_user_id) : null,
    contractorName: row.contractor_name || null,
    contractorEmail: row.contractor_email || null,
    contractorPhone: row.contractor_phone || null,
    contractorCompany: row.contractor_company || row.contractor_name || null,
    contractorTrade: row.contractor_trade || null,
    createdByName: row.created_by_name || null,
    createdById: row.created_by != null ? Number(row.created_by) : null,
    billTo,
    companyName: row.company_name || null,
    lineItems: totals.lineItems,
    discountType,
    discountValue,
    discountAmount: totals.discountAmount,
    discountReason: row.admin_discount_reason || null,
    couponCode: row.coupon_code || null,
    jobCoupon: row.job_discount_code
      ? {
          code: String(row.job_discount_code),
          label: row.job_discount_label || null,
          discountType:
            String(row.job_discount_type || '').toLowerCase() === 'amount' ||
            String(row.job_discount_type || '').toLowerCase() === 'fixed'
              ? 'fixed'
              : 'percent',
          value: Number(row.job_discount_value) || 0,
        }
      : null,
    shippingAmount: totals.shippingAmount,
    shippingLabel: row.shipping_label || 'Shipping / Delivery',
    additionalCharges: totals.additionalCharges,
    taxMode: row.tax_mode || 'none',
    taxValue: row.tax_value != null ? Number(row.tax_value) : 0,
    taxAmount: totals.taxAmount,
    subtotal: totals.subtotal,
    total: totals.total,
    retailAmount: Number(row.retail_amount) || totals.total,
    depositAmount: row.deposit_amount != null ? Number(row.deposit_amount) : null,
    customerNotes:
      row.customer_notes ||
      'Thank you for choosing FixBridge.\nThis quote includes labor and materials listed above.',
    termsConditions:
      row.terms_conditions ||
      'Quote valid for 7 days.\nAdditional work requires separate approval.',
    internalNotes: row.internal_notes || null,
    scopeSummary: row.scope_summary || null,
    timeline: row.timeline || null,
    warranty: row.warranty || null,
    exclusions: row.exclusions || null,
    contractorNet: row.contractor_net != null ? Number(row.contractor_net) : null,
    contractorQuoteAmount:
      row.contractor_quote_amount != null
        ? Number(row.contractor_quote_amount)
        : row.contractor_net != null
          ? Number(row.contractor_net)
          : null,
    contractorNotes: row.contractor_notes || null,
    contractorSpecialConditions: row.contractor_special_conditions || null,
    serviceCharge: row.service_charge != null ? Number(row.service_charge) : null,
    invoice: row.linked_invoice_id
      ? {
          id: Number(row.linked_invoice_id),
          invoiceNumber: row.linked_invoice_number,
          status: row.linked_invoice_status || 'draft',
          amountDue: row.linked_invoice_amount_due != null ? Number(row.linked_invoice_amount_due) : null,
          paid: row.linked_invoice_paid != null ? Number(row.linked_invoice_paid) : 0,
          paymentLink: row.linked_payment_link || null,
        }
      : null,
    brand: {
      name: brand.productName,
      legalName: brand.legalName,
      supportEmail: brand.supportEmail,
      primaryColor: brand.primaryColor,
    },
  };
}

function serializeInvoiceRow(row) {
  const lineItems = upgradeLegacyLineItems(parseJson(row.line_items, []) || []);
  const additionalCharges = parseJson(row.additional_charges, []) || [];
  const totals = computeQuoteTotals({
    lineItems,
    discountType: row.discount_type,
    discountValue: row.discount_value,
    shippingAmount: row.shipping_amount,
    additionalCharges,
    taxMode: row.tax_mode,
    taxValue: row.tax_value,
  });
  const paid = Number(row.paid) || 0;
  const total = row.total != null ? Number(row.total) : totals.total;
  const amountDue = total <= 0 ? 0 : Math.max(0, round2(total - paid));
  return {
    id: Number(row.id),
    invoiceNumber: row.invoice_number,
    proposalId: row.proposal_id != null ? Number(row.proposal_id) : null,
    jobId: Number(row.job_id),
    homeownerUserId: row.homeowner_user_id != null ? Number(row.homeowner_user_id) : null,
    status: row.status || 'draft',
    lineItems: totals.lineItems,
    additionalCharges: totals.additionalCharges,
    discountType: row.discount_type || 'none',
    discountValue: Number(row.discount_value) || 0,
    discountAmount: Number(row.discount_amount) || totals.discountAmount,
    shippingAmount: Number(row.shipping_amount) || 0,
    shippingLabel: row.shipping_label || 'Shipping / Delivery',
    taxMode: row.tax_mode || 'none',
    taxValue: Number(row.tax_value) || 0,
    taxAmount: Number(row.tax_amount) || totals.taxAmount,
    subtotal: Number(row.subtotal) || totals.subtotal,
    total,
    paid,
    amountDue,
    billTo: parseJson(row.bill_to, null),
    customerNotes: row.customer_notes || row.custom_note || null,
    termsConditions: row.terms_conditions || null,
    dueDate: row.due_date,
    paidAt: row.paid_at,
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference,
    paymentNotes: row.payment_notes,
    stripePaymentLinkId: row.stripe_payment_link_id,
    stripePaymentLinkUrl: row.stripe_payment_link_url,
    stripeSessionId: row.stripe_session_id,
    stripePaymentIntent: row.stripe_payment_intent,
    createdAt: row.created_at,
    viewedAt: row.viewed_at,
    lockedAt: row.locked_at,
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function documentBodyFromRequest(body = {}, existing = {}) {
  const lineItems = normalizeLineItems(
    Array.isArray(body.lineItems) ? body.lineItems : upgradeLegacyLineItems(parseJson(existing.customer_line_items, []))
  );
  const additionalCharges = Array.isArray(body.additionalCharges)
    ? body.additionalCharges
    : parseJson(existing.additional_charges, []) || [];
  const discountType =
    body.discountType != null
      ? String(body.discountType)
      : existing.discount_type || (Number(existing.admin_discount) > 0 ? 'fixed' : 'none');
  const discountValue =
    body.discountValue != null
      ? Number(body.discountValue)
      : existing.discount_value != null
        ? Number(existing.discount_value)
        : Number(existing.admin_discount) || 0;
  const shippingAmount = body.shippingAmount != null ? Number(body.shippingAmount) : Number(existing.shipping_amount) || 0;
  const shippingLabel =
    body.shippingLabel != null ? String(body.shippingLabel) : existing.shipping_label || 'Shipping / Delivery';
  const taxMode = body.taxMode != null ? String(body.taxMode) : existing.tax_mode || 'none';
  const taxValue = body.taxValue != null ? Number(body.taxValue) : Number(existing.tax_value) || 0;
  const totals = computeQuoteTotals({
    lineItems,
    discountType,
    discountValue,
    shippingAmount,
    additionalCharges,
    taxMode,
    taxValue,
  });

  return {
    lineItems: totals.lineItems,
    additionalCharges: totals.additionalCharges,
    discountType,
    discountValue,
    shippingAmount: totals.shippingAmount,
    shippingLabel,
    taxMode,
    taxValue,
    totals,
    customerNotes: body.customerNotes != null ? String(body.customerNotes) : existing.customer_notes,
    termsConditions: body.termsConditions != null ? String(body.termsConditions) : existing.terms_conditions,
    internalNotes: body.internalNotes != null ? String(body.internalNotes) : existing.internal_notes,
    companyName: body.companyName != null ? String(body.companyName) : existing.company_name,
    billTo: body.billTo != null ? normalizeBillToAddress(body.billTo) : parseJson(existing.bill_to, null),
    warranty: body.warranty != null ? String(body.warranty) : existing.warranty,
    timeline: body.timeline != null ? String(body.timeline) : existing.timeline,
    scopeSummary: body.scopeSummary != null ? String(body.scopeSummary) : existing.scope_summary,
    exclusions: body.exclusions != null ? String(body.exclusions) : existing.exclusions,
    contractorQuoteAmount:
      body.contractorQuoteAmount != null
        ? Number(body.contractorQuoteAmount)
        : existing.contractor_quote_amount != null
          ? Number(existing.contractor_quote_amount)
          : existing.contractor_net != null
            ? Number(existing.contractor_net)
            : null,
    contractorNotes: body.contractorNotes != null ? String(body.contractorNotes) : existing.contractor_notes,
    contractorSpecialConditions:
      body.contractorSpecialConditions != null
        ? String(body.contractorSpecialConditions)
        : existing.contractor_special_conditions,
    quoteValidUntil: body.quoteValidUntil != null ? body.quoteValidUntil : existing.quote_valid_until,
    discountReason:
      body.discountReason != null ? String(body.discountReason) : existing.admin_discount_reason,
    couponCode: body.couponCode != null ? String(body.couponCode) : existing.coupon_code,
  };
}

function renderQuoteEmailHtml(quote, { message, acceptUrl } = {}) {
  const rows = quote.lineItems
    .map(
      (i) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">
            <strong>${escapeHtml(i.name)}</strong>
            ${i.description ? `<br><span style="color:#666;font-size:12px;">${escapeHtml(i.description)}</span>` : ''}
            <br><span style="color:#888;font-size:11px;">${i.qty} ${escapeHtml(i.unit)} × ${money(i.unitPrice)}</span>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${money(i.amount)}</td>
        </tr>`
    )
    .join('');

  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;color:#111;max-width:640px;margin:0 auto;padding:24px;">
  <div style="border-bottom:3px solid ${brand.primaryColor};padding-bottom:16px;margin-bottom:20px;">
    <h1 style="margin:0;color:${brand.primaryColor};font-size:22px;">${escapeHtml(brand.productName)}</h1>
    <p style="margin:4px 0 0;color:#666;font-size:13px;">Professional Service Quotation</p>
  </div>
  <p style="font-size:14px;"><strong>QUOTE #${escapeHtml(quote.quoteNumber)}</strong></p>
  <p style="font-size:13px;color:#666;">Status: ${escapeHtml(String(quote.status).toUpperCase())}
  ${quote.quoteValidUntil ? ` · Valid until ${new Date(quote.quoteValidUntil).toLocaleDateString()}` : ''}</p>
  ${message ? `<p style="margin:16px 0;padding:12px;background:#f8f9fb;border-radius:8px;font-size:14px;">${escapeHtml(message)}</p>` : ''}
  <div style="background:#f8f9fb;border-radius:12px;padding:14px;margin:16px 0;">
    <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;color:#666;">Bill to</p>
    <p style="margin:0;font-weight:600;">${escapeHtml(quote.billTo?.name || '')}</p>
    ${quote.billTo?.email ? `<p style="margin:4px 0 0;color:#444;">${escapeHtml(quote.billTo.email)}</p>` : ''}
    ${formatAddressLines(normalizeBillToAddress(quote.billTo || {}))
      .map((line) => `<p style="margin:4px 0 0;color:#444;">${escapeHtml(line)}</p>`)
      .join('')}
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table>
  <table style="width:100%;margin-top:12px;font-size:14px;">
    <tr><td style="padding:4px 0;color:#666;">Subtotal</td><td style="text-align:right;">${money(quote.subtotal)}</td></tr>
    ${quote.discountAmount > 0 ? `<tr><td style="padding:4px 0;color:#666;">Discount</td><td style="text-align:right;">−${money(quote.discountAmount)}</td></tr>` : ''}
    ${quote.shippingAmount > 0 ? `<tr><td style="padding:4px 0;color:#666;">${escapeHtml(quote.shippingLabel || 'Shipping')}</td><td style="text-align:right;">${money(quote.shippingAmount)}</td></tr>` : ''}
    ${(quote.additionalCharges || []).map((c) => `<tr><td style="padding:4px 0;color:#666;">${escapeHtml(c.name)}</td><td style="text-align:right;">${money(c.amount)}</td></tr>`).join('')}
    ${quote.taxAmount > 0 ? `<tr><td style="padding:4px 0;color:#666;">Tax</td><td style="text-align:right;">${money(quote.taxAmount)}</td></tr>` : ''}
    <tr><td style="padding:12px 0;font-size:18px;font-weight:700;">Total</td><td style="text-align:right;font-size:18px;font-weight:700;color:${brand.primaryColor};">${money(quote.total)}</td></tr>
  </table>
  ${quote.customerNotes ? `<p style="margin-top:20px;font-size:13px;white-space:pre-wrap;">${escapeHtml(quote.customerNotes)}</p>` : ''}
  ${quote.termsConditions ? `<p style="margin-top:12px;font-size:12px;color:#666;white-space:pre-wrap;"><strong>Terms:</strong> ${escapeHtml(quote.termsConditions)}</p>` : ''}
  ${acceptUrl ? `<p style="margin-top:24px;"><a href="${escapeHtml(acceptUrl)}" style="display:inline-block;background:${brand.primaryColor};color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600;">View & respond to quote</a></p>` : ''}
  <p style="margin-top:28px;font-size:12px;color:#888;">Questions? Contact ${escapeHtml(brand.supportEmail)}.</p>
  </body></html>`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function markInvoicePaidFromStripe(pool, {
  invoiceId,
  amount,
  paymentIntentId,
  sessionId,
  method = 'card',
}) {
  if (!invoiceId) return null;
  const { rows } = await pool.query(`SELECT * FROM homeowner_invoices WHERE id=$1`, [invoiceId]);
  if (!rows[0]) return null;
  if (String(rows[0].status).toLowerCase() === 'paid') return rows[0];

  const total = Number(rows[0].total || rows[0].amount_due) || 0;
  const paidAmt = amount != null ? Number(amount) : total;
  const servicePaid = Math.min(paidAmt, total);
  await pool.query(
    `UPDATE homeowner_invoices SET
       status='paid',
       paid=$1,
       amount_due=0,
       paid_at=NOW(),
       payment_method=$2,
       stripe_payment_intent=COALESCE($3, stripe_payment_intent),
       stripe_session_id=COALESCE($4, stripe_session_id),
       locked_at=COALESCE(locked_at, NOW())
     WHERE id=$5`,
    [servicePaid, method, paymentIntentId || null, sessionId || null, invoiceId]
  );
  if (rows[0].proposal_id) {
    await pool.query(`UPDATE proposals SET status='paid' WHERE id=$1`, [rows[0].proposal_id]);
    await logQuoteActivity(pool, {
      proposalId: rows[0].proposal_id,
      invoiceId,
      jobId: rows[0].job_id,
      action: 'invoice_paid_stripe',
      detail: { amount: paidAmt, paymentIntentId, sessionId },
    });
  }
  return rows[0];
}

export function registerQuoteWorkspaceRoutes(app, { pool, requireAuth, requireAdmin, requireAdminWrite }) {
  app.get('/api/admin/quotes/:id/workspace', requireAuth, requireAdmin, async (req, res) => {
    try {
      const idOrNum = String(req.params.id || '').trim();
      const { rows } = await pool.query(quoteSelectSql(
        `WHERE p.id::text = $1 OR LOWER(COALESCE(p.quote_number,'')) = LOWER($1) LIMIT 1`
      ), [idOrNum]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Quote not found.' });
      if (!rows[0].quote_number) {
        const qn = `FBQ-${String(rows[0].id).padStart(5, '0')}`;
        await pool.query(`UPDATE proposals SET quote_number = COALESCE(quote_number, $1) WHERE id = $2`, [qn, rows[0].id]);
        rows[0].quote_number = qn;
      }
      const quote = serializeQuoteDocument(rows[0]);
      const { rows: activity } = await pool.query(
        `SELECT a.*, u.name AS actor_name
         FROM quote_activity a
         LEFT JOIN users u ON u.id = a.actor_user_id
         WHERE a.proposal_id=$1 OR a.invoice_id=$2
         ORDER BY a.created_at DESC
         LIMIT 100`,
        [quote.id, quote.invoice?.id || null]
      );
      let invoice = null;
      if (quote.invoice?.id) {
        const { rows: invRows } = await pool.query(`SELECT * FROM homeowner_invoices WHERE id=$1`, [quote.invoice.id]);
        if (invRows[0]) invoice = serializeInvoiceRow(invRows[0]);
      }
      res.json({
        ok: true,
        quote,
        invoice,
        activity: activity.map((a) => ({
          id: Number(a.id),
          action: a.action,
          detail: parseJson(a.detail, {}),
          actorName: a.actor_name,
          createdAt: a.created_at,
        })),
      });
    } catch (e) {
      console.error('quote workspace:', e);
      res.status(500).json({ ok: false, message: 'Could not load quote workspace.' });
    }
  });

  app.put('/api/admin/quotes/:id/document', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM proposals WHERE id=$1`, [id]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Quote not found.' });
      if (rows[0].locked_at || ['accepted', 'approved', 'converted', 'paid', 'canceled', 'cancelled'].includes(String(rows[0].status).toLowerCase())) {
        return res.status(409).json({
          ok: false,
          code: 'quote_locked',
          message: 'This quote is locked and cannot be edited.',
        });
      }
      const st = String(rows[0].status || '').toLowerCase();
      if (['sent', 'viewed'].includes(st)) {
        const changeReason = String(req.body?.changeReason || req.body?.revisionReason || '').trim();
        if (!changeReason) {
          return res.status(409).json({
            ok: false,
            code: 'revision_required',
            message: 'Sent quotes cannot be silently overwritten. Provide changeReason to create a revision.',
          });
        }
        const prevVersion = Number(rows[0].version_number || 1);
        await pool.query(
          `UPDATE proposals SET
             version_number=$1,
             previous_version_id=COALESCE(previous_version_id, id),
             change_reason=$2
           WHERE id=$3`,
          [prevVersion + 1, changeReason, id]
        );
      }
      const doc = documentBodyFromRequest(req.body || {}, rows[0]);
      const status = req.body?.status ? String(req.body.status) : rows[0].status;
      const validUntil = doc.quoteValidUntil
        ? new Date(doc.quoteValidUntil).toISOString()
        : rows[0].quote_valid_until;

      await pool.query(
        `UPDATE proposals SET
           customer_line_items=$1,
           line_items=$1,
           discount_type=$2,
           discount_value=$3,
           admin_discount=$4,
           admin_discount_reason=$5,
           shipping_amount=$6,
           shipping_label=$7,
           additional_charges=$8,
           tax_mode=$9,
           tax_value=$10,
           customer_notes=$11,
           terms_conditions=$12,
           internal_notes=$13,
           company_name=$14,
           bill_to=$15,
           warranty=$16,
           timeline=$17,
           scope_summary=$18,
           exclusions=$19,
           contractor_quote_amount=$20,
           contractor_notes=$21,
           contractor_special_conditions=$22,
           quote_valid_until=$23,
           retail_amount=$24,
           document_totals=$25,
           status=$26,
           coupon_code=$27
         WHERE id=$28`,
        [
          JSON.stringify(doc.lineItems),
          doc.discountType,
          doc.discountValue,
          doc.totals.discountAmount,
          doc.discountReason,
          doc.shippingAmount,
          doc.shippingLabel,
          JSON.stringify(doc.additionalCharges),
          doc.taxMode,
          doc.taxValue,
          doc.customerNotes,
          doc.termsConditions,
          doc.internalNotes,
          doc.companyName,
          JSON.stringify(doc.billTo),
          doc.warranty,
          doc.timeline,
          doc.scopeSummary,
          doc.exclusions,
          doc.contractorQuoteAmount,
          doc.contractorNotes,
          doc.contractorSpecialConditions,
          validUntil,
          doc.totals.total,
          JSON.stringify(doc.totals),
          status,
          doc.couponCode || null,
          id,
        ]
      );

      if (req.body?.discountValue != null || req.body?.discountType != null) {
        await logQuoteActivity(pool, {
          proposalId: id,
          jobId: rows[0].job_id,
          actorUserId: req.authUser.id,
          action: 'discount_updated',
          detail: {
            discountType: doc.discountType,
            discountValue: doc.discountValue,
            discountAmount: doc.totals.discountAmount,
          },
        });
      } else {
        await logQuoteActivity(pool, {
          proposalId: id,
          jobId: rows[0].job_id,
          actorUserId: req.authUser.id,
          action: 'quote_saved',
          detail: { total: doc.totals.total, status },
        });
      }

      await audit(pool, req.authUser.id, 'quote_document_saved', 'proposal', id, {
        total: doc.totals.total,
        status,
      });

      const { rows: refreshed } = await pool.query(quoteSelectSql(`WHERE p.id=$1`), [id]);
      res.json({ ok: true, quote: serializeQuoteDocument(refreshed[0]) });
    } catch (e) {
      console.error('save quote document:', e);
      res.status(500).json({ ok: false, message: 'Could not save quote.' });
    }
  });

  app.post('/api/admin/quotes/:id/send', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const sendEmail = req.body?.sendEmail !== false;
      const sendSms = req.body?.sendSms === true;
      if (!sendEmail && !sendSms) {
        return res.status(400).json({ ok: false, message: 'Choose email and/or SMS.' });
      }
      if (sendSms && !smsConfigured()) {
        return res.status(400).json({
          ok: false,
          code: 'sms_not_configured',
          message: 'SMS delivery is not currently configured.',
        });
      }

      const { rows } = await pool.query(quoteSelectSql(`WHERE p.id=$1`), [id]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Quote not found.' });
      const quote = serializeQuoteDocument(rows[0]);

      const emailTo = String(req.body?.email || quote.billTo?.email || quote.homeownerEmail || '').trim();
      const phoneTo = normalizePhone(String(req.body?.phone || quote.billTo?.phone || quote.homeownerPhone || ''));
      const subject =
        String(req.body?.subject || '').trim() ||
        `Your ${brand.productName} Quote — ${quote.quoteNumber}`;
      const message =
        String(req.body?.message || '').trim() ||
        `Your quote ${quote.quoteNumber} is ready. Total: ${money(quote.total)}.`;
      const acceptUrl = `${appBaseUrl()}/homeowner?quote=${encodeURIComponent(quote.quoteNumber)}`;
      const delivery = { email: null, sms: null };

      if (sendEmail) {
        if (!emailTo) return res.status(400).json({ ok: false, message: 'No customer email available.' });
        delivery.email = await sendEmailSafe({
          to: emailTo,
          subject,
          html: renderQuoteEmailHtml(quote, { message, acceptUrl }),
        });
        if (delivery.email?.ok === false) {
          return res.status(502).json({ ok: false, message: delivery.email.message || 'Email failed.' });
        }
        await logQuoteActivity(pool, {
          proposalId: id,
          jobId: quote.jobId,
          actorUserId: req.authUser.id,
          action: 'quote_sent_email',
          detail: { to: emailTo, subject, simulated: delivery.email?.simulated === true },
        });
      }

      if (sendSms) {
        if (!phoneTo) return res.status(400).json({ ok: false, message: 'No customer phone available.' });
        const smsBody = `${brand.productName}: Your quote ${quote.quoteNumber} is ready.\n\nTotal: ${money(quote.total)}\n\nView your quote:\n${acceptUrl}`;
        delivery.sms = await sendSmsSafe({ to: phoneTo, body: smsBody });
        if (delivery.sms?.ok === false) {
          return res.status(502).json({ ok: false, message: delivery.sms.message || 'SMS failed.' });
        }
        await logQuoteActivity(pool, {
          proposalId: id,
          jobId: quote.jobId,
          actorUserId: req.authUser.id,
          action: 'quote_sent_sms',
          detail: { to: phoneTo, simulated: delivery.sms?.simulated === true },
        });
      }

      await pool.query(
        `UPDATE proposals SET status='sent', published_at=COALESCE(published_at, NOW()) WHERE id=$1`,
        [id]
      );
      await audit(pool, req.authUser.id, 'quote_sent', 'proposal', id, { sendEmail, sendSms, emailTo, phoneTo });

      const { rows: refreshed } = await pool.query(quoteSelectSql(`WHERE p.id=$1`), [id]);
      res.json({
        ok: true,
        quote: serializeQuoteDocument(refreshed[0]),
        delivery,
        message: `Quote ${quote.quoteNumber} sent.`,
      });
    } catch (e) {
      console.error('send quote:', e);
      res.status(500).json({ ok: false, message: 'Could not send quote.' });
    }
  });

  app.post('/api/admin/quotes/:id/duplicate', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM proposals WHERE id=$1`, [id]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Quote not found.' });
      const src = rows[0];
      const asJsonb = (val) => {
        if (val == null) return null;
        if (typeof val === 'string') return val;
        return JSON.stringify(val);
      };
      const { rows: created } = await pool.query(
        `INSERT INTO proposals
          (job_id, bid_id, scope_summary, retail_amount, deposit_amount, timeline, warranty, exclusions,
           contractor_net, platform_gross, processing_cost, status, created_by,
           line_items, pricing_adjustments, admin_discount, admin_discount_reason, coupon_code, coupon_funded_by,
           quote_valid_until, customer_line_items, service_charge, expected_margin_pct,
           discount_type, discount_value, shipping_amount, shipping_label, additional_charges,
           tax_mode, tax_value, customer_notes, terms_conditions, internal_notes,
           contractor_quote_amount, contractor_notes, contractor_special_conditions, company_name, bill_to, document_totals)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
           $23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38)
         RETURNING *`,
        [
          src.job_id,
          src.bid_id,
          src.scope_summary,
          src.retail_amount,
          src.deposit_amount,
          src.timeline,
          src.warranty,
          src.exclusions,
          src.contractor_net,
          src.platform_gross,
          src.processing_cost,
          req.authUser.id,
          asJsonb(src.line_items),
          asJsonb(src.pricing_adjustments),
          src.admin_discount,
          src.admin_discount_reason,
          src.coupon_code,
          src.coupon_funded_by,
          src.quote_valid_until,
          asJsonb(src.customer_line_items),
          src.service_charge,
          src.expected_margin_pct,
          src.discount_type,
          src.discount_value,
          src.shipping_amount,
          src.shipping_label,
          asJsonb(src.additional_charges),
          src.tax_mode,
          src.tax_value,
          src.customer_notes,
          src.terms_conditions,
          src.internal_notes,
          src.contractor_quote_amount,
          src.contractor_notes,
          src.contractor_special_conditions,
          src.company_name,
          asJsonb(src.bill_to),
          asJsonb(src.document_totals),
        ]
      );
      const quoteNumber = `FBQ-${String(created[0].id).padStart(5, '0')}`;
      await pool.query(`UPDATE proposals SET quote_number=$1 WHERE id=$2`, [quoteNumber, created[0].id]);
      await logQuoteActivity(pool, {
        proposalId: created[0].id,
        jobId: src.job_id,
        actorUserId: req.authUser.id,
        action: 'quote_duplicated',
        detail: { fromId: id, fromNumber: src.quote_number },
      });
      const { rows: refreshed } = await pool.query(quoteSelectSql(`WHERE p.id=$1`), [created[0].id]);
      res.json({ ok: true, quote: serializeQuoteDocument(refreshed[0]) });
    } catch (e) {
      console.error('duplicate quote:', e);
      res.status(500).json({ ok: false, message: 'Could not duplicate quote.' });
    }
  });

  app.post('/api/admin/quotes/:id/cancel', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await pool.query(`UPDATE proposals SET status='canceled' WHERE id=$1`, [id]);
      await logQuoteActivity(pool, {
        proposalId: id,
        actorUserId: req.authUser.id,
        action: 'quote_canceled',
        detail: { reason: req.body?.reason || null },
      });
      const { rows } = await pool.query(quoteSelectSql(`WHERE p.id=$1`), [id]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Quote not found.' });
      res.json({ ok: true, quote: serializeQuoteDocument(rows[0]) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not cancel quote.' });
    }
  });

  app.post('/api/admin/quotes/:id/convert-invoice', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    const client = await pool.connect();
    try {
      const id = Number(req.params.id);
      await client.query('BEGIN');
      const { rows } = await client.query(`SELECT * FROM proposals WHERE id=$1 FOR UPDATE`, [id]);
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ ok: false, message: 'Quote not found.' });
      }
      if (rows[0].converted_invoice_id) {
        const { rows: existing } = await client.query(`SELECT * FROM homeowner_invoices WHERE id=$1`, [
          rows[0].converted_invoice_id,
        ]);
        await client.query('COMMIT');
        const full = await pool.query(quoteSelectSql(`WHERE p.id=$1`), [id]);
        return res.json({
          ok: true,
          alreadyConverted: true,
          quote: serializeQuoteDocument(full.rows[0] || rows[0]),
          invoice: existing[0] ? serializeInvoiceRow(existing[0]) : null,
        });
      }

      const qStatus = String(rows[0].status || '').toLowerCase();
      const accepted = qStatus === 'accepted' || qStatus === 'approved';
      const forceConvert = req.body?.forceConvert === true;
      const forceReason = String(req.body?.forceReason || req.body?.reason || '').trim();
      if (!accepted) {
        if (!forceConvert) {
          return res.status(409).json({
            ok: false,
            code: 'acceptance_required',
            message: 'Quote must be accepted by the homeowner before converting to an invoice.',
          });
        }
        if (!forceReason) {
          return res.status(400).json({
            ok: false,
            message: 'Force convert requires a reason for the audit log.',
          });
        }
        await audit(pool, req.authUser.id, 'quote_force_convert', 'proposal', id, {
          reason: forceReason,
          statusBefore: qStatus,
        });
      }

      const quote = serializeQuoteDocument(rows[0]);
      const { rows: approvedCos } = await client.query(
        `SELECT id, description, retail_amount, approved_snapshot, reason
         FROM change_orders
         WHERE job_id=$1 AND status='approved'
         ORDER BY COALESCE(approved_at, created_at) ASC`,
        [quote.jobId]
      );
      let invoiceLineItems = [...(quote.lineItems || [])];
      const changeOrderLines = [];
      for (const co of approvedCos) {
        const snap = parseJson(co.approved_snapshot, null) || {};
        const amount = Number(snap.retail_amount ?? co.retail_amount ?? 0);
        if (!(amount > 0)) continue;
        const label = String(snap.description || co.description || co.reason || 'Approved additional work').slice(0, 500);
        changeOrderLines.push({
          id: `change-order-${co.id}`,
          description: label,
          quantity: 1,
          unitPrice: amount,
          total: amount,
          kind: 'change_order',
        });
      }
      if (changeOrderLines.length) {
        invoiceLineItems = [...invoiceLineItems, ...changeOrderLines];
      }
      const invoiceTotals = computeQuoteTotals({
        lineItems: invoiceLineItems,
        discountType: quote.discountType,
        discountValue: quote.discountValue,
        shippingAmount: quote.shippingAmount,
        additionalCharges: quote.additionalCharges,
        taxMode: quote.taxMode,
        taxValue: quote.taxValue,
      });
      const invoiceSubtotal = invoiceTotals.subtotal;
      const invoiceTotal = invoiceTotals.total;

      const invoiceNumber = ensureFbiNumber(quote.id);
      const versionKey = rows[0].version_number || 1;
      const { rows: inv } = await client.query(
        `INSERT INTO homeowner_invoices
          (invoice_number, job_id, homeowner_user_id, proposal_id, amount_due, subtotal, paid, total,
           line_items, additional_charges, discount_type, discount_value, discount_amount,
           shipping_amount, shipping_label, tax_mode, tax_value, tax_amount,
           customer_notes, terms_conditions, bill_to, status, custom_note, document_snapshot, due_date)
         VALUES
          ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'due',$21,$22,$23)
         RETURNING *`,
        [
          invoiceNumber,
          quote.jobId,
          quote.homeownerUserId,
          quote.id,
          invoiceTotal,
          invoiceSubtotal,
          invoiceTotal,
          JSON.stringify(invoiceLineItems),
          JSON.stringify(quote.additionalCharges),
          quote.discountType,
          quote.discountValue,
          quote.discountAmount,
          quote.shippingAmount,
          quote.shippingLabel,
          quote.taxMode,
          quote.taxValue,
          quote.taxAmount,
          quote.customerNotes,
          quote.termsConditions,
          JSON.stringify(quote.billTo),
          quote.customerNotes,
          JSON.stringify({
            quoteNumber: quote.quoteNumber,
            convertedAt: new Date().toISOString(),
            versionNumber: versionKey,
            approvedChangeOrders: changeOrderLines.map((l) => ({
              id: l.id,
              description: l.description,
              amount: l.total,
            })),
          }),
          quote.quoteValidUntil,
        ]
      );

      await client.query(
        `UPDATE proposals SET status='converted', converted_invoice_id=$1, locked_at=COALESCE(locked_at, NOW()) WHERE id=$2`,
        [inv[0].id, id]
      );
      await client.query('COMMIT');

      await logQuoteActivity(pool, {
        proposalId: id,
        invoiceId: inv[0].id,
        jobId: quote.jobId,
        actorUserId: req.authUser.id,
        action: 'converted_to_invoice',
        detail: { invoiceNumber, versionNumber: versionKey },
      });
      await audit(pool, req.authUser.id, 'quote_converted_invoice', 'proposal', id, {
        invoiceNumber,
        idempotencyKey: `convert-${id}-v${versionKey}`,
      });

      const { rows: refreshed } = await pool.query(quoteSelectSql(`WHERE p.id=$1`), [id]);
      res.json({
        ok: true,
        quote: serializeQuoteDocument(refreshed[0]),
        invoice: serializeInvoiceRow(inv[0]),
        message: `Invoice ${invoiceNumber} created from ${quote.quoteNumber}.`,
      });
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      console.error('convert invoice:', e);
      res.status(500).json({ ok: false, message: 'Could not convert quote to invoice.' });
    } finally {
      client.release();
    }
  });

  app.get('/api/admin/invoices/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM homeowner_invoices WHERE id=$1`, [id]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Invoice not found.' });
      res.json({ ok: true, invoice: serializeInvoiceRow(rows[0]) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load invoice.' });
    }
  });

  app.post('/api/admin/invoices/:id/send', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const sendEmail = req.body?.sendEmail !== false;
      const sendSms = req.body?.sendSms === true;
      if (sendSms && !smsConfigured()) {
        return res.status(400).json({
          ok: false,
          code: 'sms_not_configured',
          message: 'SMS delivery is not currently configured.',
        });
      }
      const { rows } = await pool.query(`SELECT * FROM homeowner_invoices WHERE id=$1`, [id]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Invoice not found.' });
      const invoice = serializeInvoiceRow(rows[0]);
      const billTo = invoice.billTo || {};
      const emailTo = String(req.body?.email || billTo.email || '').trim();
      const phoneTo = normalizePhone(String(req.body?.phone || billTo.phone || ''));
      const html = renderInvoiceHtml({
        ...invoice,
        invoiceNumber: invoice.invoiceNumber,
        issuedAt: invoice.createdAt || new Date().toISOString(),
        billTo: {
          name: billTo.name || 'Customer',
          email: emailTo || billTo.email,
          phone: phoneTo || billTo.phone,
          address: billTo.address || billTo.street || billTo.cityStateZip,
        },
        lineItems: invoice.lineItems.map((i) => ({ label: i.name, amount: i.amount, note: i.description })),
        subtotal: invoice.subtotal,
        paid: invoice.paid,
        amountDue: invoice.amountDue,
        visitFeePaid: 0,
        bookingId: `INV-${invoice.id}`,
        jobTitle: 'Service invoice',
        customNote: invoice.customerNotes,
        company: { name: brand.legalName, email: brand.supportEmail, tagline: brand.tagline },
      });

      const delivery = { email: null, sms: null };
      if (sendEmail) {
        if (!emailTo) return res.status(400).json({ ok: false, message: 'No email for invoice.' });
        delivery.email = await sendEmailSafe({
          to: emailTo,
          subject: `${brand.productName} Invoice ${invoice.invoiceNumber} — ${money(invoice.amountDue)} due`,
          html,
        });
      }
      if (sendSms) {
        if (!phoneTo) return res.status(400).json({ ok: false, message: 'No phone for invoice SMS.' });
        const link = invoice.stripePaymentLinkUrl || `${appBaseUrl()}/homeowner?invoice=${invoice.invoiceNumber}`;
        delivery.sms = await sendSmsSafe({
          to: phoneTo,
          body: `${brand.productName} invoice ${invoice.invoiceNumber}. Amount due: ${money(invoice.amountDue)}. Pay: ${link}`,
        });
      }

      await pool.query(
        `UPDATE homeowner_invoices SET status=CASE WHEN status='paid' THEN status ELSE 'sent' END,
           sent_via=$1, sent_by=$2 WHERE id=$3`,
        [
          JSON.stringify({
            email: sendEmail ? { to: emailTo } : null,
            sms: sendSms ? { to: phoneTo } : null,
          }),
          req.authUser.id,
          id,
        ]
      );
      await logQuoteActivity(pool, {
        proposalId: invoice.proposalId,
        invoiceId: id,
        jobId: invoice.jobId,
        actorUserId: req.authUser.id,
        action: 'invoice_sent',
        detail: { sendEmail, sendSms, emailTo, phoneTo },
      });
      const { rows: refreshed } = await pool.query(`SELECT * FROM homeowner_invoices WHERE id=$1`, [id]);
      res.json({ ok: true, invoice: serializeInvoiceRow(refreshed[0]), delivery });
    } catch (e) {
      console.error('send invoice:', e);
      res.status(500).json({ ok: false, message: 'Could not send invoice.' });
    }
  });

  app.post('/api/admin/invoices/:id/mark-paid', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM homeowner_invoices WHERE id=$1`, [id]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Invoice not found.' });
      const invoice = serializeInvoiceRow(rows[0]);
      const amountReceived =
        req.body?.amountReceived != null ? Number(req.body.amountReceived) : invoice.amountDue;
      const method = String(req.body?.paymentMethod || 'other');
      const reference = String(req.body?.reference || '').trim() || null;
      const notes = String(req.body?.notes || '').trim() || null;
      const paymentDate = req.body?.paymentDate ? new Date(req.body.paymentDate) : new Date();
      const newPaid = round2((Number(rows[0].paid) || 0) + amountReceived);
      const total = invoice.total;
      const status = newPaid >= total - 0.009 ? 'paid' : 'partially_paid';
      const idempotencyKey = `manual-invoice-${id}-${reference || paymentDate.toISOString()}`;

      if (status === 'paid') {
        try {
          await processSuccessfulPayment(pool, {
            source: 'manual_mark_paid',
            jobId: invoice.jobId,
            invoiceId: id,
            proposalId: invoice.proposalId,
            homeownerUserId: invoice.homeownerUserId,
            paymentType: 'invoice_manual',
            customerTotal: amountReceived,
            serviceAmount: amountReceived,
            tipAmount: 0,
            actorUserId: req.authUser.id,
            simulated: true,
            idempotencyKey,
            manualReference: reference,
            paymentMethod: method,
          });
        } catch (settleErr) {
          console.warn('[mark-paid] settlement:', settleErr.message);
        }
        await pool.query(
          `UPDATE homeowner_invoices SET paid_by=$1, payment_reference=$2, payment_notes=$3 WHERE id=$4`,
          [req.authUser.id, reference, notes, id]
        );
      } else {
        await pool.query(
          `UPDATE homeowner_invoices SET
             paid=$1,
             amount_due=$2,
             status=$3,
             paid_at=$4,
             paid_by=$5,
             payment_method=$6,
             payment_reference=$7,
             payment_notes=$8
           WHERE id=$9`,
          [
            newPaid,
            Math.max(0, round2(total - newPaid)),
            status,
            paymentDate.toISOString(),
            req.authUser.id,
            method,
            reference,
            notes,
            id,
          ]
        );
        await pool.query(
          `INSERT INTO payments (job_id, user_id, payment_type, amount, currency, status, simulated, meta, service_amount, tip_amount)
           VALUES ($1,$2,'invoice_manual',$3,'usd','succeeded',true,$4,$3,0)`,
          [
            invoice.jobId,
            req.authUser.id,
            amountReceived,
            JSON.stringify({
              invoiceId: id,
              invoiceNumber: invoice.invoiceNumber,
              method,
              reference,
              notes,
              recordedBy: req.authUser.id,
            }),
          ]
        );
      }

      if (invoice.proposalId && status === 'paid') {
        await pool.query(`UPDATE proposals SET status='paid' WHERE id=$1`, [invoice.proposalId]);
      }
      await logQuoteActivity(pool, {
        proposalId: invoice.proposalId,
        invoiceId: id,
        jobId: invoice.jobId,
        actorUserId: req.authUser.id,
        action: 'payment_recorded',
        detail: { amountReceived, method, reference, status },
      });
      await audit(pool, req.authUser.id, 'invoice_mark_paid', 'homeowner_invoice', id, {
        amountReceived,
        method,
        status,
      });

      const { rows: refreshed } = await pool.query(`SELECT * FROM homeowner_invoices WHERE id=$1`, [id]);
      res.json({ ok: true, invoice: serializeInvoiceRow(refreshed[0]), message: status === 'paid' ? 'PAID' : 'Partial payment recorded.' });
    } catch (e) {
      console.error('mark paid:', e);
      res.status(500).json({ ok: false, message: 'Could not record payment.' });
    }
  });

  app.post('/api/admin/invoices/:id/payment-link', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM homeowner_invoices WHERE id=$1`, [id]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Invoice not found.' });
      const invoice = serializeInvoiceRow(rows[0]);
      if (invoice.status === 'paid') {
        return res.status(400).json({ ok: false, message: 'Invoice is already paid.' });
      }
      if (invoice.stripePaymentLinkUrl && invoice.amountDue > 0 && req.body?.force !== true) {
        return res.json({
          ok: true,
          reused: true,
          paymentLink: invoice.stripePaymentLinkUrl,
          invoice,
        });
      }

      assertPaymentsAvailable();
      const tipAmount = Math.max(0, Number(req.body?.tipAmount || 0));
      const serviceAmount = Number(invoice.amountDue);
      const totals = calculateCustomerPaymentTotal({
        serviceAmountCents: dollarsToCents(serviceAmount),
        tipAmountCents: dollarsToCents(tipAmount),
      });
      const amountCents = totals.customerTotalCents;
      if (amountCents < 50) {
        return res.status(400).json({ ok: false, message: 'Amount due is too small for Stripe Checkout.' });
      }

      if (tipAmount > 0) {
        await recordPendingTip(pool, {
          jobId: invoice.jobId,
          homeownerUserId: req.authUser.id,
          contractorUserId: null,
          amountDollars: tipAmount,
          percentOfService: req.body?.tipPercent != null ? Number(req.body.tipPercent) : null,
          actorUserId: req.authUser.id,
        });
      }

      const lineItems = [
        {
          amountCents: totals.serviceAmountCents,
          description: `${brand.productName} Invoice ${invoice.invoiceNumber}`,
        },
      ];
      if (totals.tipAmountCents > 0) {
        lineItems.push({
          amountCents: totals.tipAmountCents,
          description: 'Tip for contractor (100% to pro)',
        });
      }

      const session = await createCheckoutSession({
        amountCents,
        lineItems,
        customerEmail: invoice.billTo?.email || undefined,
        successPath: `/homeowner?invoicePaid=${encodeURIComponent(invoice.invoiceNumber)}`,
        cancelPath: `/homeowner?invoice=${encodeURIComponent(invoice.invoiceNumber)}`,
        description: `${brand.productName} Invoice ${invoice.invoiceNumber}`,
        metadata: {
          paymentType: 'invoice_payment',
          paymentSource: 'invoice_checkout',
          invoiceId: String(id),
          invoiceNumber: invoice.invoiceNumber,
          jobId: String(invoice.jobId),
          homeownerId: String(invoice.homeownerUserId || req.authUser.id),
          proposalId: invoice.proposalId != null ? String(invoice.proposalId) : '',
          serviceAmountCents: String(totals.serviceAmountCents),
          tipAmountCents: String(totals.tipAmountCents),
        },
        idempotencyKey: `checkout-${id}-v${invoice.status}-${totals.tipAmountCents}`,
      });

      await pool.query(
        `UPDATE homeowner_invoices SET
           stripe_session_id=$1,
           stripe_payment_link_id=$1,
           stripe_payment_link_url=$2,
           status=CASE WHEN status IN ('paid','void') THEN status ELSE 'due' END
         WHERE id=$3`,
        [session.sessionId, session.url, id]
      );

      await pool.query(
        `INSERT INTO payments (job_id, user_id, payment_type, amount, currency, status, stripe_session_id, simulated, meta)
         VALUES ($1,$2,'invoice_payment',$3,'usd','pending',$4,false,$5)`,
        [
          invoice.jobId,
          req.authUser.id,
          invoice.amountDue,
          session.sessionId,
          JSON.stringify({
            invoiceId: id,
            invoiceNumber: invoice.invoiceNumber,
            serviceAmount: serviceAmount,
            tipAmount,
          }),
        ]
      );

      await logQuoteActivity(pool, {
        proposalId: invoice.proposalId,
        invoiceId: id,
        jobId: invoice.jobId,
        actorUserId: req.authUser.id,
        action: 'payment_link_created',
        detail: { url: session.url, sessionId: session.sessionId, amount: invoice.amountDue },
      });

      const { rows: refreshed } = await pool.query(`SELECT * FROM homeowner_invoices WHERE id=$1`, [id]);
      res.json({
        ok: true,
        paymentLink: session.url,
        invoice: serializeInvoiceRow(refreshed[0]),
      });
    } catch (e) {
      console.error('payment link:', e);
      const status = e.status || 500;
      res.status(status).json({ ok: false, message: e.message || 'Could not create payment link.' });
    }
  });

  /** Homeowner invoice checkout with optional tip — authoritative payment summary before Stripe. */
  app.post('/api/homeowner/invoices/:id/checkout', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'homeowner' && !isAdminRole(req.authUser)) {
        return res.status(403).json({ ok: false, message: 'Homeowners only.' });
      }
      const id = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM homeowner_invoices WHERE id=$1`, [id]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Invoice not found.' });
      const invoice = serializeInvoiceRow(rows[0]);
      if (!isAdminRole(req.authUser) && !isHomeownerOwner(req.authUser, invoice.homeownerUserId)) {
        return res.status(403).json({ ok: false, message: 'Not allowed to pay this invoice.' });
      }
      if (invoice.status === 'paid') {
        return res.status(400).json({ ok: false, message: 'Invoice is already paid.' });
      }

      const rawTip = req.body?.tipAmount;
      const tipAmount =
        rawTip === null || rawTip === '' || rawTip === undefined ? 0 : Math.max(0, Number(rawTip) || 0);
      const maxTip = Math.max(500, Number(invoice.amountDue) * 2);
      if (!Number.isFinite(tipAmount) || tipAmount < 0) {
        return res.status(400).json({ ok: false, message: 'Invalid tip amount.' });
      }
      if (tipAmount > maxTip) {
        return res.status(400).json({ ok: false, message: `Tip cannot exceed ${maxTip.toFixed(2)}.` });
      }

      const serviceAmount = Number(invoice.amountDue);
      const totals = calculateCustomerPaymentTotal({
        serviceAmountCents: dollarsToCents(serviceAmount),
        tipAmountCents: dollarsToCents(tipAmount),
      });

      // $0 checkout — server-side settlement, no Stripe session
      if (invoice.total <= 0 || (serviceAmount <= 0 && tipAmount <= 0) || totals.customerTotalCents <= 0) {
        await processSuccessfulPayment(pool, {
          source: 'zero_dollar_checkout',
          jobId: invoice.jobId,
          invoiceId: id,
          proposalId: invoice.proposalId,
          homeownerUserId: req.authUser.id,
          paymentType: 'invoice_payment',
          customerTotal: 0,
          serviceAmount: 0,
          tipAmount: 0,
          paymentMethod: 'zero_dollar',
          actorUserId: req.authUser.id,
          idempotencyKey: `zero-checkout-${id}`,
        });
        const { rows: refreshed } = await pool.query(`SELECT * FROM homeowner_invoices WHERE id=$1`, [id]);
        return res.json({
          ok: true,
          zeroDollar: true,
          paid: true,
          invoice: serializeInvoiceRow(refreshed[0]),
          message: 'Invoice settled at $0 — no Stripe checkout required.',
        });
      }

      assertPaymentsAvailable();
      if (totals.customerTotalCents < 50) {
        return res.status(400).json({ ok: false, message: 'Amount due is too small for Stripe Checkout.' });
      }

      if (tipAmount > 0) {
        await recordPendingTip(pool, {
          jobId: invoice.jobId,
          homeownerUserId: req.authUser.id,
          contractorUserId: null,
          amountDollars: tipAmount,
          percentOfService: req.body?.tipPercent != null ? Number(req.body.tipPercent) : null,
          actorUserId: req.authUser.id,
        });
      }

      const lineItems = [
        { amountCents: totals.serviceAmountCents, description: `Service — Invoice ${invoice.invoiceNumber}` },
      ];
      if (totals.tipAmountCents > 0) {
        lineItems.push({ amountCents: totals.tipAmountCents, description: 'Tip for contractor (100% to pro)' });
      }

      const session = await createCheckoutSession({
        amountCents: totals.customerTotalCents,
        lineItems,
        customerEmail: invoice.billTo?.email || req.authUser.email || undefined,
        successPath: `/homeowner?invoicePaid=${encodeURIComponent(invoice.invoiceNumber)}`,
        cancelPath: `/homeowner?invoice=${encodeURIComponent(invoice.invoiceNumber)}`,
        description: `${brand.productName} Invoice ${invoice.invoiceNumber}`,
        metadata: {
          paymentType: 'invoice_payment',
          paymentSource: 'homeowner_checkout',
          invoiceId: String(id),
          invoiceNumber: invoice.invoiceNumber,
          jobId: String(invoice.jobId),
          homeownerId: String(invoice.homeownerUserId || req.authUser.id),
          proposalId: invoice.proposalId != null ? String(invoice.proposalId) : '',
          serviceAmountCents: String(totals.serviceAmountCents),
          tipAmountCents: String(totals.tipAmountCents),
        },
        idempotencyKey: `checkout-${id}-homeowner-${totals.tipAmountCents}`,
      });

      await pool.query(
        `UPDATE homeowner_invoices SET stripe_session_id=$1, stripe_payment_link_url=$2 WHERE id=$3`,
        [session.sessionId, session.url, id]
      );
      await pool.query(
        `INSERT INTO payments (job_id, user_id, payment_type, amount, currency, status, stripe_session_id, simulated, meta, service_amount, tip_amount)
         VALUES ($1,$2,'invoice_payment',$3,'usd','pending',$4,false,$5,$6,$7)`,
        [
          invoice.jobId,
          req.authUser.id,
          serviceAmount + tipAmount,
          session.sessionId,
          JSON.stringify({ invoiceId: id, serviceAmount, tipAmount, source: 'homeowner_checkout' }),
          serviceAmount,
          tipAmount,
        ]
      );

      res.json({
        ok: true,
        checkoutUrl: session.url,
        summary: {
          serviceTotal: serviceAmount,
          tipAmount,
          customerTotal: serviceAmount + tipAmount,
        },
        invoice: serializeInvoiceRow({ ...rows[0], stripe_payment_link_url: session.url }),
      });
    } catch (e) {
      console.error('homeowner checkout:', e);
      res.status(e.status || 500).json({ ok: false, message: e.message || 'Could not start checkout.' });
    }
  });

  app.get('/api/homeowner/invoices/:id', requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM homeowner_invoices WHERE id=$1`, [id]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Invoice not found.' });
      const invoice = serializeInvoiceRow(rows[0]);
      if (req.authUser.role === 'homeowner' && !isHomeownerOwner(req.authUser, invoice.homeownerUserId)) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      if (req.authUser.role === 'contractor') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      res.json({ ok: true, invoice });
    } catch {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  /** Poll payment settlement — authoritative; do not trust return URL alone. */
  app.get('/api/homeowner/invoices/by-number/:num/payment-status', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'homeowner' && !isAdminRole(req.authUser)) {
        return res.status(403).json({ ok: false, message: 'Homeowners only.' });
      }
      const num = String(req.params.num || '').trim();
      const { rows } = await pool.query(`SELECT * FROM homeowner_invoices WHERE invoice_number=$1`, [num]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Invoice not found.' });
      const invoice = serializeInvoiceRow(rows[0]);
      if (req.authUser.role === 'homeowner' && !isHomeownerOwner(req.authUser, invoice.homeownerUserId)) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const status = String(invoice.status || '').toLowerCase();
      const paid = status === 'paid' || Number(invoice.paid || 0) >= Number(invoice.total || 0);
      res.json({
        ok: true,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        paid,
        amountPaid: invoice.paid,
        total: invoice.total,
        jobId: invoice.jobId,
      });
    } catch {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });
}
