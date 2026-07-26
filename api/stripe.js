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
}) {
  const stripe = await getStripe();
  if (!stripe) {
    return { simulated: true, url: null, sessionId: null };
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: customerEmail || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: Math.round(amountCents),
          product_data: { name: description || 'Service payment' },
        },
      },
    ],
    success_url: `${appBaseUrl()}${successPath}`,
    cancel_url: `${appBaseUrl()}${cancelPath}`,
    metadata,
  });
  return { simulated: false, url: session.url, sessionId: session.id };
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
