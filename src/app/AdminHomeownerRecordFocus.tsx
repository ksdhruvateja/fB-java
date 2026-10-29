import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, MapPin } from "lucide-react";
import { AdminQuoteDocumentPanel } from "./AdminQuotesWorkspace";
import { formatMoney, adminGetInvoice, adminQuoteWorkspace } from "./managedJobs";
import { getAdminHomeownerProfile } from "./platformApi";
import { formatAddressLines } from "./addressFormat";

export type HomeownerRecordFocus =
  | { type: "property"; propertyId: number }
  | { type: "quote"; quoteId: number }
  | { type: "invoice"; invoiceId: number; proposalId?: number | null }
  | { type: "payment"; paymentId: number };

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function BackBar({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}

function QuoteRecordView({
  quoteId,
  onBack,
  onMessage,
  onOpenJob,
}: {
  quoteId: number;
  onBack: () => void;
  onMessage: (msg: string) => void;
  onOpenJob?: (jobId: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setMissing(false);
      const r = await adminQuoteWorkspace(quoteId);
      if (cancelled) return;
      if (!r.ok || !r.quote) setMissing(true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [quoteId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading quote…
      </div>
    );
  }

  if (missing) {
    return (
      <div className="space-y-4">
        <BackBar label="Back to homeowner profile" onBack={onBack} />
        <p className="text-sm text-red-600">Record not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BackBar label="Back to homeowner profile" onBack={onBack} />
      <AdminQuoteDocumentPanel
        quoteId={quoteId}
        onMessage={onMessage}
        onOpenJob={onOpenJob}
        embedded
      />
    </div>
  );
}

export default function AdminHomeownerRecordFocus({
  homeownerUserId,
  focus,
  onBack,
  onMessage,
  onOpenJob,
}: {
  homeownerUserId: number;
  focus: HomeownerRecordFocus;
  onBack: () => void;
  onMessage: (msg: string) => void;
  onOpenJob?: (jobId: number) => void;
}) {
  if (focus.type === "quote") {
    return (
      <QuoteRecordView
        quoteId={focus.quoteId}
        onBack={onBack}
        onMessage={onMessage}
        onOpenJob={onOpenJob}
      />
    );
  }

  if (focus.type === "invoice") {
    return (
      <InvoiceRecordView
        homeownerUserId={homeownerUserId}
        invoiceId={focus.invoiceId}
        onBack={onBack}
        onMessage={onMessage}
        onOpenJob={onOpenJob}
      />
    );
  }

  if (focus.type === "property") {
    return (
      <PropertyRecordView
        homeownerUserId={homeownerUserId}
        propertyId={focus.propertyId}
        onBack={onBack}
        onOpenJob={onOpenJob}
      />
    );
  }

  return (
    <PaymentRecordView
      homeownerUserId={homeownerUserId}
      paymentId={focus.paymentId}
      onBack={onBack}
      onOpenJob={onOpenJob}
    />
  );
}

function PropertyRecordView({
  homeownerUserId,
  propertyId,
  onBack,
  onOpenJob,
}: {
  homeownerUserId: number;
  propertyId: number;
  onBack: () => void;
  onOpenJob?: (jobId: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getAdminHomeownerProfile>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const r = await getAdminHomeownerProfile(homeownerUserId);
      if (cancelled) return;
      if (!r.ok) {
        setError(r.message || "Record not found");
        setProfile(null);
      } else {
        setProfile(r);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [homeownerUserId, propertyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading property…
      </div>
    );
  }

  const address = (profile?.addresses || []).find((a) => Number(a.propertyId) === Number(propertyId));
  if (error || !address) {
    return (
      <div className="space-y-4">
        <BackBar label="Back to homeowner profile" onBack={onBack} />
        <p className="text-sm text-red-600">{error || "Record not found"}</p>
      </div>
    );
  }

  const jobs = (profile?.serviceHistory || []).filter((j) => Number(j.propertyId) === Number(propertyId));
  const customerName = profile?.customer?.name || "homeowner";

  return (
    <div className="space-y-4">
      <BackBar label={`Back to ${customerName}`} onBack={onBack} />
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              {address.isPrimary ? "Primary Property" : address.label}
            </p>
            <p className="text-lg font-semibold">Property #{address.propertyId}</p>
            {formatAddressLines(address).map((line) => (
              <p key={line} className="text-sm">
                {line}
              </p>
            ))}
            {"propertyType" in address && address.propertyType ? (
              <p className="mt-2 text-xs text-muted-foreground capitalize">
                Type: {String(address.propertyType)}
              </p>
            ) : null}
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold mb-2">Jobs at this property</p>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs linked to this property.</p>
          ) : (
            <ul className="space-y-2">
              {jobs.map((j) => (
                <li key={j.id}>
                  <button
                    type="button"
                    onClick={() => onOpenJob?.(j.id)}
                    className="w-full rounded-xl border border-border px-4 py-3 text-left text-sm hover:bg-muted/30"
                  >
                    <span className="font-semibold">{j.bookingId || `#${j.id}`}</span>
                    <span className="text-muted-foreground"> · {j.title || j.category || "Service"}</span>
                    <span className="ml-2 capitalize text-xs text-muted-foreground">
                      {String(j.status).replace(/_/g, " ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function InvoiceRecordView({
  homeownerUserId,
  invoiceId,
  onBack,
  onMessage,
  onOpenJob,
}: {
  homeownerUserId: number;
  invoiceId: number;
  onBack: () => void;
  onMessage: (msg: string) => void;
  onOpenJob?: (jobId: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<import("./quoteDocument").QuoteInvoice | null>(null);
  const [homeownerName, setHomeownerName] = useState<string>("homeowner");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const [invRes, profileRes] = await Promise.all([
        adminGetInvoice(invoiceId),
        getAdminHomeownerProfile(homeownerUserId),
      ]);
      if (cancelled) return;
      if (profileRes.ok && profileRes.customer?.name) {
        setHomeownerName(profileRes.customer.name);
      }
      if (!invRes.ok || !invRes.invoice) {
        setError(invRes.message || "Record not found");
        setInvoice(null);
      } else if (
        invRes.invoice.homeownerUserId != null &&
        Number(invRes.invoice.homeownerUserId) !== Number(homeownerUserId)
      ) {
        setError("Record not found");
        setInvoice(null);
      } else {
        setInvoice(invRes.invoice);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [homeownerUserId, invoiceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading invoice…
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="space-y-4">
        <BackBar label="Back to homeowner profile" onBack={onBack} />
        <p className="text-sm text-red-600">{error || "Record not found"}</p>
      </div>
    );
  }

  // Prefer existing quote/invoice workspace when a linked proposal exists.
  if (invoice.proposalId != null && Number(invoice.proposalId) > 0) {
    return (
      <QuoteRecordView
        quoteId={Number(invoice.proposalId)}
        onBack={onBack}
        onMessage={onMessage}
        onOpenJob={onOpenJob}
      />
    );
  }

  return (
    <div className="space-y-4">
      <BackBar label={`Back to ${homeownerName}`} onBack={onBack} />
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Invoice</p>
          <p className="font-mono text-xl font-bold">{invoice.invoiceNumber || `FBI-${invoice.id}`}</p>
          <p className="mt-1 text-sm capitalize">{String(invoice.status || "").replace(/_/g, " ")}</p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Homeowner</dt>
            <dd className="mt-1">{homeownerName}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Related quote</dt>
            <dd className="mt-1">—</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Related job</dt>
            <dd className="mt-1">
              {invoice.jobId != null ? (
                <button
                  type="button"
                  className="font-semibold text-primary hover:underline"
                  onClick={() => onOpenJob?.(Number(invoice.jobId))}
                >
                  #{invoice.jobId}
                </button>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Total</dt>
            <dd className="mt-1 tabular-nums">{formatMoney(Number(invoice.total || 0))}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Amount paid</dt>
            <dd className="mt-1 tabular-nums">{formatMoney(Number(invoice.paid || 0))}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Outstanding balance</dt>
            <dd className="mt-1 tabular-nums font-semibold">{formatMoney(Number(invoice.amountDue || 0))}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Status</dt>
            <dd className="mt-1 uppercase text-xs font-bold">{String(invoice.status || "—")}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Due</dt>
            <dd className="mt-1">{fmtDate(invoice.dueDate)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function PaymentRecordView({
  homeownerUserId,
  paymentId,
  onBack,
  onOpenJob,
}: {
  homeownerUserId: number;
  paymentId: number;
  onBack: () => void;
  onOpenJob?: (jobId: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getAdminHomeownerProfile>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const r = await getAdminHomeownerProfile(homeownerUserId);
      if (cancelled) return;
      if (!r.ok) {
        setError(r.message || "Record not found");
        setProfile(null);
      } else {
        setProfile(r);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [homeownerUserId, paymentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading payment…
      </div>
    );
  }

  const txns = (profile?.transactions || profile?.payments || []) as Array<{
    id: number;
    transactionId?: string;
    jobId?: number | null;
    amount?: number;
    provider?: string;
    status?: string;
    createdAt?: string;
    meta?: Record<string, unknown>;
    paymentType?: string;
  }>;
  const payment = txns.find((t) => Number(t.id) === Number(paymentId));

  if (error || !payment) {
    return (
      <div className="space-y-4">
        <BackBar label="Back to homeowner profile" onBack={onBack} />
        <p className="text-sm text-red-600">{error || "Record not found"}</p>
      </div>
    );
  }

  const meta = (payment.meta || {}) as Record<string, unknown>;
  const invoiceLabel = meta.invoiceNumber != null ? String(meta.invoiceNumber) : "—";
  const method = String(payment.provider || "stripe").toLowerCase() === "manual" ? "manual" : String(payment.provider || "stripe");
  const customerName = profile?.customer?.name || "homeowner";

  return (
    <div className="space-y-4">
      <BackBar label={`Back to ${customerName}`} onBack={onBack} />
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Payment</p>
          <p className="font-mono text-xl font-bold">{payment.transactionId || `TXN-${payment.id}`}</p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Payment ID</dt>
            <dd className="mt-1 font-mono">{payment.transactionId || String(payment.id)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Invoice</dt>
            <dd className="mt-1">{invoiceLabel}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Job</dt>
            <dd className="mt-1">
              {payment.jobId != null ? (
                <button
                  type="button"
                  className="font-semibold text-primary hover:underline"
                  onClick={() => onOpenJob?.(Number(payment.jobId))}
                >
                  #{payment.jobId}
                </button>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Amount</dt>
            <dd className="mt-1 tabular-nums font-semibold">{formatMoney(Number(payment.amount || 0))}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Payment method</dt>
            <dd className="mt-1 capitalize">{method}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Stripe / manual</dt>
            <dd className="mt-1 capitalize">{method === "manual" ? "manual" : "stripe"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Status</dt>
            <dd className="mt-1 uppercase text-xs font-bold">{String(payment.status || "—")}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Date</dt>
            <dd className="mt-1">{fmtDate(payment.createdAt)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
