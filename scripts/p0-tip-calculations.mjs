/**
 * Tip calculation unit checks (no DB/API required).
 * Run: node scripts/p0-tip-calculations.mjs
 */
import {
  calculateCustomerPaymentTotal,
  calculateContractorPayable,
  amountsFromJobProposalAndTip,
  splitPaymentTotal,
} from '../api/financial-calculations.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// $500 service + $0 tip
const zeroTip = calculateCustomerPaymentTotal({ serviceAmountCents: 50000, tipAmountCents: 0 });
assert(zeroTip.customerTotalCents === 50000, '$0 tip total wrong');

// $500 + $50 (10%) tip
const withTip = calculateCustomerPaymentTotal({ serviceAmountCents: 50000, tipAmountCents: 5000 });
assert(withTip.customerTotalCents === 55000, 'tip total wrong');

// Contractor: $400 net service + $50 tip, $100 platform fee on service only
const payable = calculateContractorPayable({
  serviceRetailCents: 50000,
  serviceContractorNetCents: 40000,
  tipAmountCents: 5000,
});
assert(payable.platformFeeCents === 10000, 'platform fee should be on service only');
assert(payable.netBeforeInstantCents === 45000, 'contractor net should be 400+50');
assert(payable.tipAmountCents === 5000, 'tip cents missing');

// Job/proposal bridge
const job = { customer_retail_estimate_high: 500, estimated_contractor_net_high: 400 };
const proposal = { retail_amount: 500, contractor_net: 400 };
const fromJob = amountsFromJobProposalAndTip(job, proposal, 50);
assert(fromJob.tipAmountCents === 5000, 'job tip bridge wrong');
assert(fromJob.netBeforeInstantCents === 45000, 'job payout with tip wrong');

// Payment split from Stripe metadata
const split = splitPaymentTotal({ paidTotalCents: 55000, serviceDueCents: 50000, tipAmountCentsFromMeta: 5000 });
assert(split.tipAmountCents === 5000, 'split tip wrong');
assert(split.serviceAmountCents === 50000, 'split service wrong');

console.log('PASS p0-tip-calculations (6 checks)');
process.exit(0);
