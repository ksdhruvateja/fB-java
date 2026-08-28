/**
 * Authoritative server-side financial calculations.
 * Tips are never merged into service revenue; platform markup applies to service only.
 */
import { dollarsToCents, calculateContractorPayout, calculateInstantPayoutFee, normalizePayoutSettings } from './payout-service.js';

export { dollarsToCents };

/** Customer checkout total = service + optional tip. */
export function calculateCustomerPaymentTotal({ serviceAmountCents, tipAmountCents = 0 }) {
  const service = Math.max(0, Math.round(Number(serviceAmountCents || 0)));
  const tip = Math.max(0, Math.round(Number(tipAmountCents || 0)));
  return {
    serviceAmountCents: service,
    tipAmountCents: tip,
    customerTotalCents: service + tip,
  };
}

/**
 * Contractor payable: approved service net + 100% of tip; platform fee on service only.
 */
export function calculateContractorPayable({
  serviceRetailCents,
  serviceContractorNetCents,
  tipAmountCents = 0,
  adjustmentsCents = 0,
  instantPayoutRequested = false,
  instantPayoutSettings = {},
}) {
  const retail = Math.max(0, Math.round(Number(serviceRetailCents || 0)));
  const serviceNet = Math.max(0, Math.round(Number(serviceContractorNetCents || 0)));
  const tip = Math.max(0, Math.round(Number(tipAmountCents || 0)));
  const platformFeeCents = Math.max(0, retail - serviceNet);

  // Contractor earns approved service net + 100% of tip (platform fee already taken from service retail).
  const grossAmountCents = serviceNet + tip;
  const netBeforeInstantCents = Math.max(
    0,
    serviceNet + tip + Math.round(Number(adjustmentsCents || 0))
  );

  const settings = normalizePayoutSettings(instantPayoutSettings);
  let instantPayoutFeeCents = 0;
  let netPayoutCents = netBeforeInstantCents;

  if (instantPayoutRequested) {
    instantPayoutFeeCents = calculateInstantPayoutFee(netBeforeInstantCents, settings);
    if (settings.fixbridge_absorbs_fee) {
      netPayoutCents = netBeforeInstantCents;
    } else {
      netPayoutCents = Math.max(0, netBeforeInstantCents - instantPayoutFeeCents);
    }
  }

  return {
    serviceRetailCents: retail,
    serviceContractorNetCents: serviceNet,
    tipAmountCents: tip,
    platformFeeCents,
    grossAmountCents,
    instantPayoutFeeCents,
    otherAdjustmentsCents: Math.round(Number(adjustmentsCents || 0)),
    netBeforeInstantCents,
    netPayoutCents,
  };
}

/** Sum approved change-order dollars for payout economics. */
export async function sumApprovedChangeOrderAmounts(pool, jobId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(contractor_net),0)::numeric AS contractor_net,
            COALESCE(SUM(retail_amount),0)::numeric AS retail_amount
     FROM change_orders WHERE job_id=$1 AND status='approved'`,
    [jobId]
  );
  return {
    contractorNetDollars: Number(rows[0]?.contractor_net || 0),
    retailDollars: Number(rows[0]?.retail_amount || 0),
  };
}

/** Bridge from job/proposal row amounts + optional tip dollars + approved change orders. */
export function amountsFromJobProposalAndTip(job, proposal, tipDollars = 0, changeOrderTotals = null) {
  const baseRetailCents =
    proposal?.retail_amount != null
      ? dollarsToCents(proposal.retail_amount)
      : job?.customer_retail_estimate_high != null
        ? dollarsToCents(job.customer_retail_estimate_high)
        : 0;

  const baseContractorNetCents =
    proposal?.contractor_net != null
      ? dollarsToCents(proposal.contractor_net)
      : job?.estimated_contractor_net_high != null
        ? dollarsToCents(job.estimated_contractor_net_high)
        : job?.estimated_contractor_net_low != null
          ? dollarsToCents(job.estimated_contractor_net_low)
          : 0;

  const coRetailCents = dollarsToCents(changeOrderTotals?.retailDollars || 0);
  const coContractorNetCents = dollarsToCents(changeOrderTotals?.contractorNetDollars || 0);
  const retailCents = baseRetailCents + coRetailCents;
  const contractorNetCents = baseContractorNetCents + coContractorNetCents;

  const tipCents = dollarsToCents(tipDollars);

  const payable = calculateContractorPayable({
    serviceRetailCents: retailCents,
    serviceContractorNetCents: contractorNetCents,
    tipAmountCents: tipCents,
  });

  return {
    ...payable,
    tipAmountCents: tipCents,
    serviceAmountCents: retailCents,
    serviceContractorNetCents: contractorNetCents,
    serviceRetailCents: retailCents,
  };
}

/** Split Stripe session total into service vs tip using metadata or invoice service due. */
export function splitPaymentTotal({ paidTotalCents, serviceDueCents, tipAmountCentsFromMeta = null }) {
  const paid = Math.max(0, Math.round(Number(paidTotalCents || 0)));
  const serviceDue = Math.max(0, Math.round(Number(serviceDueCents || 0)));
  if (tipAmountCentsFromMeta != null && Number.isFinite(Number(tipAmountCentsFromMeta))) {
    const tip = Math.max(0, Math.round(Number(tipAmountCentsFromMeta)));
    const service = Math.max(0, paid - tip);
    return { serviceAmountCents: service, tipAmountCents: tip, customerTotalCents: paid };
  }
  const tip = Math.max(0, paid - serviceDue);
  const service = Math.max(0, paid - tip);
  return calculateCustomerPaymentTotal({ serviceAmountCents: service, tipAmountCents: tip });
}
