/** Client-side professional quote document helpers (mirrors api/quote-document.js). */

export const QUOTE_UNITS = [
  "Each",
  "Service",
  "Hour",
  "Day",
  "Foot",
  "Sq Ft",
  "Unit",
  "Flat Rate",
  "Custom",
] as const;

export type QuoteLineItem = {
  id: string;
  name: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
  visible?: boolean;
};

export type AdditionalCharge = {
  id: string;
  name: string;
  description: string;
  amount: number;
};

export type QuoteBillTo = {
  name?: string | null;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  cityStateZip?: string | null;
  address?: string | null;
};

export type QuoteDocument = {
  id: number;
  quoteNumber: string;
  jobId: number;
  bidId?: number | null;
  status: string;
  createdAt?: string | null;
  publishedAt?: string | null;
  quoteValidUntil?: string | null;
  bookingId?: string | null;
  jobTitle?: string | null;
  jobCategory?: string | null;
  jobZip?: string | null;
  jobAddress?: string | null;
  propertyId?: number | null;
  homeownerName?: string | null;
  homeownerEmail?: string | null;
  homeownerPhone?: string | null;
  contractorName?: string | null;
  contractorEmail?: string | null;
  contractorPhone?: string | null;
  contractorCompany?: string | null;
  billTo?: QuoteBillTo | null;
  companyName?: string | null;
  lineItems: QuoteLineItem[];
  discountType: string;
  discountValue: number;
  discountAmount: number;
  discountReason?: string | null;
  couponCode?: string | null;
  jobCoupon?: {
    code: string;
    label?: string | null;
    discountType: "percent" | "fixed";
    value: number;
  } | null;
  shippingAmount: number;
  shippingLabel?: string | null;
  additionalCharges: AdditionalCharge[];
  taxMode: string;
  taxValue: number;
  taxAmount: number;
  subtotal: number;
  total: number;
  retailAmount?: number;
  customerNotes?: string | null;
  termsConditions?: string | null;
  internalNotes?: string | null;
  scopeSummary?: string | null;
  timeline?: string | null;
  warranty?: string | null;
  exclusions?: string | null;
  contractorQuoteAmount?: number | null;
  contractorNotes?: string | null;
  contractorSpecialConditions?: string | null;
  contractorNet?: number | null;
  invoice?: {
    id: number;
    invoiceNumber: string;
    status: string;
    amountDue?: number | null;
    paid?: number;
    paymentLink?: string | null;
  } | null;
};

export type QuoteInvoice = {
  id: number;
  invoiceNumber: string;
  proposalId?: number | null;
  jobId: number;
  status: string;
  lineItems: QuoteLineItem[];
  additionalCharges: AdditionalCharge[];
  discountType: string;
  discountValue: number;
  discountAmount: number;
  shippingAmount: number;
  shippingLabel?: string | null;
  taxMode: string;
  taxValue: number;
  taxAmount: number;
  subtotal: number;
  total: number;
  paid: number;
  amountDue: number;
  billTo?: QuoteBillTo | null;
  customerNotes?: string | null;
  termsConditions?: string | null;
  stripePaymentLinkUrl?: string | null;
  paymentMethod?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
};

export type QuoteActivity = {
  id: number;
  action: string;
  detail?: Record<string, unknown>;
  actorName?: string | null;
  createdAt: string;
};

function roundMoney(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function newId(prefix = "li") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyLineItem(): QuoteLineItem {
  return {
    id: newId(),
    name: "",
    description: "",
    qty: 1,
    unit: "Service",
    unitPrice: 0,
    amount: 0,
    visible: true,
  };
}

export function emptyCharge(): AdditionalCharge {
  return { id: newId("ch"), name: "", description: "", amount: 0 };
}

export function lineAmount(qty: number, unitPrice: number) {
  return roundMoney((Number(qty) || 0) * (Number(unitPrice) || 0));
}

export function computeTotals(input: {
  lineItems: QuoteLineItem[];
  discountType: string;
  discountValue: number;
  shippingAmount: number;
  additionalCharges: AdditionalCharge[];
  taxMode: string;
  taxValue: number;
}) {
  const items = input.lineItems.filter((i) => i.visible !== false);
  const subtotal = roundMoney(items.reduce((s, i) => s + lineAmount(i.qty, i.unitPrice), 0));
  const chargesTotal = roundMoney(
    input.additionalCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0),
  );
  const shipping = roundMoney(Math.max(0, Number(input.shippingAmount) || 0));
  let discountAmount = 0;
  const dtype = String(input.discountType || "none").toLowerCase();
  const dval = Number(input.discountValue) || 0;
  if (dtype === "percent" || dtype === "percentage") {
    discountAmount = roundMoney(subtotal * (Math.min(100, Math.max(0, dval)) / 100));
  } else if (dtype === "fixed" || dtype === "amount" || dtype === "dollar") {
    discountAmount = roundMoney(Math.min(subtotal, Math.max(0, dval)));
  }
  const taxableBase = roundMoney(Math.max(0, subtotal - discountAmount + shipping + chargesTotal));
  let taxAmount = 0;
  const tmode = String(input.taxMode || "none").toLowerCase();
  const tval = Number(input.taxValue) || 0;
  if (tmode === "percent" || tmode === "percentage") {
    taxAmount = roundMoney(taxableBase * (Math.max(0, tval) / 100));
  } else if (tmode === "fixed" || tmode === "amount" || tmode === "custom") {
    taxAmount = roundMoney(Math.max(0, tval));
  }
  return {
    subtotal,
    discountAmount,
    shippingAmount: shipping,
    chargesTotal,
    taxAmount,
    total: roundMoney(taxableBase + taxAmount),
  };
}

export function quoteStatusTone(status: string) {
  const s = String(status || "").toLowerCase();
  if (s === "paid") return "bg-emerald-600 text-white";
  if (s === "accepted" || s === "approved" || s === "converted") return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
  if (s === "sent") return "bg-sky-500/15 text-sky-800 dark:text-sky-300";
  if (s === "viewed" || s === "due") return "bg-violet-500/15 text-violet-800 dark:text-violet-300";
  if (s === "declined" || s === "canceled" || s === "cancelled" || s === "void") return "bg-red-500/15 text-red-700 dark:text-red-300";
  if (s === "past_due" || s === "expired") return "bg-red-600 text-white";
  if (s === "partially_paid" || s === "refunded" || s === "partially_refunded") return "bg-orange-500/15 text-orange-800 dark:text-orange-300";
  if (s === "draft") return "bg-muted text-muted-foreground";
  return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
}

export function formatStatusLabel(status: string) {
  const s = String(status || "draft").replace(/_/g, " ");
  if (s.toLowerCase() === "converted") return "Converted to Invoice";
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatActivityAction(action: string) {
  const map: Record<string, string> = {
    quote_saved: "Quote saved",
    discount_updated: "Discount updated",
    quote_sent_email: "Quote sent via email",
    quote_sent_sms: "Quote sent via SMS",
    quote_duplicated: "Quote duplicated",
    quote_canceled: "Quote cancelled",
    converted_to_invoice: "Converted to invoice",
    invoice_sent: "Invoice sent",
    payment_recorded: "Payment recorded",
    payment_link_created: "Payment link generated",
    invoice_paid_stripe: "Paid via Stripe",
  };
  return map[action] || action.replace(/_/g, " ");
}

export function fmtDate(iso?: string | null, withTime = false) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    });
  } catch {
    return iso;
  }
}
