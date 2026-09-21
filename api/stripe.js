/**
 * Stripe Checkout + Connect helpers.
 * Payments require STRIPE_SECRET_KEY — no simulated checkout fallback.
 */

let stripeClient = null;

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

/** Simulated payments are disabled — always use live Stripe when charging. */
export function shouldSimulatePayment(_clientRequestedSimulate = false) {
  return false;
}

/** Call before charging: fails if Stripe is not configured. */
export function assertPaymentsAvailable(_clientRequestedSimulate = false) {
  if (!stripeConfigured()) {
    const err = new Error(
      'Payments are not configured. Set STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET for webhooks) in your environment.'
    );
    err.status = 503;
    err.code = 'STRIPE_NOT_CONFIGURED';
    throw err;
  }
  return { simulate: false };
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
  lineItems,
  currency = 'usd',
  customerEmail,
  successPath,
  cancelPath,
  metadata = {},
  description,
  mode = 'payment',
  trialDays = 0,
  interval = 'month',
  origin,
  idempotencyKey,
}) {
  assertPaymentsAvailable();
  const stripe = await getStripe();
  if (!stripe) {
    const err = new Error('Stripe is not configured.');
    err.status = 503;
    err.code = 'STRIPE_NOT_CONFIGURED';
    throw err;
  }

  const buildLineItem = (cents, name) => ({
    quantity: 1,
    price_data: {
      currency,
      unit_amount: Math.round(cents),
      product_data: { name: name || description || 'Service payment' },
    },
  });

  let checkoutLineItems;
  if (Array.isArray(lineItems) && lineItems.length) {
    checkoutLineItems = lineItems.map((li) =>
      buildLineItem(li.amountCents, li.description || description || 'Service payment')
    );
  } else {
    const lineItem = buildLineItem(amountCents, description || 'Service payment');
    if (mode === 'subscription') {
      lineItem.price_data.recurring = { interval: interval === 'year' ? 'year' : 'month' };
    }
    checkoutLineItems = [lineItem];
  }

  const baseUrl = origin ? origin.replace(/\/$/, '') : appBaseUrl();
  const sessionParams = {
    mode,
    customer_email: customerEmail || undefined,
    line_items: checkoutLineItems,
    success_url: `${baseUrl}${successPath}`,
    cancel_url: `${baseUrl}${cancelPath}`,
    metadata,
  };
  if (mode === 'payment' && (metadata.paymentType === 'dispatch_fee' || metadata.captureMethod === 'manual')) {
    sessionParams.payment_intent_data = {
      capture_method: 'manual',
    };
  }
  if (mode === 'subscription') {
    sessionParams.subscription_data = {
      ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
      metadata: { ...(metadata || {}) },
    };
  }

  const createOpts = idempotencyKey ? { idempotencyKey: String(idempotencyKey).slice(0, 255) } : undefined;
  const session = await stripe.checkout.sessions.create(sessionParams, createOpts);
  if (!session.url) {
    const err = new Error('Stripe did not return a checkout URL.');
    err.status = 502;
    err.code = 'STRIPE_CHECKOUT_FAILED';
    throw err;
  }
  return { url: session.url, sessionId: session.id };
}

export async function createConnectAccountLink(accountId, refreshPath, returnPath) {
  const stripe = await getStripe();
  if (!stripe) {
    const err = new Error('Stripe is not configured.');
    err.status = 503;
    err.code = 'STRIPE_NOT_CONFIGURED';
    throw err;
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appBaseUrl()}${refreshPath}`,
    return_url: `${appBaseUrl()}${returnPath}`,
    type: 'account_onboarding',
  });
  return { url: link.url };
}

export async function createConnectAccountUpdateLink(accountId, refreshPath, returnPath) {
  const stripe = await getStripe();
  if (!stripe) {
    const err = new Error('Stripe is not configured.');
    err.status = 503;
    err.code = 'STRIPE_NOT_CONFIGURED';
    throw err;
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appBaseUrl()}${refreshPath}`,
    return_url: `${appBaseUrl()}${returnPath}`,
    type: 'account_update',
  });
  return { url: link.url };
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
    const err = new Error('Stripe is not configured.');
    err.status = 503;
    err.code = 'STRIPE_NOT_CONFIGURED';
    throw err;
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
    return { accounts };
  } catch (err) {
    console.error('listConnectExternalAccounts:', err.message);
    return { accounts: [], error: err.message };
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
      connectStatus: normalizeConnectAccountStatus(null),
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
    connectStatus: normalizeConnectAccountStatus(account),
  };
}

/** Normalized Stripe Connect status from live account object. */
export function normalizeConnectAccountStatus(account) {
  if (!account) {
    return {
      connected: false,
      accountId: null,
      onboardingComplete: false,
      transfersEligible: false,
      payoutsEnabled: false,
      chargesEnabled: false,
      detailsSubmitted: false,
      requirements: [],
      currentlyDue: [],
      eventuallyDue: [],
      pastDue: [],
      pendingVerification: [],
      disabledReason: null,
      blockedReason: 'NOT_CONNECTED',
    };
  }

  const currentlyDue = [...(account.requirements?.currently_due || [])];
  const eventuallyDue = [...(account.requirements?.eventually_due || [])];
  const pastDue = [...(account.requirements?.past_due || [])];
  const pendingVerification = [...(account.requirements?.pending_verification || [])];
  const requirements = [...new Set([...currentlyDue, ...pastDue, ...eventuallyDue, ...pendingVerification])];

  let blockedReason = null;
  if (pastDue.some((r) => r.startsWith('tos_acceptance'))) {
    blockedReason = 'TOS_NOT_ACCEPTED';
  } else if (currentlyDue.some((r) => r.startsWith('tos_acceptance'))) {
    blockedReason = 'TOS_NOT_ACCEPTED';
  } else if (account.requirements?.disabled_reason) {
    blockedReason = String(account.requirements.disabled_reason).toUpperCase();
  } else if (account.capabilities?.transfers !== 'active') {
    blockedReason = 'TRANSFERS_INACTIVE';
  } else if (!account.details_submitted) {
    blockedReason = 'ONBOARDING_INCOMPLETE';
  }

  const transfersEligible = account.capabilities?.transfers === 'active';
  const onboardingComplete =
    account.details_submitted === true &&
    pastDue.length === 0 &&
    currentlyDue.length === 0 &&
    transfersEligible;

  return {
    connected: true,
    accountId: account.id,
    onboardingComplete,
    transfersEligible,
    payoutsEnabled: account.payouts_enabled === true,
    chargesEnabled: account.charges_enabled === true,
    detailsSubmitted: account.details_submitted === true,
    requirements,
    currentlyDue,
    eventuallyDue,
    pastDue,
    pendingVerification,
    disabledReason: account.requirements?.disabled_reason || null,
    blockedReason: onboardingComplete ? null : blockedReason || 'ONBOARDING_INCOMPLETE',
  };
}

/** Retrieve actual Stripe processing fee from PaymentIntent → Charge → BalanceTransaction. */
export async function captureStripeProcessingFees(paymentIntentId) {
  const stripe = await getStripe();
  if (!stripe || !paymentIntentId) {
    return { ok: false, error: 'Stripe not configured or missing payment intent.' };
  }
  try {
    const pi = await stripe.paymentIntents.retrieve(String(paymentIntentId), {
      expand: ['latest_charge.balance_transaction'],
    });
    let charge = pi.latest_charge;
    let chargeId = typeof charge === 'string' ? charge : charge?.id || null;
    let bt = charge && typeof charge === 'object' ? charge.balance_transaction : null;

    if (!bt && chargeId) {
      const ch = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
      bt = ch.balance_transaction;
      chargeId = ch.id;
    }
    if (typeof bt === 'string') {
      bt = await stripe.balanceTransactions.retrieve(bt);
    }
    if (!bt) {
      return { ok: false, error: 'Balance transaction not available yet.' };
    }

    return {
      ok: true,
      paymentIntentId: pi.id,
      chargeId,
      balanceTransactionId: bt.id,
      grossCents: Number(bt.amount || 0),
      feeCents: Number(bt.fee || 0),
      netCents: Number(bt.net || 0),
      currency: bt.currency || 'usd',
    };
  } catch (err) {
    console.error('captureStripeProcessingFees:', err.message);
    return { ok: false, error: err.message };
  }
}

export async function persistStripeProcessingFees(pool, paymentId, feeData) {
  if (!paymentId || !feeData?.ok) return null;
  const { rows } = await pool.query(
    `UPDATE payments SET
       stripe_charge_id=COALESCE($2, stripe_charge_id),
       stripe_balance_transaction_id=$3,
       stripe_processing_fee_cents=$4,
       stripe_net_received_cents=$5
     WHERE id=$1
     RETURNING *`,
    [
      paymentId,
      feeData.chargeId,
      feeData.balanceTransactionId,
      feeData.feeCents,
      feeData.netCents,
    ]
  );
  return rows[0] || null;
}

export async function createExpressAccount(email) {
  const stripe = await getStripe();
  if (!stripe) {
    const err = new Error('Stripe is not configured.');
    err.status = 503;
    err.code = 'STRIPE_NOT_CONFIGURED';
    throw err;
  }
  const account = await stripe.accounts.create({
    type: 'express',
    email: email || undefined,
    capabilities: {
      transfers: { requested: true },
    },
  });
  return { accountId: account.id };
}

export async function createTransfer({
  amountCents,
  destinationAccountId,
  transferGroup,
  metadata,
  idempotencyKey = null,
}) {
  const stripe = await getStripe();
  if (!stripe) {
    const err = new Error('Stripe is not configured.');
    err.status = 503;
    err.code = 'STRIPE_NOT_CONFIGURED';
    throw err;
  }
  const params = {
    amount: Math.round(amountCents),
    currency: 'usd',
    destination: destinationAccountId,
    transfer_group: transferGroup,
    metadata,
  };
  const opts = idempotencyKey ? { idempotencyKey: String(idempotencyKey) } : undefined;
  const transfer = await stripe.transfers.create(params, opts);
  return { transferId: transfer.id };
}

export async function constructWebhookEvent(rawBody, signature) {
  const stripe = await getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) return null;
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

export async function capturePaymentIntent(paymentIntentId, amountCents = null) {
  const stripe = await getStripe();
  if (!stripe) {
    return { ok: false, error: 'Stripe is not configured.' };
  }
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
  if (!stripe) {
    return { ok: false, error: 'Stripe is not configured.' };
  }
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
  if (!stripe || !accountId) {
    return { account: null, error: 'Stripe is not configured.' };
  }
  try {
    const account = await stripe.accounts.retrieve(accountId);
    return { account };
  } catch (err) {
    console.error('Stripe retrieve account error:', err.message);
    return { account: null, error: err.message };
  }
}

export async function createConnectLoginLink(accountId) {
  const stripe = await getStripe();
  if (!stripe || !accountId) {
    return { url: null, error: 'Stripe is not configured.' };
  }
  try {
    const link = await stripe.accounts.createLoginLink(accountId);
    return { url: link.url };
  } catch (err) {
    console.error('Stripe login link error:', err.message);
    return { url: null, error: err.message };
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
    const err = new Error('Stripe is not configured.');
    err.status = 503;
    err.code = 'STRIPE_NOT_CONFIGURED';
    throw err;
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

  return { transferId: transfer.id, payoutId };
}

export async function createStandardConnectPayout({ amountCents, connectedAccountId, metadata }) {
  const stripe = await getStripe();
  if (!stripe) {
    const err = new Error('Stripe is not configured.');
    err.status = 503;
    err.code = 'STRIPE_NOT_CONFIGURED';
    throw err;
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
  return { payoutId: payout.id };
}
