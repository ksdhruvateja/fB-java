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
  const lineItems = upgradeLegacyLineItems(legacyItems).filter(
    (item) => !/visit fee credit/i.test(String(item?.label || item?.description || ''))
  );
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
    paymentPlanPercent: row.payment_plan_percent != null ? Number(row.payment_plan_percent) : null,
    initialPaymentAmount: row.initial_payment_amount != null ? Number(row.initial_payment_amount) : null,
    initialPaymentCompleted: row.initial_payment_completed === true,
    lineItems: totals.lineItems,
    subtotal: row.subtotal != null ? Number(row.subtotal) : totals.subtotal,
    versionNumber: parseJson(row.document_snapshot, {})?.versionNumber || null,
    originalEstimateTotal: row.original_quote_total != null ? Number(row.original_quote_total) : null,
    negotiationAdjustment: row.negotiation_adjustment != null ? Number(row.negotiation_adjustment) : 0,
    finalAgreedTotal: row.final_agreed_total != null ? Number(row.final_agreed_total) : total,
    negotiationId: row.negotiation_id != null ? Number(row.negotiation_id) : null,
    negotiationDetails: parseJson(row.negotiation_details, null),
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
    const existingInvoice = existing[0] || null;
    if (existingInvoice) {
      // Repair invoices created before the upfront-credit migration. The $125
      // professional/service fee is a payment credit, not a negotiation
      // adjustment, and must be included in the canonical invoice balance.
      const { rows: ledgerRows } = await client.query(
        `SELECT COALESCE(SUM(
           CASE
             WHEN payment_type IN ('pending_professional_fee','professional_fee','dispatch_fee')
               THEN COALESCE(service_amount, amount, 0)
             WHEN payment_type IN ('invoice_payment','invoice_manual')
               AND (meta->>'invoiceId') = $2
               THEN COALESCE(service_amount, amount, 0)
             ELSE 0
           END
         ),0) AS paid
           FROM payments
          WHERE job_id=$1
            AND status IN ('succeeded','authorized','paid','captured','completed')`,
        [row.job_id, String(existingInvoice.id)]
      );
      const ledgerPaid = round2(ledgerRows[0]?.paid || 0);
      const total = round2(existingInvoice.total || existingInvoice.amount_due || 0);
      const repairedPaid = Math.min(total, Math.max(round2(existingInvoice.paid || 0), ledgerPaid));
      const repairedDue = Math.max(0, round2(total - repairedPaid));
      const repairedStatus = repairedDue <= 0.009 ? 'paid' : repairedPaid > 0 ? 'partially_paid' : 'due';
      if (Math.abs(Number(existingInvoice.paid || 0) - repairedPaid) > 0.009 || Math.abs(Number(existingInvoice.amount_due || 0) - repairedDue) > 0.009) {
        const { rows: repaired } = await client.query(
          `UPDATE homeowner_invoices
              SET paid=$1, amount_due=$2, status=$3, updated_at=NOW()
            WHERE id=$4
            RETURNING *`,
          [repairedPaid, repairedDue, repairedStatus, existingInvoice.id]
        );
        existing[0] = repaired[0] || existingInvoice;
      }
    }
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
  // Visit/dispatch fee credits are money already received, not a discount on
  // the authoritative invoice. Show the gross service invoice and carry the
  // prior dispatch payment in `paid`. Ordinary discounts remain untouched.
  let invoiceLineItems = [...(quote.lineItems || [])].filter(
    (item) => !/visit fee credit/i.test(String(item?.label || item?.name || item?.description || ''))
  );

  // Keep the invoice breakdown identical to the homeowner-facing quote.
  const configuredServiceCharge = round2(row.service_charge || 0);
  if (configuredServiceCharge > 0) {
    const hasServiceChargeLine = invoiceLineItems.some((item) =>
      /service\s*charge/i.test(String(item?.label || item?.name || item?.description || ''))
    );
    if (!hasServiceChargeLine && invoiceLineItems.length === 1) {
      const targetTotal = round2(row.retail_amount ?? quote.total);
      const storedLineTotal = round2(invoiceLineItems[0]?.amount || 0);
      if (Math.abs(storedLineTotal - targetTotal) < 0.01) {
        const serviceLabor = round2(Math.max(0, targetTotal - configuredServiceCharge));
        invoiceLineItems = [
          { ...invoiceLineItems[0], unitPrice: serviceLabor, amount: serviceLabor },
          { id: `service-charge-${quote.id}`, name: 'Service charge', label: 'Service charge', description: '', qty: 1, unit: 'Flat Rate', unitPrice: configuredServiceCharge, amount: configuredServiceCharge, visible: true },
        ];
      }
    }
  }
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

  // Preserve every successful upfront/service payment that belongs to this
  // managed job. The $125 professional/service fee is a real payment credit,
  // not a discount and must survive quote negotiation and invoice creation.
  const { rows: priorPaymentRows } = await client.query(
    `SELECT COALESCE(SUM(
       CASE
         WHEN payment_type IN ('pending_professional_fee','professional_fee','dispatch_fee')
           THEN COALESCE(service_amount, amount, 0)
         WHEN payment_type IN ('invoice_payment','invoice_manual')
           AND (meta->>'invoiceId') = $2
           THEN COALESCE(service_amount, amount, 0)
         ELSE 0
       END
     ),0) AS paid
       FROM payments
      WHERE job_id=$1
        AND status IN ('succeeded','authorized','paid','captured','completed')`,
    [quote.jobId, String(ensureFbiNumber(quote.id))]
  );
  const priorPaid = round2(priorPaymentRows[0]?.paid || 0);
  const invoiceTotal = round2(invoiceTotals.total);
  const invoicePaid = Math.min(priorPaid, invoiceTotal);
  const invoiceAmountDue = Math.max(0, round2(invoiceTotal - invoicePaid));
  const invoiceStatus = invoiceAmountDue <= 0 ? 'paid' : 'due';
  const { rows: negotiationRows } = await client.query(
    `SELECT id, requested_amount, original_amount, admin_amount, action, created_at, resolved_at
       FROM proposal_negotiations
      WHERE proposal_id=$1 AND action IN ('accepted','countered_by_homeowner')
      ORDER BY resolved_at DESC NULLS LAST, id DESC LIMIT 1`,
    [quote.id]
  );
  const acceptedNegotiation = negotiationRows[0] || null;
  const originalQuoteTotal = acceptedNegotiation
    ? round2(Number(acceptedNegotiation.original_amount || quote.total))
    : round2(quote.total);
  const negotiationFinalTotal = acceptedNegotiation
    ? round2(Number(acceptedNegotiation.admin_amount || acceptedNegotiation.requested_amount || quote.total))
    : round2(quote.total);
  const negotiationAdjustment = round2(negotiationFinalTotal - originalQuoteTotal);
  const negotiationDetails = acceptedNegotiation ? {
    negotiationId: Number(acceptedNegotiation.id),
    action: acceptedNegotiation.action,
    requestedAmount: acceptedNegotiation.requested_amount == null ? null : Number(acceptedNegotiation.requested_amount),
    adminAmount: acceptedNegotiation.admin_amount == null ? null : Number(acceptedNegotiation.admin_amount),
    originalEstimateTotal: originalQuoteTotal,
    negotiationAdjustment,
    finalAgreedTotal: negotiationFinalTotal,
    createdAt: acceptedNegotiation.created_at,
    resolvedAt: acceptedNegotiation.resolved_at,
  } : null;
  const { rows: inv } = await client.query(
    `INSERT INTO homeowner_invoices
      (invoice_number, job_id, homeowner_user_id, proposal_id, negotiation_id, original_quote_total, negotiation_adjustment, final_agreed_total, negotiation_details, amount_due, subtotal, paid, total,
       payment_plan_percent, initial_payment_amount, initial_payment_completed,
       line_items, additional_charges, discount_type, discount_value, discount_amount,
       shipping_amount, shipping_label, tax_mode, tax_value, tax_amount,
       customer_notes, terms_conditions, bill_to, status, custom_note, document_snapshot, due_date)
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)
     RETURNING *`,
    [
      invoiceNumber,
      quote.jobId,
      quote.homeownerUserId,
      quote.id,
      acceptedNegotiation ? Number(acceptedNegotiation.id) : null,
      originalQuoteTotal,
      negotiationAdjustment,
      negotiationFinalTotal,
      JSON.stringify(negotiationDetails),
      invoiceAmountDue,
      invoiceTotals.subtotal,
      invoicePaid,
      invoiceTotal,
      null,
      0,
      invoiceAmountDue <= 0,
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
      invoiceStatus,
      quote.customerNotes,
      JSON.stringify({
        quoteNumber: quote.quoteNumber,
        convertedAt: new Date().toISOString(),
        versionNumber: versionKey,
        acceptedSnapshotId: quote.acceptedSnapshotId || row.accepted_snapshot_id || null,
        priorPaid,
        negotiation: negotiationDetails,
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
