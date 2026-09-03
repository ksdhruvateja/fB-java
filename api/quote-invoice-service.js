/**
 * Convert accepted quotes to homeowner invoices (idempotent).
 */
import {
  computeQuoteTotals,
  ensureFbiNumber,
  parseJson,
  upgradeLegacyLineItems,
} from './quote-document.js';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function proposalRowToQuote(row) {
  const legacyItems = parseJson(row.customer_line_items, []) || [];
  const lineItems = upgradeLegacyLineItems(legacyItems);
  const additionalCharges = parseJson(row.additional_charges, []) || [];
  const discountType = row.discount_type || (Number(row.admin_discount) > 0 ? 'fixed' : 'none');
  const discountValue =
    row.discount_value != null ? Number(row.discount_value) : Number(row.admin_discount) || 0;
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
    parseJson(row.bill_to, null) || {
      name: row.job_contact_name || row.homeowner_name || 'Homeowner',
      companyName: row.company_name || null,
      email: row.homeowner_email || null,
      phone: row.job_contact_phone || row.homeowner_phone || null,
    };
  return {
    id: Number(row.id),
    quoteNumber: row.quote_number || `FBQ-${String(row.id).padStart(5, '0')}`,
    jobId: Number(row.job_id),
    homeownerUserId: row.homeowner_user_id != null ? Number(row.homeowner_user_id) : null,
    versionNumber: Number(row.version_number || 1),
    lineItems: totals.lineItems,
    discountType,
    discountValue,
    discountAmount: totals.discountAmount,
    shippingAmount: totals.shippingAmount,
    shippingLabel: row.shipping_label || 'Shipping / Delivery',
    additionalCharges: totals.additionalCharges,
    taxMode: row.tax_mode || 'none',
    taxValue: row.tax_value != null ? Number(row.tax_value) : 0,
    taxAmount: totals.taxAmount,
    subtotal: totals.subtotal,
    total: totals.total,
    customerNotes: row.customer_notes || null,
    termsConditions: row.terms_conditions || null,
    billTo,
    acceptedSnapshotId: row.accepted_snapshot_id || null,
  };
}

export function serializeInvoiceRow(row) {
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
    total,
    amountDue,
    paid,
    versionNumber: parseJson(row.document_snapshot, {})?.versionNumber || null,
  };
}

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

export async function logQuoteActivity(pool, {
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

/**
 * @param {import('pg').PoolClient} client - must be in a transaction with proposal row locked
 */
export async function convertProposalToInvoice(client, {
  proposalRow,
  actorUserId = null,
  forceConvert = false,
  forceReason = '',
}) {
  const row = proposalRow;
  if (!row) return { ok: false, status: 404, message: 'Quote not found.' };

  if (row.converted_invoice_id) {
    const { rows: existing } = await client.query(`SELECT * FROM homeowner_invoices WHERE id=$1`, [
      row.converted_invoice_id,
    ]);
    return {
      ok: true,
      alreadyConverted: true,
      invoice: existing[0] ? serializeInvoiceRow(existing[0]) : null,
      invoiceRow: existing[0] || null,
    };
  }

  const qStatus = String(row.status || '').toLowerCase();
  const accepted = qStatus === 'accepted' || qStatus === 'approved';
  if (!accepted && !forceConvert) {
    return {
      ok: false,
      status: 409,
      code: 'acceptance_required',
      message: 'Quote must be accepted by the homeowner before converting to an invoice.',
    };
  }
  if (!accepted && forceConvert && !String(forceReason || '').trim()) {
    return {
      ok: false,
      status: 400,
      message: 'Force convert requires a reason for the audit log.',
    };
  }

  const quote = proposalRowToQuote(row);
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
    const label = String(snap.description || co.description || co.reason || 'Approved additional work').slice(
      0,
      500
    );
    changeOrderLines.push({
      id: `change-order-${co.id}`,
      description: label,
      quantity: 1,
      unitPrice: amount,
      total: amount,
      kind: 'change_order',
    });
  }
  if (changeOrderLines.length) invoiceLineItems = [...invoiceLineItems, ...changeOrderLines];

  const invoiceTotals = computeQuoteTotals({
    lineItems: invoiceLineItems,
    discountType: quote.discountType,
    discountValue: quote.discountValue,
    shippingAmount: quote.shippingAmount,
    additionalCharges: quote.additionalCharges,
    taxMode: quote.taxMode,
    taxValue: quote.taxValue,
  });
  const invoiceNumber = ensureFbiNumber(quote.id);
  const versionKey = quote.versionNumber || 1;
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
      invoiceTotals.total,
      invoiceTotals.subtotal,
      invoiceTotals.total,
      JSON.stringify(invoiceLineItems),
      JSON.stringify(quote.additionalCharges),
      quote.discountType,
      quote.discountValue,
      invoiceTotals.discountAmount,
      quote.shippingAmount,
      quote.shippingLabel,
      quote.taxMode,
      quote.taxValue,
      invoiceTotals.taxAmount,
      quote.customerNotes,
      quote.termsConditions,
      JSON.stringify(quote.billTo),
      quote.customerNotes,
      JSON.stringify({
        quoteNumber: quote.quoteNumber,
        convertedAt: new Date().toISOString(),
        versionNumber: versionKey,
        acceptedSnapshotId: quote.acceptedSnapshotId || row.accepted_snapshot_id || null,
        approvedChangeOrders: changeOrderLines.map((l) => ({
          id: l.id,
          description: l.description,
          amount: l.total,
        })),
      }),
      row.quote_valid_until || null,
    ]
  );

  await client.query(
    `UPDATE proposals SET status='converted', converted_invoice_id=$1, locked_at=COALESCE(locked_at, NOW()) WHERE id=$2`,
    [inv[0].id, quote.id]
  );

  await logQuoteActivity(client, {
    proposalId: quote.id,
    invoiceId: inv[0].id,
    jobId: quote.jobId,
    actorUserId,
    action: 'converted_to_invoice',
    detail: { invoiceNumber, versionNumber: versionKey, auto: !forceConvert },
  });
  await audit(client, actorUserId, 'quote_converted_invoice', 'proposal', quote.id, {
    invoiceNumber,
    idempotencyKey: `convert-${quote.id}-v${versionKey}`,
    auto: !forceConvert,
    forceReason: forceReason || null,
  });

  return {
    ok: true,
    alreadyConverted: false,
    invoice: serializeInvoiceRow(inv[0]),
    invoiceRow: inv[0],
  };
}
