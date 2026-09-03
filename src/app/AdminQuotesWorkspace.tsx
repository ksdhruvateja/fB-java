import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Search,
  FileText,
  ExternalLink,
  Plus,
  Trash2,
  Copy,
  Eye,
  Send,
  Printer,
  ChevronUp,
  ChevronDown,
  X,
  Link2,
  CheckCircle2,
  Banknote,
} from "lucide-react";
import {
  adminCancelQuote,
  adminConvertQuoteToInvoice,
  adminCreateInvoicePaymentLink,
  adminDuplicateQuote,
  adminMarkInvoicePaid,
  adminQuoteWorkspace,
  adminSaveQuoteDocument,
  adminSendQuote,
  adminSendWorkspaceInvoice,
  formatMoney,
  type Proposal,
} from "./managedJobs";
import { getStoredToken } from "./auth";
import { brand } from "../config/brand";
import {
  QUOTE_UNITS,
  computeTotals,
  emptyCharge,
  emptyLineItem,
  formatActivityAction,
  formatStatusLabel,
  fmtDate,
  lineAmount,
  quoteStatusTone,
  type AdditionalCharge,
  type QuoteActivity,
  type QuoteDocument,
  type QuoteInvoice,
  type QuoteLineItem,
} from "./quoteDocument";
import { StructuredAddressFields } from "./UsLocationFields";
import {
  formatAddressLines,
  normalizeStructuredAddress,
  structuredToBillToExtras,
} from "./addressFormat";

const STATUS_FILTERS = [
  "all",
  "draft",
  "sent",
  "viewed",
  "accepted",
  "approved",
  "declined",
  "converted",
  "paid",
  "canceled",
  "expired",
] as const;

const CHARGE_PRESETS = [
  "Emergency Service",
  "After Hours",
  "Equipment",
  "Permit",
  "Disposal",
  "Parking",
  "Travel",
  "Additional Labor",
  "Custom Fee",
];

type ModalKind = null | "send" | "preview" | "markPaid" | "paymentLink" | "coupon";

function couponAlreadyApplied(
  coupon: { code: string; value: number; discountType: string } | null | undefined,
  discountType: string,
  discountValue: number,
  discountReason: string,
  couponCode?: string | null,
) {
  if (!coupon?.code) return true;
  const code = coupon.code.toUpperCase();
  if (String(couponCode || "").toUpperCase() === code) return true;
  if (String(discountReason || "").toUpperCase().includes(code)) return true;
  const mappedType = coupon.discountType === "fixed" ? "fixed" : "percent";
  if (discountType === mappedType && Number(discountValue) === Number(coupon.value) && Number(discountValue) > 0) {
    return true;
  }
  return false;
}

/** Professional quote / invoice document editor. Use alone in Work Queue, or with the list workspace. */
export function AdminQuoteDocumentPanel({
  quoteId,
  onMessage,
  onOpenJob,
  onChanged,
  embedded = false,
}: {
  quoteId: number;
  onMessage: (msg: string) => void;
  onOpenJob?: (jobId: number) => void;
  onChanged?: () => void | Promise<void>;
  embedded?: boolean;
}) {
  return (
    <QuoteDocumentEditor
      quoteId={quoteId}
      onMessage={onMessage}
      onOpenJob={onOpenJob}
      onChanged={onChanged}
      embedded={embedded}
      showList={false}
    />
  );
}

export default function AdminQuotesWorkspace({
  onOpenJob,
  onMessage,
}: {
  onOpenJob: (jobId: number) => void;
  onMessage: (msg: string) => void;
}) {
  return (
    <QuoteDocumentEditor
      quoteId={null}
      onMessage={onMessage}
      onOpenJob={onOpenJob}
      showList
    />
  );
}

function QuoteDocumentEditor({
  quoteId: lockedQuoteId,
  onMessage,
  onOpenJob,
  onChanged,
  embedded = false,
  showList = true,
}: {
  quoteId: number | null;
  onMessage: (msg: string) => void;
  onOpenJob?: (jobId: number) => void;
  onChanged?: () => void | Promise<void>;
  embedded?: boolean;
  showList?: boolean;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(showList);
  const [quotes, setQuotes] = useState<Proposal[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(lockedQuoteId);
  const [workspaceLoading, setWorkspaceLoading] = useState(Boolean(lockedQuoteId));
  const [saving, setSaving] = useState(false);
  const [quote, setQuote] = useState<QuoteDocument | null>(null);
  const [invoice, setInvoice] = useState<QuoteInvoice | null>(null);
  const [activity, setActivity] = useState<QuoteActivity[]>([]);
  const [previousRevision, setPreviousRevision] = useState<{
    versionNumber: number;
    changeReason?: string | null;
    customerTotal?: number | null;
    contractorAmount?: number | null;
    snapshot?: Record<string, unknown>;
  } | null>(null);
  const [jobQuoteHistory, setJobQuoteHistory] = useState<
    { id: number; quoteNumber?: string; status: string; versionNumber: number; total: number }[]
  >([]);
  const [modal, setModal] = useState<ModalKind>(null);

  // Editable document state
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([]);
  const [discountType, setDiscountType] = useState("none");
  const [discountValue, setDiscountValue] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [shippingAmount, setShippingAmount] = useState(0);
  const [shippingLabel, setShippingLabel] = useState("Shipping / Delivery");
  const [charges, setCharges] = useState<AdditionalCharge[]>([]);
  const [taxMode, setTaxMode] = useState("none");
  const [taxValue, setTaxValue] = useState(0);
  const [customerNotes, setCustomerNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [contractorQuoteAmount, setContractorQuoteAmount] = useState(0);
  const [contractorNotes, setContractorNotes] = useState("");
  const [contractorWarranty, setContractorWarranty] = useState("");
  const [contractorSpecial, setContractorSpecial] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [billTo, setBillTo] = useState({
    name: "",
    companyName: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    zip: "",
  });

  // Send modal
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(false);
  const [sendToEmail, setSendToEmail] = useState("");
  const [sendToPhone, setSendToPhone] = useState("");
  const [sendSubject, setSendSubject] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [busyAction, setBusyAction] = useState(false);
  const [smsAvailable, setSmsAvailable] = useState(false);

  // Mark paid
  const [paidAmount, setPaidAmount] = useState(0);
  const [paidMethod, setPaidMethod] = useState("card");
  const [paidRef, setPaidRef] = useState("");
  const [paidNotes, setPaidNotes] = useState("");
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentLinkUrl, setPaymentLinkUrl] = useState("");
  const [jobCoupon, setJobCoupon] = useState<QuoteDocument["jobCoupon"]>(null);
  const [couponDismissed, setCouponDismissed] = useState(false);

  const totals = useMemo(
    () =>
      computeTotals({
        lineItems,
        discountType,
        discountValue,
        shippingAmount,
        additionalCharges: charges,
        taxMode,
        taxValue,
      }),
    [lineItems, discountType, discountValue, shippingAmount, charges, taxMode, taxValue],
  );

  const load = async (search = q, st = status) => {
    setLoading(true);
    try {
      const token = getStoredToken();
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (st && st !== "all") params.set("status", st);
      const res = await fetch(`/api/admin/quotes?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!data.ok) {
        onMessage(data.message || "Could not load quotes.");
        setQuotes([]);
        return;
      }
      setQuotes(data.quotes || []);
    } catch {
      onMessage("Network error loading quotes.");
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  };

  const hydrate = (doc: QuoteDocument, inv?: QuoteInvoice | null, act?: QuoteActivity[]) => {
    setQuote(doc);
    setInvoice(inv || null);
    setActivity(act || []);
    setJobCoupon(doc.jobCoupon || null);
    setLineItems(
      (doc.lineItems || []).map((l) => ({
        ...l,
        amount: lineAmount(l.qty, l.unitPrice),
      })),
    );
    let nextDiscountType = doc.discountType || "none";
    let nextDiscountValue = Number(doc.discountValue) || 0;
    let nextDiscountReason = doc.discountReason || "";

    // If quote has no discount yet but the job has a coupon, surface it for one-click apply.
    const coupon = doc.jobCoupon;
    const already = couponAlreadyApplied(
      coupon,
      nextDiscountType,
      nextDiscountValue,
      nextDiscountReason,
      doc.couponCode,
    );
    setCouponDismissed(false);
    if (coupon && !already && (nextDiscountType === "none" || !nextDiscountValue)) {
      setModal("coupon");
    }

    setDiscountType(nextDiscountType);
    setDiscountValue(nextDiscountValue);
    setDiscountReason(nextDiscountReason);
    setShippingAmount(Number(doc.shippingAmount) || 0);
    setShippingLabel(doc.shippingLabel || "Shipping / Delivery");
    setCharges(doc.additionalCharges || []);
    setTaxMode(doc.taxMode || "none");
    setTaxValue(Number(doc.taxValue) || 0);
    setCustomerNotes(doc.customerNotes || "");
    setTerms(doc.termsConditions || "");
    setInternalNotes(doc.internalNotes || "");
    setContractorQuoteAmount(Number(doc.contractorQuoteAmount ?? doc.contractorNet) || 0);
    setContractorNotes(doc.contractorNotes || "");
    setContractorWarranty(doc.warranty || "");
    setContractorSpecial(doc.contractorSpecialConditions || "");
    setValidUntil(doc.quoteValidUntil ? new Date(doc.quoteValidUntil).toISOString().slice(0, 10) : "");
    const addr = normalizeStructuredAddress({
      ...(doc.billTo || {}),
      addressLine1: doc.billTo?.addressLine1 || doc.billTo?.street || doc.jobAddress || "",
      zip: doc.billTo?.zip || doc.jobZip || "",
      cityStateZip: doc.billTo?.cityStateZip || "",
    });
    setBillTo({
      name: doc.billTo?.name || doc.homeownerName || "",
      companyName: doc.billTo?.companyName || doc.companyName || "",
      email: doc.billTo?.email || doc.homeownerEmail || "",
      phone: doc.billTo?.phone || doc.homeownerPhone || "",
      addressLine1: addr.addressLine1 || "",
      addressLine2: addr.addressLine2 || "",
      city: addr.city || "",
      state: addr.state || "",
      zip: addr.zip || "",
    });
    setSendToEmail(doc.billTo?.email || doc.homeownerEmail || "");
    setSendToPhone(doc.billTo?.phone || doc.homeownerPhone || "");
    setSendSubject(`Your FixBridge Quote — ${doc.quoteNumber}`);
    setSendMessage(
      `Your quote ${doc.quoteNumber} is ready.\n\nTotal: ${formatMoney(doc.total)}\n\nView your quote in FixBridge to accept or decline.`,
    );
    setPaidAmount(inv?.amountDue ?? doc.total);
    setPaymentLinkUrl(inv?.stripePaymentLinkUrl || doc.invoice?.paymentLink || "");
  };

  const openQuote = async (id: number) => {
    setSelectedId(id);
    setWorkspaceLoading(true);
    const r = await adminQuoteWorkspace(id);
    setWorkspaceLoading(false);
    if (!r.ok || !r.quote) {
      onMessage(r.message || "Could not open quote.");
      return;
    }
    hydrate(r.quote, r.invoice, r.activity);
    setPreviousRevision(r.previousRevision || null);
    setJobQuoteHistory(r.jobQuoteHistory || []);
  };

  useEffect(() => {
    if (showList) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showList]);

  useEffect(() => {
    if (lockedQuoteId != null) {
      void openQuote(lockedQuoteId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedQuoteId]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    fetch("/api/comms/status", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setSmsAvailable(Boolean(data.smsConfigured));
      })
      .catch(() => setSmsAvailable(false));
  }, []);

  const notifyChanged = async () => {
    if (onChanged) await onChanged();
  };

  const documentPayload = () => ({
    lineItems: lineItems.map((l) => ({
      ...l,
      amount: lineAmount(l.qty, l.unitPrice),
    })),
    discountType,
    discountValue,
    discountReason,
    shippingAmount,
    shippingLabel,
    additionalCharges: charges,
    taxMode,
    taxValue,
    customerNotes,
    termsConditions: terms,
    internalNotes,
    billTo: {
      ...billTo,
      ...structuredToBillToExtras(billTo),
    },
    companyName: billTo.companyName,
    contractorQuoteAmount,
    contractorNotes,
    contractorSpecialConditions: contractorSpecial,
    warranty: contractorWarranty,
    quoteValidUntil: validUntil || null,
    couponCode: jobCoupon?.code || quote?.couponCode || null,
  });

  const applyJobCouponToDiscount = () => {
    if (!jobCoupon) return;
    setDiscountType(jobCoupon.discountType === "fixed" ? "fixed" : "percent");
    setDiscountValue(Number(jobCoupon.value) || 0);
    setDiscountReason(
      jobCoupon.label
        ? `Coupon ${jobCoupon.code} — ${jobCoupon.label}`
        : `Coupon ${jobCoupon.code}`,
    );
    setCouponDismissed(true);
    setModal(null);
    onMessage(`Coupon ${jobCoupon.code} applied as quote discount.`);
  };

  const couponPending =
    Boolean(jobCoupon?.code) &&
    !couponDismissed &&
    !couponAlreadyApplied(jobCoupon, discountType, discountValue, discountReason, quote?.couponCode);

  const saveDraft = async () => {
    if (!quote) return;
    setSaving(true);
    const r = await adminSaveQuoteDocument(quote.id, { ...documentPayload(), status: quote.status === "draft" ? "draft" : quote.status });
    setSaving(false);
    if (!r.ok || !r.quote) {
      onMessage(r.message || "Could not save quote.");
      return;
    }
    hydrate(r.quote, invoice, activity);
    onMessage(`Saved ${r.quote.quoteNumber}`);
    if (showList) void load();
    await notifyChanged();
  };

  const runSend = async () => {
    if (!quote) return;
    setBusyAction(true);
    await adminSaveQuoteDocument(quote.id, documentPayload());
    const r = await adminSendQuote(quote.id, {
      sendEmail,
      sendSms,
      email: sendToEmail,
      phone: sendToPhone,
      subject: sendSubject,
      message: sendMessage,
    });
    setBusyAction(false);
    if (!r.ok) {
      onMessage(r.message || "Could not send quote.");
      return;
    }
    setModal(null);
    onMessage(r.message || "Quote sent.");
    await openQuote(quote.id);
    if (showList) void load();
    await notifyChanged();
  };

  const locked = ["paid", "canceled", "cancelled"].includes(String(quote?.status || "").toLowerCase());

  return (
    <div className="space-y-4">
      {showList ? (
        <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quotes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Professional quotations and invoices — line items, discounts, tax, send, convert, and collect payment.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#FF4D1C] focus:ring-2 focus:ring-[#FF4D1C]/20"
            placeholder="Quote #, invoice #, homeowner, contractor, email, phone, job ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
          />
        </label>
        <select
          className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            void load(q, e.target.value);
          }}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : formatStatusLabel(s)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Search
        </button>
      </div>
        </>
      ) : null}

      <div className={`grid gap-4 ${showList && selectedId ? "xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.6fr)]" : ""}`}>
        {/* List */}
        {showList ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : quotes.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">No quotes match that search.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="hidden w-full min-w-[640px] text-left text-sm md:table">
                <thead className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Quote #</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Service</th>
                    <th className="px-3 py-2">Contractor</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Invoice</th>
                    <th className="px-3 py-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {quotes.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => void openQuote(row.id)}
                      className={`cursor-pointer hover:bg-muted/40 ${selectedId === row.id ? "bg-muted/60" : ""}`}
                    >
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold text-[#FF4D1C]">
                        {row.quoteNumber || `FBQ-${String(row.id).padStart(5, "0")}`}
                      </td>
                      <td className="px-3 py-2.5">{row.homeownerName || "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{row.jobCategory || row.jobTitle || "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{row.contractorName || "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium">{formatMoney(row.retailAmount || 0)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${quoteStatusTone(row.status)}`}>
                          {formatStatusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {row.invoiceNumber ? (
                          <div className="space-y-0.5">
                            <p className="font-mono text-[11px]">{row.invoiceNumber}</p>
                            <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${quoteStatusTone(row.invoiceStatus || "due")}`}>
                              {formatStatusLabel(row.invoiceStatus || "due")}
                              {String(row.invoiceStatus).toLowerCase() === "paid" ? " ✓" : ""}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtDate(row.createdAt || row.publishedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="divide-y divide-border md:hidden">
                {quotes.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => void openQuote(row.id)}
                      className={`flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-muted/50 ${selectedId === row.id ? "bg-muted/60" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold text-[#FF4D1C]">
                          {row.quoteNumber || `FBQ-${String(row.id).padStart(5, "0")}`}
                        </span>
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${quoteStatusTone(row.status)}`}>
                          {formatStatusLabel(row.status)}
                        </span>
                      </div>
                      <span className="text-sm font-medium">{row.homeownerName || "Homeowner"}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatMoney(row.retailAmount || 0)}
                        {row.invoiceNumber ? ` · ${row.invoiceNumber}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        ) : null}

        {/* Detail workspace */}
        {selectedId ? (
          <div className={embedded ? "" : "rounded-2xl border border-border bg-card"}>
            {workspaceLoading || !quote ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-6 p-4 sm:p-6">
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
                  <div className="flex items-start gap-3">
                    <img src={brand.logoMarkUrl} alt="" className="h-10 w-10 rounded-lg object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <div>
                      <p className="text-xl font-black tracking-[0.14em] text-[#FF4D1C]">{brand.productName.toUpperCase()}</p>
                      <p className="mt-1 font-mono text-lg font-bold">QUOTE #{quote.quoteNumber}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${quoteStatusTone(quote.status)}`}>
                          {formatStatusLabel(quote.status)}
                          {quote.status === "paid" ? " ✓" : ""}
                        </span>
                        {invoice ? (
                          <span className={`rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${quoteStatusTone(invoice.status)}`}>
                            {invoice.invoiceNumber} · {formatStatusLabel(invoice.status)}
                            {invoice.status === "paid" ? " ✓" : ""}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Created: {fmtDate(quote.createdAt)} · Valid until: {fmtDate(validUntil || quote.quoteValidUntil)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!locked ? (
                      <ActionBtn onClick={() => void saveDraft()} disabled={saving}>
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Save Draft
                      </ActionBtn>
                    ) : null}
                    <ActionBtn onClick={() => setModal("preview")}>
                      <Eye className="h-3.5 w-3.5" /> Preview
                    </ActionBtn>
                    {!locked && quote.status !== "converted" ? (
                      <ActionBtn primary onClick={() => setModal("send")}>
                        <Send className="h-3.5 w-3.5" /> Send Quote
                      </ActionBtn>
                    ) : null}
                    {!locked && !invoice ? (
                      <ActionBtn
                        onClick={async () => {
                          setBusyAction(true);
                          await adminSaveQuoteDocument(quote.id, documentPayload());
                          const r = await adminConvertQuoteToInvoice(quote.id);
                          setBusyAction(false);
                          if (!r.ok) {
                            onMessage(r.message || "Convert failed.");
                            return;
                          }
                          onMessage(r.message || "Invoice created.");
                          await openQuote(quote.id);
                          if (showList) void load();
                          await notifyChanged();
                        }}
                      >
                        Convert to Invoice
                      </ActionBtn>
                    ) : null}
                    <ActionBtn
                      onClick={async () => {
                        const r = await adminDuplicateQuote(quote.id);
                        if (!r.ok || !r.quote) {
                          onMessage(r.message || "Duplicate failed.");
                          return;
                        }
                        onMessage(`Duplicated as ${r.quote.quoteNumber}`);
                        if (showList) void load();
                        await openQuote(r.quote.id);
                        await notifyChanged();
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" /> Duplicate
                    </ActionBtn>
                    {!locked ? (
                      <ActionBtn
                        danger
                        onClick={async () => {
                          if (!confirm("Cancel this quote?")) return;
                          const r = await adminCancelQuote(quote.id);
                          if (!r.ok) {
                            onMessage(r.message || "Cancel failed.");
                            return;
                          }
                          await openQuote(quote.id);
                          if (showList) void load();
                          await notifyChanged();
                        }}
                      >
                        Cancel
                      </ActionBtn>
                    ) : null}
                  </div>
                </div>

                {previousRevision ? (
                  <div className="grid gap-4 rounded-2xl border border-border bg-muted/20 p-4 lg:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Previous (v{previousRevision.versionNumber})
                      </p>
                      <p className="mt-2 text-lg font-bold tabular-nums">{formatMoney(previousRevision.customerTotal || 0)}</p>
                      <p className="text-xs text-muted-foreground">
                        Contractor {formatMoney(previousRevision.contractorAmount || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current</p>
                      <p className="mt-2 text-lg font-bold tabular-nums">{formatMoney(totals.total)}</p>
                      <p className="text-xs text-muted-foreground">Contractor {formatMoney(contractorQuoteAmount)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Difference</p>
                      <p
                        className={`mt-2 text-lg font-bold tabular-nums ${
                          totals.total - (previousRevision.customerTotal || 0) >= 0 ? "text-amber-800" : "text-emerald-700"
                        }`}
                      >
                        {totals.total - (previousRevision.customerTotal || 0) >= 0 ? "+" : ""}
                        {formatMoney(totals.total - (previousRevision.customerTotal || 0))}
                      </p>
                      {previousRevision.changeReason ? (
                        <p className="mt-1 text-xs text-muted-foreground">Reason: {previousRevision.changeReason}</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {jobQuoteHistory.length > 1 ? (
                  <div className="rounded-2xl border border-border p-4">
                    <p className="text-sm font-semibold">Quote history</p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {jobQuoteHistory.map((h) => (
                        <li key={h.id} className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            className="font-mono text-primary hover:underline"
                            onClick={() => void openQuote(h.id)}
                          >
                            {h.quoteNumber || `FBQ-${h.id}`} v{h.versionNumber}
                          </button>
                          <span>{formatMoney(h.total)}</span>
                          <span className="text-xs text-muted-foreground">{formatStatusLabel(h.status)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* Bill to + job meta */}
                <div className="grid gap-4 lg:grid-cols-2">
                  <section className="rounded-xl border border-border p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Bill to</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Field label="Customer name">
                        <input className={inputClass} disabled={locked} value={billTo.name} onChange={(e) => setBillTo({ ...billTo, name: e.target.value })} />
                      </Field>
                      <Field label="Company (optional)">
                        <input className={inputClass} disabled={locked} value={billTo.companyName} onChange={(e) => setBillTo({ ...billTo, companyName: e.target.value })} />
                      </Field>
                      <Field label="Email">
                        <input className={inputClass} disabled={locked} value={billTo.email} onChange={(e) => setBillTo({ ...billTo, email: e.target.value })} />
                      </Field>
                      <Field label="Phone">
                        <input className={inputClass} disabled={locked} value={billTo.phone} onChange={(e) => setBillTo({ ...billTo, phone: e.target.value })} />
                      </Field>
                      <Field label="Service address" className="sm:col-span-2">
                        <StructuredAddressFields
                          idPrefix="quote-billto"
                          addressLine1={billTo.addressLine1}
                          addressLine2={billTo.addressLine2}
                          city={billTo.city}
                          state={billTo.state}
                          zip={billTo.zip}
                          onAddressLine1Change={(v) => setBillTo({ ...billTo, addressLine1: v })}
                          onAddressLine2Change={(v) => setBillTo({ ...billTo, addressLine2: v })}
                          onCityChange={(v) => setBillTo({ ...billTo, city: v })}
                          onStateChange={(v) => setBillTo({ ...billTo, state: v })}
                          onZipChange={(v) => setBillTo({ ...billTo, zip: v })}
                          disabled={locked}
                          zipRequired
                        />
                      </Field>
                    </div>
                  </section>
                  <section className="rounded-xl border border-border p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Job details</p>
                    <dl className="mt-3 space-y-2 text-sm">
                      <MetaRow label="Job ID" value={quote.bookingId || `#${quote.jobId}`} />
                      <MetaRow label="Property" value={quote.propertyId ? `Property #${quote.propertyId}` : quote.jobAddress || "—"} />
                      <MetaRow label="Service type" value={quote.jobCategory || quote.jobTitle || "—"} />
                      <MetaRow label="Assigned contractor" value={quote.contractorName || "—"} />
                      <MetaRow label="Valid until">
                        <input type="date" className={inputClass} disabled={locked} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
                      </MetaRow>
                    </dl>
                    {onOpenJob ? (
                    <button type="button" onClick={() => onOpenJob(quote.jobId)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#FF4D1C] hover:underline">
                      <ExternalLink className="h-3.5 w-3.5" /> Open related job
                    </button>
                    ) : null}
                  </section>
                </div>

                {/* Job coupon prompt */}
                {jobCoupon?.code && !locked ? (
                  <div
                    className={`rounded-xl border px-4 py-3 ${
                      couponPending
                        ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                        : "border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider">
                          {couponPending ? "Coupon on this job" : "Coupon reflected in discount"}
                        </p>
                        <p className="mt-1 text-sm">
                          <span className="font-mono font-semibold">{jobCoupon.code}</span>
                          {jobCoupon.label ? ` — ${jobCoupon.label}` : ""}
                          {" · "}
                          {jobCoupon.discountType === "percent"
                            ? `${jobCoupon.value}% off`
                            : `${formatMoney(jobCoupon.value)} off`}
                        </p>
                        {couponPending ? (
                          <p className="mt-1 text-xs opacity-80">
                            Apply this coupon as the quote discount so the homeowner total is correct.
                          </p>
                        ) : null}
                      </div>
                      {couponPending ? (
                        <div className="flex flex-wrap gap-2">
                          <ActionBtn primary onClick={applyJobCouponToDiscount}>
                            Add to discount
                          </ActionBtn>
                          <ActionBtn
                            onClick={() => {
                              setCouponDismissed(true);
                              if (modal === "coupon") setModal(null);
                            }}
                          >
                            Dismiss
                          </ActionBtn>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* Line items */}
                <section className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Line items</p>
                    {!locked ? (
                      <button
                        type="button"
                        onClick={() => setLineItems((prev) => [...prev, emptyLineItem()])}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Item
                      </button>
                    ) : null}
                  </div>

                  {/* Desktop table */}
                  <div className="mt-3 hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="py-2 pr-2">Item / Service</th>
                          <th className="py-2 pr-2">Description</th>
                          <th className="py-2 pr-2 w-20">Qty</th>
                          <th className="py-2 pr-2 w-28">Unit</th>
                          <th className="py-2 pr-2 w-28">Unit Price</th>
                          <th className="py-2 pr-2 w-24 text-right">Amount</th>
                          <th className="py-2 w-24" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {lineItems.map((line, idx) => (
                          <tr key={line.id}>
                            <td className="py-2 pr-2">
                              <input className={inputClass} disabled={locked} value={line.name} onChange={(e) => updateLine(idx, { name: e.target.value })} placeholder="Item name" />
                            </td>
                            <td className="py-2 pr-2">
                              <input className={inputClass} disabled={locked} value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} placeholder="Description" />
                            </td>
                            <td className="py-2 pr-2">
                              <input type="number" min={0} step={0.01} className={inputClass} disabled={locked} value={line.qty} onChange={(e) => updateLine(idx, { qty: Number(e.target.value) || 0 })} />
                            </td>
                            <td className="py-2 pr-2">
                              <UnitSelect locked={locked} value={line.unit} onChange={(unit) => updateLine(idx, { unit })} />
                            </td>
                            <td className="py-2 pr-2">
                              <input type="number" min={0} step={0.01} className={inputClass} disabled={locked} value={line.unitPrice} onChange={(e) => updateLine(idx, { unitPrice: Number(e.target.value) || 0 })} />
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums font-medium">{formatMoney(lineAmount(line.qty, line.unitPrice))}</td>
                            <td className="py-2">
                              {!locked ? (
                                <div className="flex items-center gap-0.5">
                                  <IconBtn onClick={() => moveLine(idx, -1)} disabled={idx === 0}><ChevronUp className="h-3.5 w-3.5" /></IconBtn>
                                  <IconBtn onClick={() => moveLine(idx, 1)} disabled={idx === lineItems.length - 1}><ChevronDown className="h-3.5 w-3.5" /></IconBtn>
                                  <IconBtn onClick={() => setLineItems((p) => [...p, { ...line, id: emptyLineItem().id }])}><Copy className="h-3.5 w-3.5" /></IconBtn>
                                  <IconBtn danger onClick={() => setLineItems((p) => p.filter((_, i) => i !== idx))}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="mt-3 space-y-3 md:hidden">
                    {lineItems.map((line, idx) => (
                      <div key={line.id} className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                        <input className={inputClass} disabled={locked} value={line.name} onChange={(e) => updateLine(idx, { name: e.target.value })} placeholder="Item / Service" />
                        <textarea className={inputClass} disabled={locked} value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} placeholder="Description" rows={2} />
                        <div className="grid grid-cols-2 gap-2">
                          <Field label="Qty"><input type="number" className={inputClass} disabled={locked} value={line.qty} onChange={(e) => updateLine(idx, { qty: Number(e.target.value) || 0 })} /></Field>
                          <Field label="Unit"><UnitSelect locked={locked} value={line.unit} onChange={(unit) => updateLine(idx, { unit })} /></Field>
                          <Field label="Unit price"><input type="number" className={inputClass} disabled={locked} value={line.unitPrice} onChange={(e) => updateLine(idx, { unitPrice: Number(e.target.value) || 0 })} /></Field>
                          <Field label="Amount"><p className="py-2 text-sm font-semibold tabular-nums">{formatMoney(lineAmount(line.qty, line.unitPrice))}</p></Field>
                        </div>
                        {!locked ? (
                          <div className="flex gap-2">
                            <button type="button" className="text-xs font-semibold text-muted-foreground" onClick={() => setLineItems((p) => [...p, { ...line, id: emptyLineItem().id }])}>Duplicate</button>
                            <button type="button" className="text-xs font-semibold text-red-600" onClick={() => setLineItems((p) => p.filter((_, i) => i !== idx))}>Remove</button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>

                {/* Totals / discount / shipping / tax / charges */}
                <div className="grid gap-4 lg:grid-cols-2">
                  <section className="space-y-3 rounded-xl border border-border p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Adjustments</p>
                    <div>
                      <p className="mb-1 text-sm font-medium">Discount</p>
                      {jobCoupon?.code ? (
                        <p className="mb-2 text-[11px] text-muted-foreground">
                          Job coupon <span className="font-mono font-semibold">{jobCoupon.code}</span> available
                          {couponPending ? " — use “Add to discount” above or set values here." : "."}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-3 text-sm">
                        {(["none", "percent", "fixed"] as const).map((t) => (
                          <label key={t} className="inline-flex items-center gap-1.5">
                            <input type="radio" disabled={locked} checked={discountType === t} onChange={() => setDiscountType(t)} />
                            {t === "none" ? "None" : t === "percent" ? "Percentage" : "Fixed $"}
                          </label>
                        ))}
                      </div>
                      {discountType !== "none" ? (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <input type="number" min={0} className={inputClass} disabled={locked} value={discountValue} onChange={(e) => setDiscountValue(Number(e.target.value) || 0)} placeholder={discountType === "percent" ? "10" : "50"} />
                          <input className={inputClass} disabled={locked} value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="Reason" />
                        </div>
                      ) : null}
                      {couponPending && !locked ? (
                        <button
                          type="button"
                          onClick={applyJobCouponToDiscount}
                          className="mt-2 text-xs font-semibold text-[#FF4D1C] hover:underline"
                        >
                          Apply job coupon {jobCoupon?.code} here
                        </button>
                      ) : null}
                    </div>
                    <div>
                      <p className="mb-1 text-sm font-medium">Shipping / Delivery</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input className={inputClass} disabled={locked} value={shippingLabel} onChange={(e) => setShippingLabel(e.target.value)} placeholder="Label" />
                        <input type="number" min={0} className={inputClass} disabled={locked} value={shippingAmount} onChange={(e) => setShippingAmount(Number(e.target.value) || 0)} />
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-sm font-medium">Tax</p>
                      <div className="flex flex-wrap gap-3 text-sm">
                        {(["none", "percent", "custom"] as const).map((t) => (
                          <label key={t} className="inline-flex items-center gap-1.5">
                            <input type="radio" disabled={locked} checked={taxMode === t} onChange={() => setTaxMode(t)} />
                            {t === "none" ? "No Tax" : t === "percent" ? "Percentage" : "Custom Amount"}
                          </label>
                        ))}
                      </div>
                      {taxMode !== "none" ? (
                        <input type="number" min={0} step={0.01} className={`${inputClass} mt-2`} disabled={locked} value={taxValue} onChange={(e) => setTaxValue(Number(e.target.value) || 0)} placeholder={taxMode === "percent" ? "8.25" : "0.00"} />
                      ) : null}
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-sm font-medium">Additional charges</p>
                        {!locked ? (
                          <button type="button" onClick={() => setCharges((p) => [...p, emptyCharge()])} className="text-xs font-semibold text-[#FF4D1C]">+ Add Charge</button>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        {charges.map((c, idx) => (
                          <div key={c.id} className="grid gap-2 rounded-lg border border-border/70 p-2 sm:grid-cols-[1fr_1fr_90px_auto]">
                            <select className={inputClass} disabled={locked} value={CHARGE_PRESETS.includes(c.name) ? c.name : "Custom Fee"} onChange={(e) => {
                              const name = e.target.value;
                              setCharges((p) => p.map((x, i) => (i === idx ? { ...x, name } : x)));
                            }}>
                              {CHARGE_PRESETS.map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                            <input className={inputClass} disabled={locked} value={c.description || c.name} onChange={(e) => setCharges((p) => p.map((x, i) => (i === idx ? { ...x, name: e.target.value, description: e.target.value } : x)))} placeholder="Charge name" />
                            <input type="number" className={inputClass} disabled={locked} value={c.amount} onChange={(e) => setCharges((p) => p.map((x, i) => (i === idx ? { ...x, amount: Number(e.target.value) || 0 } : x)))} />
                            {!locked ? <button type="button" onClick={() => setCharges((p) => p.filter((_, i) => i !== idx))} className="text-red-600"><Trash2 className="h-4 w-4" /></button> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="rounded-xl border border-border bg-muted/20 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Totals</p>
                    <dl className="mt-3 space-y-2 text-sm">
                      <TotalRow label="Subtotal" value={formatMoney(totals.subtotal)} />
                      {totals.discountAmount > 0 ? <TotalRow label={`Discount${discountType === "percent" ? ` ${discountValue}%` : ""}`} value={`−${formatMoney(totals.discountAmount)}`} /> : null}
                      {totals.shippingAmount > 0 ? <TotalRow label={shippingLabel || "Shipping"} value={formatMoney(totals.shippingAmount)} /> : null}
                      {charges.map((c) => (
                        <TotalRow key={c.id} label={c.name || "Charge"} value={formatMoney(c.amount)} />
                      ))}
                      {totals.taxAmount > 0 ? <TotalRow label={`Tax${taxMode === "percent" ? ` ${taxValue}%` : ""}`} value={formatMoney(totals.taxAmount)} /> : null}
                      <div className="my-2 border-t border-border" />
                      <TotalRow label="TOTAL" value={formatMoney(totals.total)} strong />
                    </dl>
                  </section>
                </div>

                {/* Notes */}
                <div className="grid gap-4 lg:grid-cols-3">
                  <NoteBlock title="Customer notes" hint="Visible on quote" value={customerNotes} onChange={setCustomerNotes} locked={locked} />
                  <NoteBlock title="Terms & conditions" hint="Visible to homeowner" value={terms} onChange={setTerms} locked={locked} />
                  <NoteBlock title="Internal notes" hint="Admin only — never shown to homeowner" value={internalNotes} onChange={setInternalNotes} locked={locked} />
                </div>

                {/* Contractor (admin-only) */}
                <section className="rounded-xl border border-dashed border-border bg-muted/10 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Assigned contractor (admin only)</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                    <MetaRow label="Company" value={quote.contractorCompany || quote.contractorName || "—"} />
                    <MetaRow label="Primary contact" value={quote.contractorName || "—"} />
                    <MetaRow label="Phone" value={quote.contractorPhone || "—"} />
                    <MetaRow label="Email" value={quote.contractorEmail || "—"} />
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Contractor quote amount">
                      <input type="number" className={inputClass} disabled={locked} value={contractorQuoteAmount} onChange={(e) => setContractorQuoteAmount(Number(e.target.value) || 0)} />
                    </Field>
                    <Field label="Warranty">
                      <input className={inputClass} disabled={locked} value={contractorWarranty} onChange={(e) => setContractorWarranty(e.target.value)} />
                    </Field>
                    <Field label="Contractor notes" className="sm:col-span-2">
                      <textarea className={inputClass} rows={2} disabled={locked} value={contractorNotes} onChange={(e) => setContractorNotes(e.target.value)} />
                    </Field>
                    <Field label="Special conditions" className="sm:col-span-2">
                      <textarea className={inputClass} rows={2} disabled={locked} value={contractorSpecial} onChange={(e) => setContractorSpecial(e.target.value)} />
                    </Field>
                  </div>
                </section>

                {/* Invoice panel */}
                {invoice ? (
                  <section className="rounded-xl border-2 border-[#FF4D1C]/30 bg-[#FF4D1C]/5 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Invoice</p>
                        <p className="font-mono text-lg font-bold">{invoice.invoiceNumber}</p>
                      </div>
                      <span className={`rounded-md px-3 py-1.5 text-sm font-black uppercase tracking-wide ${quoteStatusTone(invoice.status)}`}>
                        {formatStatusLabel(invoice.status)}
                        {invoice.status === "paid" ? " ✓" : ""}
                      </span>
                    </div>
                    <p className="text-2xl font-bold tabular-nums">{formatMoney(invoice.amountDue)} <span className="text-sm font-medium text-muted-foreground">due</span></p>
                    <div className="flex flex-wrap gap-2">
                      <ActionBtn onClick={() => setModal("send")}><Send className="h-3.5 w-3.5" /> Send Invoice</ActionBtn>
                      <ActionBtn
                        onClick={async () => {
                          setBusyAction(true);
                          const r = await adminCreateInvoicePaymentLink(invoice.id);
                          setBusyAction(false);
                          if (!r.ok) {
                            onMessage(r.message || "Could not create payment link.");
                            return;
                          }
                          setPaymentLinkUrl(r.paymentLink || "");
                          setModal("paymentLink");
                          if (r.invoice) setInvoice(r.invoice);
                        }}
                      >
                        <Link2 className="h-3.5 w-3.5" /> Payment Link
                      </ActionBtn>
                      {invoice.status !== "paid" ? (
                        <ActionBtn primary onClick={() => { setPaidAmount(invoice.amountDue); setModal("markPaid"); }}>
                          <Banknote className="h-3.5 w-3.5" /> Mark Payment Received
                        </ActionBtn>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" /> Paid
                        </span>
                      )}
                      <ActionBtn onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> Print</ActionBtn>
                    </div>
                  </section>
                ) : null}

                {/* Activity */}
                <section className="rounded-xl border border-border p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Quote activity</p>
                  {activity.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">No activity yet.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {activity.map((a) => (
                        <li key={a.id} className="flex gap-3 text-sm">
                          <span className="w-36 shrink-0 text-xs text-muted-foreground">{fmtDate(a.createdAt, true)}</span>
                          <span>
                            {formatActivityAction(a.action)}
                            {a.actorName ? <span className="text-muted-foreground"> · {a.actorName}</span> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </div>
        ) : showList ? (
          <div className="hidden rounded-2xl border border-border bg-card p-8 xl:flex xl:min-h-[320px] xl:flex-col xl:items-center xl:justify-center xl:text-center xl:text-sm xl:text-muted-foreground">
            <FileText className="mb-2 h-8 w-8 opacity-40" />
            Select a quote to open the professional quotation workspace.
          </div>
        ) : null}
      </div>

      {/* Modals */}
      {modal === "coupon" && jobCoupon ? (
        <Modal title="Coupon applied on this job" onClose={() => { setCouponDismissed(true); setModal(null); }}>
          <div className="space-y-3 text-sm">
            <p>
              This job already has coupon{" "}
              <strong className="font-mono">{jobCoupon.code}</strong>
              {jobCoupon.label ? ` (${jobCoupon.label})` : ""}.
            </p>
            <p className="rounded-lg bg-muted/40 px-3 py-2 font-semibold">
              {jobCoupon.discountType === "percent"
                ? `${jobCoupon.value}% discount`
                : `${formatMoney(jobCoupon.value)} discount`}
            </p>
            <p className="text-muted-foreground">
              Add it to this quote&apos;s discount so the homeowner total includes the coupon.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <ActionBtn onClick={() => { setCouponDismissed(true); setModal(null); }}>Not now</ActionBtn>
              <ActionBtn primary onClick={applyJobCouponToDiscount}>
                Add to discount
              </ActionBtn>
            </div>
          </div>
        </Modal>
      ) : null}

      {modal === "preview" && quote ? (
        <Modal title="Preview quote" onClose={() => setModal(null)}>
          <QuotePreview
            quoteNumber={quote.quoteNumber}
            status={quote.status}
            createdAt={quote.createdAt}
            validUntil={validUntil || quote.quoteValidUntil}
            billTo={billTo}
            lineItems={lineItems}
            totals={totals}
            discountType={discountType}
            discountValue={discountValue}
            shippingLabel={shippingLabel}
            charges={charges}
            taxMode={taxMode}
            taxValue={taxValue}
            customerNotes={customerNotes}
            terms={terms}
          />
          <div className="mt-4 flex justify-end gap-2">
            <ActionBtn onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> Print</ActionBtn>
            <ActionBtn primary onClick={() => setModal(null)}>Close</ActionBtn>
          </div>
        </Modal>
      ) : null}

      {modal === "send" && quote ? (
        <Modal title={invoice ? "Send invoice" : "Send quote"} onClose={() => setModal(null)}>
          <div className="space-y-3 text-sm">
            <p><span className="text-muted-foreground">Customer</span><br /><strong>{billTo.name || quote.homeownerName}</strong></p>
            <p><span className="text-muted-foreground">{invoice ? "Invoice" : "Quote"}</span><br /><strong className="font-mono">{invoice?.invoiceNumber || quote.quoteNumber}</strong></p>
            <p><span className="text-muted-foreground">Amount</span><br /><strong className="text-lg">{formatMoney(invoice?.amountDue ?? totals.total)}</strong></p>
            <div className="flex gap-4">
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Email</label>
              {smsAvailable ? (
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} /> SMS</label>
              ) : (
                <p className="text-xs text-muted-foreground">SMS delivery is not currently configured.</p>
              )}
            </div>
            {sendEmail ? (
              <>
                <Field label="To"><input className={inputClass} value={sendToEmail} onChange={(e) => setSendToEmail(e.target.value)} /></Field>
                <Field label="Subject"><input className={inputClass} value={sendSubject} onChange={(e) => setSendSubject(e.target.value)} /></Field>
                <Field label="Message"><textarea className={inputClass} rows={4} value={sendMessage} onChange={(e) => setSendMessage(e.target.value)} /></Field>
              </>
            ) : null}
            {sendSms ? (
              <Field label="Phone"><input className={inputClass} value={sendToPhone} onChange={(e) => setSendToPhone(e.target.value)} /></Field>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <ActionBtn onClick={() => setModal(null)}>Cancel</ActionBtn>
              <ActionBtn
                primary
                disabled={busyAction}
                onClick={async () => {
                  if (invoice) {
                    setBusyAction(true);
                    const r = await adminSendWorkspaceInvoice(invoice.id, {
                      sendEmail,
                      sendSms,
                      email: sendToEmail,
                      phone: sendToPhone,
                    });
                    setBusyAction(false);
                    if (!r.ok) {
                      onMessage(r.message || "Send failed.");
                      return;
                    }
                    setModal(null);
                    onMessage("Invoice sent.");
                    await openQuote(quote.id);
                  } else {
                    await runSend();
                  }
                }}
              >
                {busyAction ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {invoice ? "Send Invoice" : "Send Email"}
              </ActionBtn>
            </div>
          </div>
        </Modal>
      ) : null}

      {modal === "markPaid" && invoice ? (
        <Modal title="Mark payment received" onClose={() => setModal(null)}>
          <div className="space-y-3 text-sm">
            <p>Invoice <strong className="font-mono">{invoice.invoiceNumber}</strong></p>
            <p>Amount due: <strong>{formatMoney(invoice.amountDue)}</strong></p>
            <Field label="Amount received"><input type="number" className={inputClass} value={paidAmount} onChange={(e) => setPaidAmount(Number(e.target.value) || 0)} /></Field>
            <Field label="Payment method">
              <select className={inputClass} value={paidMethod} onChange={(e) => setPaidMethod(e.target.value)}>
                {["cash", "check", "bank_transfer", "card", "other"].map((m) => (
                  <option key={m} value={m}>{m.replace(/_/g, " ")}</option>
                ))}
              </select>
            </Field>
            <Field label="Reference / notes"><input className={inputClass} value={paidRef} onChange={(e) => setPaidRef(e.target.value)} /></Field>
            <Field label="Notes"><textarea className={inputClass} rows={2} value={paidNotes} onChange={(e) => setPaidNotes(e.target.value)} /></Field>
            <Field label="Payment date"><input type="date" className={inputClass} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} /></Field>
            <div className="flex justify-end gap-2 pt-2">
              <ActionBtn onClick={() => setModal(null)}>Cancel</ActionBtn>
              <ActionBtn
                primary
                disabled={busyAction}
                onClick={async () => {
                  setBusyAction(true);
                  const r = await adminMarkInvoicePaid(invoice.id, {
                    amountReceived: paidAmount,
                    paymentMethod: paidMethod,
                    reference: paidRef,
                    notes: paidNotes,
                    paymentDate: paidDate,
                  });
                  setBusyAction(false);
                  if (!r.ok) {
                    onMessage(r.message || "Could not record payment.");
                    return;
                  }
                  setModal(null);
                  onMessage(r.message || "PAID");
                  if (quote) await openQuote(quote.id);
                  if (showList) void load();
                  await notifyChanged();
                }}
              >
                Confirm Payment
              </ActionBtn>
            </div>
          </div>
        </Modal>
      ) : null}

      {modal === "paymentLink" ? (
        <Modal title="Payment link" onClose={() => setModal(null)}>
          <div className="space-y-3 text-sm">
            <p className="break-all rounded-lg bg-muted/40 p-3 font-mono text-xs">{paymentLinkUrl || "—"}</p>
            <div className="flex flex-wrap gap-2">
              <ActionBtn
                onClick={async () => {
                  if (!paymentLinkUrl) return;
                  await navigator.clipboard.writeText(paymentLinkUrl);
                  onMessage("Payment link copied.");
                }}
              >
                Copy
              </ActionBtn>
              <ActionBtn
                onClick={() => {
                  setSendEmail(true);
                  setSendSms(false);
                  setSendMessage(`Please pay your FixBridge invoice using this link:\n${paymentLinkUrl}`);
                  setModal("send");
                }}
              >
                Send Email
              </ActionBtn>
              <ActionBtn
                onClick={() => {
                  setSendEmail(false);
                  setSendSms(true);
                  setModal("send");
                }}
              >
                Send SMS
              </ActionBtn>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );

  function updateLine(idx: number, patch: Partial<QuoteLineItem>) {
    setLineItems((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, ...patch };
        next.amount = lineAmount(next.qty, next.unitPrice);
        return next;
      }),
    );
  }

  function moveLine(idx: number, dir: -1 | 1) {
    setLineItems((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-[#FF4D1C] disabled:opacity-60";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function MetaRow({ label, value, children }: { label: string; value?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[65%] text-right font-medium">{children || value}</dd>
    </div>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "text-base font-bold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function NoteBlock({
  title,
  hint,
  value,
  onChange,
  locked,
}: {
  title: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  locked: boolean;
}) {
  return (
    <section className="rounded-xl border border-border p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      <textarea className={`${inputClass} mt-2`} rows={4} disabled={locked} value={value} onChange={(e) => onChange(e.target.value)} />
    </section>
  );
}

function UnitSelect({ value, onChange, locked }: { value: string; onChange: (v: string) => void; locked: boolean }) {
  const isPreset = (QUOTE_UNITS as readonly string[]).includes(value);
  return (
    <div className="space-y-1">
      <select className={inputClass} disabled={locked} value={isPreset ? value : "Custom"} onChange={(e) => onChange(e.target.value === "Custom" ? value || "Custom" : e.target.value)}>
        {QUOTE_UNITS.map((u) => (
          <option key={u} value={u}>{u}</option>
        ))}
      </select>
      {!isPreset || value === "Custom" ? (
        <input className={inputClass} disabled={locked} value={value === "Custom" ? "" : value} placeholder="Custom unit" onChange={(e) => onChange(e.target.value || "Custom")} />
      ) : null}
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  primary,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
        primary
          ? "bg-[#FF4D1C] text-white"
          : danger
            ? "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
            : "border border-border hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md p-1.5 disabled:opacity-30 ${danger ? "text-red-600 hover:bg-red-500/10" : "text-muted-foreground hover:bg-muted"}`}
    >
      {children}
    </button>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function QuotePreview({
  quoteNumber,
  status,
  createdAt,
  validUntil,
  billTo,
  lineItems,
  totals,
  discountType,
  discountValue,
  shippingLabel,
  charges,
  taxMode,
  taxValue,
  customerNotes,
  terms,
}: {
  quoteNumber: string;
  status: string;
  createdAt?: string | null;
  validUntil?: string | null;
  billTo: {
    name: string;
    companyName: string;
    email: string;
    phone: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    zip: string;
  };
  lineItems: QuoteLineItem[];
  totals: ReturnType<typeof computeTotals>;
  discountType: string;
  discountValue: number;
  shippingLabel: string;
  charges: AdditionalCharge[];
  taxMode: string;
  taxValue: number;
  customerNotes: string;
  terms: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-5 text-sm print:border-0">
      <div className="border-b-2 border-[#FF4D1C] pb-4">
        <div className="flex items-center gap-2">
          <img src={brand.logoMarkUrl} alt="" className="h-8 w-8 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <p className="text-lg font-black tracking-[0.12em] text-[#FF4D1C]">{brand.productName.toUpperCase()}</p>
        </div>
        <p className="mt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Quote</p>
        <p className="font-mono text-base font-bold">#{quoteNumber}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {fmtDate(createdAt)} · Valid until {fmtDate(validUntil)} · {formatStatusLabel(status)}
        </p>
      </div>
      <div className="mt-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer</p>
        <p className="font-semibold">{billTo.name}</p>
        {billTo.companyName ? <p>{billTo.companyName}</p> : null}
        {billTo.email ? <p className="text-muted-foreground">{billTo.email}</p> : null}
        {billTo.phone ? <p className="text-muted-foreground">{billTo.phone}</p> : null}
        <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Service address</p>
        {formatAddressLines(billTo).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <div className="mt-4 border-t border-border pt-3 space-y-2">
        {lineItems.map((l) => (
          <div key={l.id} className="flex justify-between gap-3">
            <div>
              <p className="font-medium">{l.name}</p>
              {l.description ? <p className="text-xs text-muted-foreground">{l.description}</p> : null}
              <p className="text-[11px] text-muted-foreground">{l.qty} {l.unit} × {formatMoney(l.unitPrice)}</p>
            </div>
            <p className="tabular-nums font-medium">{formatMoney(lineAmount(l.qty, l.unitPrice))}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-1 border-t border-border pt-3">
        <TotalRow label="Subtotal" value={formatMoney(totals.subtotal)} />
        {totals.discountAmount > 0 ? <TotalRow label={`Discount${discountType === "percent" ? ` ${discountValue}%` : ""}`} value={`−${formatMoney(totals.discountAmount)}`} /> : null}
        {totals.shippingAmount > 0 ? <TotalRow label={shippingLabel} value={formatMoney(totals.shippingAmount)} /> : null}
        {charges.map((c) => <TotalRow key={c.id} label={c.name} value={formatMoney(c.amount)} />)}
        {totals.taxAmount > 0 ? <TotalRow label={`Tax${taxMode === "percent" ? ` ${taxValue}%` : ""}`} value={formatMoney(totals.taxAmount)} /> : null}
        <div className="border-t border-border pt-2">
          <TotalRow label="TOTAL" value={formatMoney(totals.total)} strong />
        </div>
      </div>
      {customerNotes ? (
        <div className="mt-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{customerNotes}</p>
        </div>
      ) : null}
      {terms ? (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Terms</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{terms}</p>
        </div>
      ) : null}
    </div>
  );
}
