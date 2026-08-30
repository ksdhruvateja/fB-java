/**
 * Job legal / financial evidence aggregation for admin audit.
 */

export async function buildJobEvidencePackage(pool, jobId) {
  const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
  if (!jobs[0]) return null;
  const job = jobs[0];

  const [acceptances, dispatchSnaps, quoteSnaps, paySnaps, changeOrders, payments, dispatchEvidence] =
    await Promise.all([
      pool.query(
        `SELECT * FROM homeowner_acceptances WHERE job_id=$1 ORDER BY accepted_at ASC`,
        [jobId]
      ),
      pool.query(
        `SELECT * FROM professional_dispatch_snapshots WHERE job_id=$1 ORDER BY created_at ASC`,
        [jobId]
      ),
      pool.query(
        `SELECT * FROM quote_acceptance_snapshots WHERE job_id=$1 ORDER BY accepted_at ASC`,
        [jobId]
      ),
      pool.query(
        `SELECT pas.*, p.stripe_payment_intent_id, p.stripe_checkout_session_id, p.amount_cents AS payment_amount_cents
         FROM payment_authorization_snapshots pas
         LEFT JOIN payments p ON p.job_id = pas.job_id AND p.user_id = pas.user_id
         WHERE pas.job_id=$1
         ORDER BY pas.created_at ASC`,
        [jobId]
      ),
      pool.query(`SELECT * FROM change_orders WHERE job_id=$1 ORDER BY created_at ASC`, [jobId]),
      pool.query(
        `SELECT id, amount_cents, status, payment_type, stripe_payment_intent_id, stripe_checkout_session_id, created_at, meta
         FROM payments WHERE job_id=$1 ORDER BY created_at ASC`,
        [jobId]
      ),
      pool.query(`SELECT * FROM job_dispatch_evidence WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1`, [
        jobId,
      ]),
    ]);

  let contractorCompliance = null;
  if (job.assigned_contractor_user_id) {
    const { rows: docs } = await pool.query(
      `SELECT id, document_type, status, issue_date, expiration_date, verified_at, verified_by, file_name, uploaded_at, is_current
       FROM contractor_compliance_documents
       WHERE contractor_user_id=$1
       ORDER BY document_type ASC, is_current DESC, created_at DESC`,
      [job.assigned_contractor_user_id]
    );
    contractorCompliance = {
      contractorUserId: Number(job.assigned_contractor_user_id),
      documents: docs.map((d) => ({
        id: Number(d.id),
        documentType: d.document_type,
        status: d.status,
        effectiveDate: d.issue_date,
        expirationDate: d.expiration_date,
        verifiedAt: d.verified_at,
        verifiedByAdminId: d.verified_by != null ? Number(d.verified_by) : null,
        fileName: d.file_name,
        uploadedAt: d.uploaded_at,
        isCurrent: d.is_current === true,
      })),
    };
  }

  const completion = {
    status: job.status,
    customerConfirmedAt: job.customer_confirmed_at,
    completionReport: job.completion_report,
    contractorCompletedAt: job.contractor_completed_at || null,
  };

  return {
    jobId: Number(jobId),
    bookingId: job.booking_id,
    homeownerUserId: Number(job.homeowner_user_id),
    assignedContractorUserId: job.assigned_contractor_user_id
      ? Number(job.assigned_contractor_user_id)
      : null,
    checkoutSnapshot: job.checkout_snapshot,
    homeownerAcceptances: acceptances.rows.map(serializeAcceptance),
    professionalDispatchSnapshots: dispatchSnaps.rows.map((r) => ({
      id: Number(r.id),
      pricingVersion: r.pricing_version,
      lines: r.lines,
      authorizedNowCents: Number(r.authorized_now_cents),
      currency: r.currency,
      couponCode: r.coupon_code,
      createdAt: r.created_at,
    })),
    quoteSnapshots: quoteSnaps.rows.map((r) => ({
      id: Number(r.id),
      proposalId: Number(r.proposal_id),
      quoteNumber: r.quote_number,
      versionNumber: r.version_number,
      total: r.total != null ? Number(r.total) : null,
      lineItems: r.line_items,
      acceptedAt: r.accepted_at,
    })),
    paymentAuthorizations: paySnaps.rows.map((r) => ({
      id: Number(r.id),
      authorizedAmountCents: Number(r.authorized_amount_cents),
      currency: r.currency,
      policyDocumentVersion: r.policy_document_version,
      stripePaymentIntentId: r.stripe_payment_intent_id,
      stripeCheckoutSessionId: r.stripe_checkout_session_id,
      createdAt: r.created_at,
    })),
    changeOrders: changeOrders.rows.map((r) => ({
      id: Number(r.id),
      status: r.status,
      description: r.description,
      retailAmount: r.retail_amount != null ? Number(r.retail_amount) : null,
      approvedAt: r.approved_at,
      approvedSnapshot: r.approved_snapshot,
    })),
    payments: payments.rows.map((r) => ({
      id: Number(r.id),
      amountCents: Number(r.amount_cents),
      status: r.status,
      paymentType: r.payment_type,
      stripePaymentIntentId: r.stripe_payment_intent_id,
      stripeCheckoutSessionId: r.stripe_checkout_session_id,
      createdAt: r.created_at,
      meta: r.meta,
    })),
    dispatchEvidence: dispatchEvidence.rows[0]
      ? {
          id: Number(dispatchEvidence.rows[0].id),
          professionalDispatchSnapshotId: dispatchEvidence.rows[0].professional_dispatch_snapshot_id,
          authorizedNowCents: Number(dispatchEvidence.rows[0].authorized_now_cents),
          complianceDocumentIds: dispatchEvidence.rows[0].compliance_document_ids,
          complianceStatus: dispatchEvidence.rows[0].compliance_status,
          dispatchAt: dispatchEvidence.rows[0].dispatch_at,
        }
      : null,
    contractorCompliance,
    completion,
  };
}

function serializeAcceptance(r) {
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    acceptanceType: r.acceptance_type,
    documentKey: r.document_key,
    documentVersion: r.document_version,
    documentTitle: r.document_title,
    acceptedAt: r.accepted_at,
    jobId: r.job_id != null ? Number(r.job_id) : null,
    quoteId: r.quote_id != null ? Number(r.quote_id) : null,
    changeOrderId: r.change_order_id != null ? Number(r.change_order_id) : null,
    paymentId: r.payment_id != null ? Number(r.payment_id) : null,
    snapshotId: r.snapshot_id != null ? Number(r.snapshot_id) : null,
    ipAddress: r.ip_address,
    sourceRoute: r.source_route,
  };
}

export async function recordJobDispatchEvidence(pool, {
  jobId,
  homeownerUserId,
  contractorUserId,
  professionalDispatchSnapshotId,
  authorizedNowCents,
  complianceDocumentIds,
  complianceStatus,
}) {
  const { rows } = await pool.query(
    `INSERT INTO job_dispatch_evidence (
       job_id, homeowner_user_id, contractor_user_id,
       professional_dispatch_snapshot_id, authorized_now_cents, currency,
       compliance_document_ids, compliance_status, dispatch_at
     ) VALUES ($1,$2,$3,$4,$5,'usd',$6,$7,NOW())
     RETURNING id`,
    [
      jobId,
      homeownerUserId,
      contractorUserId || null,
      professionalDispatchSnapshotId || null,
      authorizedNowCents,
      JSON.stringify(complianceDocumentIds || []),
      complianceStatus || null,
    ]
  );
  return rows[0]?.id;
}
