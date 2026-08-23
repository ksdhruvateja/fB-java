/**
 * Stripe Checkout + Connect helpers with simulate fallback when keys are missing.
 */

let stripeClient = null;

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

/**
 * Simulated payments are only for local/demo when Stripe is not configured.
 * Never honor a client `simulate: true` flag when live Stripe keys exist.
 */
export function shouldSimulatePayment(clientRequestedSimulate = false) {
  if (!stripeConfigured()) return true;
  if (process.env.NODE_ENV === 'production') return false;
  // Local/dev with Stripe keys: only simulate when explicitly allowed
  return (
    clientRequestedSimulate === true &&
    String(process.env.ALLOW_PAYMENT_SIMULATION || '').toLowerCase() === 'true'
  );
}

export async function getStripe() {
  if (!stripeConfigured()) return null;
  if (stripeClient) return stripeClient;
  const Stripe = (await import('stripe')).default;
  stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY.trim());
  return stripeClient;
}

export function appBaseUrl() {
  return (
    process.env.APP_URL?.trim() ||
    process.env.BRAND_DOMAIN?.trim() ||
    'http://localhost:5000'
  ).replace(/\/$/, '');
}

export async function createCheckoutSession({
  amountCents,
  currency = 'usd',
  customerEmail,
  successPath,
  cancelPath,
  metadata = {},
  description,
  mode = 'payment',
  trialDays = 0,
  origin,
}) {
  const stripe = await getStripe();
  if (!stripe) {
    return { simulated: true, url: null, sessionId: null };
  }
  const lineItem = {
    quantity: 1,
    price_data: {
      currency,
      unit_amount: Math.round(amountCents),
      product_data: { name: description || 'Service payment' },
    },
  };
  if (mode === 'subscription') {
    lineItem.price_data.recurring = { interval: 'month' };
  }
  const baseUrl = origin ? origin.replace(/\/$/, '') : appBaseUrl();
  const sessionParams = {
    mode,
    customer_email: customerEmail || undefined,
    line_items: [lineItem],
    success_url: `${baseUrl}${successPath}`,
    cancel_url: `${baseUrl}${cancelPath}`,
    metadata,
  };
  if (mode === 'payment' && (metadata.paymentType === 'dispatch_fee' || metadata.captureMethod === 'manual')) {
    sessionParams.payment_intent_data = {
      capture_method: 'manual',
    };
  }
  if (mode === 'subscription' && trialDays > 0) {
    sessionParams.subscription_data = {
      trial_period_days: trialDays,
    };
  }
  try {
    const session = await stripe.checkout.sessions.create(sessionParams);
    return { simulated: false, url: session.url, sessionId: session.id };
  } catch (err) {
    console.error('[Stripe API Error, falling back to simulation]', err.message);
    return { simulated: true, url: null, sessionId: null };
  }
}

export async function createConnectAccountLink(accountId, refreshPath, returnPath) {
  const stripe = await getStripe();
  if (!stripe) return { simulated: true, url: null };
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appBaseUrl()}${refreshPath}`,
    return_url: `${appBaseUrl()}${returnPath}`,
    type: 'account_onboarding',
  });
  return { simulated: false, url: link.url };
}

export async function createConnectAccountUpdateLink(accountId, refreshPath, returnPath) {
  const stripe = await getStripe();
  if (!stripe) return { simulated: true, url: null };
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appBaseUrl()}${refreshPath}`,
    return_url: `${appBaseUrl()}${returnPath}`,
    type: 'account_update',
  });
  return { simulated: false, url: link.url };
}

const STRIPE_RETURN = '/?stripe=return';
const STRIPE_REFRESH = '/?stripe=refresh';

export function stripeConnectReturnUrl() {
  return STRIPE_RETURN;
}

export function stripeConnectRefreshUrl() {
  return STRIPE_REFRESH;
}

/**
 * Masked external accounts for contractor payout destination display.
 * Never returns full account numbers — Stripe holds sensitive data.
 */
export async function listConnectExternalAccounts(accountId) {
  const stripe = await getStripe();
  if (!stripe || !accountId) {
    return {
      simulated: true,
      accounts: [
        { id: 'sim_ba_1', objectType: 'bank_account', bankName: 'Demo Bank', last4: '6789', currency: 'usd', defaultForCurrency: true, status: 'verified' },
      ],
    };
  }
  try {
    const list = await stripe.accounts.listExternalAccounts(accountId, { object: 'bank_account', limit: 10 });
    const cardList = await stripe.accounts.listExternalAccounts(accountId, { object: 'card', limit: 5 });
    const accounts = [...list.data, ...cardList.data].map((ext) => ({
      id: ext.id,
      objectType: ext.object,
      bankName: ext.bank_name || ext.brand || (ext.object === 'card' ? 'Debit card' : 'Bank'),
      last4: ext.last4,
      currency: ext.currency,
      defaultForCurrency: ext.default_for_currency === true,
      status: ext.status || 'unknown',
      routingLast4: ext.routing_number ? String(ext.routing_number).slice(-4) : null,
    }));
    return { simulated: false, accounts };
  } catch (err) {
    console.error('listConnectExternalAccounts:', err.message);
    return { simulated: false, accounts: [], error: err.message };
  }
}

export function summarizeConnectAccount(account, externalAccounts = []) {
  if (!account) {
    return {
      payoutsEnabled: false,
      verificationStatus: 'unverified',
      bankAccountStatus: 'missing',
      instantPayoutsEligible: false,
      requirementsDue: [],
    };
  }
  const requirementsDue = [
    ...(account.requirements?.currently_due || []),
    ...(account.requirements?.past_due || []),
  ];
  const defaultAccount = externalAccounts.find((a) => a.defaultForCurrency) || externalAccounts[0];
  return {
    payoutsEnabled: account.payouts_enabled === true,
    verificationStatus: requirementsDue.length === 0 && account.details_submitted ? 'verified' : 'action_required',
    bankAccountStatus: defaultAccount ? 'connected' : 'missing',
    instantPayoutsEligible: account.capabilities?.transfers === 'active',
    requirementsDue,
    defaultDestination: defaultAccount || null,
  };
}

export async function createExpressAccount(email) {
  const stripe = await getStripe();
  if (!stripe) {
    return { simulated: true, accountId: `sim_acct_${Date.now()}` };
  }
  const account = await stripe.accounts.create({
    type: 'express',
    email: email || undefined,
    capabilities: {
      transfers: { requested: true },
    },
  });
  return { simulated: false, accountId: account.id };
}

export async function createTransfer({ amountCents, destinationAccountId, transferGroup, metadata }) {
  const stripe = await getStripe();
  if (!stripe) {
    return { simulated: true, transferId: `sim_tr_${Date.now()}` };
  }
  const transfer = await stripe.transfers.create({
    amount: Math.round(amountCents),
    currency: 'usd',
    destination: destinationAccountId,
    transfer_group: transferGroup,
    metadata,
  });
  return { simulated: false, transferId: transfer.id };
}

export async function constructWebhookEvent(rawBody, signature) {
  const stripe = await getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) return null;
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

export async function capturePaymentIntent(paymentIntentId, amountCents = null) {
  const stripe = await getStripe();
  if (!stripe) return { simulated: true };
  try {
    const params = {};
    if (amountCents != null) {
      params.amount_to_capture = Math.round(amountCents);
    }
    const pi = await stripe.paymentIntents.capture(paymentIntentId, params);
    return { ok: true, status: pi.status };
  } catch (err) {
    console.error('Stripe capture error:', err);
    return { ok: false, error: err.message };
  }
}

export async function cancelPaymentIntent(paymentIntentId) {
  const stripe = await getStripe();
  if (!stripe) return { simulated: true };
  try {
    const pi = await stripe.paymentIntents.cancel(paymentIntentId);
    return { ok: true, status: pi.status };
  } catch (err) {
    console.error('Stripe cancel error:', err);
    return { ok: false, error: err.message };
  }
}

export async function retrieveConnectAccount(accountId) {
  const stripe = await getStripe();
  if (!stripe || !accountId) return { simulated: true, account: null };
  try {
    const account = await stripe.accounts.retrieve(accountId);
    return { simulated: false, account };
  } catch (err) {
    console.error('Stripe retrieve account error:', err.message);
    return { simulated: false, account: null, error: err.message };
  }
}

export async function createConnectLoginLink(accountId) {
  const stripe = await getStripe();
  if (!stripe || !accountId) return { simulated: true, url: null };
  try {
    const link = await stripe.accounts.createLoginLink(accountId);
    return { simulated: false, url: link.url };
  } catch (err) {
    console.error('Stripe login link error:', err.message);
    return { simulated: false, url: null, error: err.message };
  }
}

/**
 * Transfer funds to connected account, then create standard or instant payout.
 */
export async function createConnectPayout({
  amountCents,
  destinationAccountId,
  transferGroup,
  metadata,
  method = 'standard',
}) {
  const stripe = await getStripe();
  if (!stripe) {
    return {
      simulated: true,
      transferId: `sim_tr_${Date.now()}`,
      payoutId: method === 'instant' ? `sim_po_instant_${Date.now()}` : `sim_po_${Date.now()}`,
    };
  }

  const transfer = await stripe.transfers.create({
    amount: Math.round(amountCents),
    currency: 'usd',
    destination: destinationAccountId,
    transfer_group: transferGroup,
    metadata,
  });

  let payoutId = null;
  if (method === 'instant') {
    const payout = await stripe.payouts.create(
      {
        amount: Math.round(amountCents),
        currency: 'usd',
        method: 'instant',
        metadata,
      },
      { stripeAccount: destinationAccountId }
    );
    payoutId = payout.id;
  }

  return { simulated: false, transferId: transfer.id, payoutId };
}

export async function createStandardConnectPayout({ amountCents, connectedAccountId, metadata }) {
  const stripe = await getStripe();
  if (!stripe) {
    return { simulated: true, payoutId: `sim_po_${Date.now()}` };
  }
  const payout = await stripe.payouts.create(
    {
      amount: Math.round(amountCents),
      currency: 'usd',
      method: 'standard',
      metadata,
    },
    { stripeAccount: connectedAccountId }
  );
  return { simulated: false, payoutId: payout.id };
}
