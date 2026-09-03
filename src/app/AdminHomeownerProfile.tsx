import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Plus,
} from "lucide-react";
import { formatMoney } from "./managedJobs";
import { getAdminHomeownerProfile, listHomeownerNotes, addHomeownerNote } from "./platformApi";
import {
  adminUnsubscribeMarketing,
  getAdminMarketingPreferences,
  type MarketingPreferences,
} from "./marketingApi";
import { formatAddressLines } from "./addressFormat";

type TabId =
  | "overview"
  | "properties"
  | "jobs"
  | "quotes"
  | "invoices"
  | "payments"
  | "documents"
  | "tickets"
  | "activity"
  | "notes";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "properties", label: "Properties" },
  { id: "jobs", label: "Jobs" },
  { id: "quotes", label: "Quotes" },
  { id: "invoices", label: "Invoices" },
  { id: "payments", label: "Payments" },
  { id: "documents", label: "Documents" },
  { id: "tickets", label: "Support Tickets" },
  { id: "activity", label: "Activity" },
  { id: "notes", label: "Internal Notes" },
];

const JOB_FILTERS = ["all", "active", "waiting", "completed", "cancelled"] as const;

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function invoiceBadge(status: string) {
  const s = String(status || "draft").toUpperCase().replace(/_/g, " ");
  const map: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    SENT: "bg-sky-500/15 text-sky-700",
    DUE: "bg-amber-500/15 text-amber-700",
    "PARTIALLY PAID": "bg-amber-500/15 text-amber-800",
    PAID: "bg-emerald-500/15 text-emerald-700",
    "PAST DUE": "bg-red-500/15 text-red-700",
    REFUNDED: "bg-violet-500/15 text-violet-700",
    VOID: "bg-muted text-muted-foreground",
  };
  return map[s] || "bg-muted text-muted-foreground";
}

export default function AdminHomeownerProfile({
  userId,
  onBack,
  onOpenProperty,
  onOpenJob,
  onOpenQuote,
  onOpenInvoice,
  onOpenPayment,
  onOpenTicket,
  onOpenTab,
  onMessageHomeowner,
}: {
  userId: number;
  onBack: () => void;
  onOpenProperty?: (propertyId: number) => void;
  onOpenJob?: (jobId: number) => void;
  onOpenQuote?: (quoteId: number) => void;
  onOpenInvoice?: (invoiceId: number, proposalId?: number | null) => void;
  onOpenPayment?: (paymentId: number) => void;
  onOpenTicket?: (ticketNumber: string) => void;
  onOpenTab?: (tab: string) => void;
  onMessageHomeowner?: (userId: number) => void;
}) {
  const [tab, setTab] = useState<TabId>("overview");
  const [jobFilter, setJobFilter] = useState<(typeof JOB_FILTERS)[number]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof getAdminHomeownerProfile>> | null>(null);
  const [notes, setNotes] = useState<Array<{ id: number; note: string; adminName?: string; createdAt: string; relatedJobId?: number | null; relatedTicketId?: number | null }>>([]);
  const [noteText, setNoteText] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [marketingPrefs, setMarketingPrefs] = useState<MarketingPreferences | null>(null);
  const [marketingBusy, setMarketingBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const r = await getAdminHomeownerProfile(userId);
      if (cancelled) return;
      if (!r.ok) {
        setError(r.message || "Could not load customer profile.");
        setData(null);
      } else {
        setData(r);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    void getAdminMarketingPreferences(userId).then((r) => {
      if (r.ok && r.preferences) setMarketingPrefs(r.preferences);
    });
  }, [userId]);

  useEffect(() => {
    void listHomeownerNotes(userId).then((r) => {
      if (r.ok) setNotes(r.notes || []);
    });
  }, [tab, userId]);

  const filteredJobs = useMemo(() => {
    const jobs = data?.serviceHistory || [];
    if (jobFilter === "all") return jobs;
    if (jobFilter === "active") return jobs.filter((j) => !["completed", "cancelled", "canceled", "closed"].includes(String(j.status).toLowerCase()));
    if (jobFilter === "completed") return jobs.filter((j) => String(j.status).toLowerCase() === "completed");
    if (jobFilter === "cancelled") return jobs.filter((j) => ["cancelled", "canceled"].includes(String(j.status).toLowerCase()));
    return jobs.filter((j) => String(j.status).toLowerCase().includes("wait"));
  }, [data?.serviceHistory, jobFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading customer…
      </div>
    );
  }

  if (error || !data?.customer) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to homeowners
        </button>
        <p className="text-sm text-red-600">{error || "Customer not found."}</p>
      </div>
    );
  }

  const c = data.customer;
  const stats = data.stats || {};
  const addresses = data.addresses || [];
  const primary = addresses.find((a) => a.isPrimary) || addresses[0];
  const txns = data.transactions || data.payments || [];
  const quotes = data.quotes || [];
  const invoices = data.invoices || [];
  const tickets = data.tickets || [];
  const activity = data.activity || [];

  async function saveNote() {
    if (!noteText.trim()) return;
    setNoteBusy(true);
    const r = await addHomeownerNote(userId, noteText.trim());
    if (r.ok && r.note) {
      setNotes((prev) => [r.note!, ...prev]);
      setNoteText("");
    }
    setNoteBusy(false);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Homeowners
        </button>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">{c.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Homeowner ID #{c.id} · <span className="capitalize">{c.accountStatus}</span> · Joined {fmtDate(c.joinedAt)}
            </p>
            <p className="text-sm mt-2">{c.email}{c.phone ? ` · ${c.phone}` : ""}</p>
            {primary && (
              <p className="text-sm text-muted-foreground mt-1">
                Primary Property: {[primary.addressLine1, primary.city, primary.state, primary.zip].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["Message homeowner", () => onMessageHomeowner?.(userId)],
              ["View Jobs", () => setTab("jobs")],
              ["Create Service Request", () => onOpenTab?.("dispatch")],
              ["View Payments", () => setTab("payments")],
              ["View Tickets", () => setTab("tickets")],
            ].map(([label, action]) => (
              <button key={String(label)} type="button" onClick={() => (action as () => void)()} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40">
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Active Jobs", value: stats.activeJobs },
          { label: "Total Jobs", value: stats.totalJobs },
          { label: "Open Quotes", value: stats.openQuotes },
          { label: "Outstanding Balance", value: stats.outstandingBalance, money: true },
          { label: "Total Paid", value: stats.totalPaid, money: true },
          { label: "Open Support Tickets", value: stats.openTickets },
          { label: "Properties", value: stats.properties },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {card.money ? formatMoney(Number(card.value || 0)) : Number(card.value || 0)}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${tab === t.id ? "bg-primary text-white" : "hover:bg-muted/50 text-muted-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <dl className="rounded-2xl border border-border bg-card p-5 text-sm space-y-3">
            <div><dt className="text-xs uppercase text-muted-foreground">Contact</dt><dd className="mt-1">{c.name} · {c.email} · {c.phone || "—"}</dd></div>
            <div><dt className="text-xs uppercase text-muted-foreground">Account</dt><dd className="mt-1 capitalize">{c.accountStatus}</dd></div>
            <div><dt className="text-xs uppercase text-muted-foreground">HomeCare Pro</dt><dd className="mt-1">{(data as { homeCarePro?: { isPro?: boolean; subscriptionStatus?: string | null; renewalAt?: string | null; recurringServicesCount?: number; householdMembersCount?: number; reportEligible?: boolean } }).homeCarePro?.isPro ? "Active" : "Free"}</dd></div>
            {(data as { homeCarePro?: { isPro?: boolean; renewalAt?: string | null; recurringServicesCount?: number; householdMembersCount?: number; reportEligible?: boolean; lastReportAt?: string | null } }).homeCarePro?.isPro && (
              <>
                <div><dt className="text-xs uppercase text-muted-foreground">Renewal</dt><dd className="mt-1">{fmtDate((data as { homeCarePro?: { renewalAt?: string | null } }).homeCarePro?.renewalAt)}</dd></div>
                <div><dt className="text-xs uppercase text-muted-foreground">Recurring services</dt><dd className="mt-1">{(data as { homeCarePro?: { recurringServicesCount?: number } }).homeCarePro?.recurringServicesCount ?? 0}</dd></div>
                <div><dt className="text-xs uppercase text-muted-foreground">Household members</dt><dd className="mt-1">{(data as { homeCarePro?: { householdMembersCount?: number } }).homeCarePro?.householdMembersCount ?? 0}</dd></div>
                <div><dt className="text-xs uppercase text-muted-foreground">Health report</dt><dd className="mt-1">{(data as { homeCarePro?: { reportEligible?: boolean; lastReportAt?: string | null } }).homeCarePro?.reportEligible ? "Eligible now" : `Last ${fmtDate((data as { homeCarePro?: { lastReportAt?: string | null } }).homeCarePro?.lastReportAt)}`}</dd></div>
              </>
            )}
            <div><dt className="text-xs uppercase text-muted-foreground">Recent service</dt><dd className="mt-1">{data.serviceHistory?.[0]?.title || "—"}</dd></div>
            <div><dt className="text-xs uppercase text-muted-foreground">Recent quote</dt><dd className="mt-1">{quotes[0]?.quoteNumber || "—"}</dd></div>
            <div><dt className="text-xs uppercase text-muted-foreground">Recent invoice</dt><dd className="mt-1">{invoices[0]?.invoiceNumber || "—"}</dd></div>
            <div><dt className="text-xs uppercase text-muted-foreground">Recent payment</dt><dd className="mt-1">{txns[0] ? formatMoney(Number(txns[0].amount)) : "—"}</dd></div>
            <div><dt className="text-xs uppercase text-muted-foreground">Open support</dt><dd className="mt-1">{tickets.find((t) => !["resolved", "closed"].includes(String(t.status)))?.subject || "None"}</dd></div>
          </dl>
          <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 text-sm">
            <p className="font-semibold mb-3">Marketing Preferences</p>
            {marketingPrefs ? (
              <dl className="space-y-2">
                <div className="flex justify-between gap-4 py-1">
                  <dt className="text-muted-foreground">Email Marketing</dt>
                  <dd className="font-medium">{marketingPrefs.emailMarketing.subscribed ? "Subscribed" : "Unsubscribed"}</dd>
                </div>
                <div className="flex justify-between gap-4 py-1">
                  <dt className="text-muted-foreground">SMS Marketing</dt>
                  <dd className="font-medium">{marketingPrefs.smsMarketing.subscribed ? "Subscribed" : "Unsubscribed"}</dd>
                </div>
                <div className="flex justify-between gap-4 py-1 text-xs">
                  <dt className="text-muted-foreground">Signup method</dt>
                  <dd>{marketingPrefs.signupMethod || "email"}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-muted-foreground text-xs">Loading marketing preferences…</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={marketingBusy || !marketingPrefs?.emailMarketing.subscribed}
                onClick={async () => {
                  setMarketingBusy(true);
                  const r = await adminUnsubscribeMarketing(userId, ["email"]);
                  if (r.ok && r.preferences) setMarketingPrefs(r.preferences);
                  setMarketingBusy(false);
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 disabled:opacity-40"
              >
                Unsubscribe Email Marketing
              </button>
              <button
                type="button"
                disabled={marketingBusy || !marketingPrefs?.smsMarketing.subscribed}
                onClick={async () => {
                  setMarketingBusy(true);
                  const r = await adminUnsubscribeMarketing(userId, ["sms"]);
                  if (r.ok && r.preferences) setMarketingPrefs(r.preferences);
                  setMarketingBusy(false);
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 disabled:opacity-40"
              >
                Unsubscribe SMS Marketing
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Admin can process unsubscribe requests only — not opt users into marketing.</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-semibold mb-3">Recent Activity</p>
            <ul className="space-y-2 text-sm">
              {activity.slice(0, 8).map((a, i) => (
                <li key={i} className="flex justify-between gap-2 border-b border-border/40 pb-2">
                  <span>{a.action}{a.detail ? `: ${a.detail}` : ""}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(a.at)}</span>
                </li>
              ))}
              {activity.length === 0 && <li className="text-muted-foreground">No activity yet.</li>}
            </ul>
          </div>
          </div>
        </div>
      )}

      {tab === "properties" && (
        <div className="space-y-3">
          {addresses.length === 0 ? <p className="text-sm text-muted-foreground">No properties.</p> : addresses.map((a) => {
            const active = (data.serviceHistory || []).filter((j) => j.propertyId === a.propertyId && !["completed", "cancelled"].includes(String(j.status))).length;
            const prev = (data.serviceHistory || []).filter((j) => j.propertyId === a.propertyId && String(j.status) === "completed").length;
            return (
              <div key={a.propertyId} className="rounded-2xl border border-border bg-card p-4 flex flex-wrap justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{a.isPrimary ? "Primary Property" : a.label}</p>
                  {formatAddressLines(a).map((line) => <p key={line} className="text-sm">{line}</p>)}
                  <p className="text-xs text-muted-foreground mt-1">
                    {a.addressVerified ? "USPS verified ✓" : "Address not verified"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">Active jobs: {active} · Previous: {prev}</p>
                </div>
                {onOpenProperty ? (
                  <button type="button" onClick={() => onOpenProperty(a.propertyId)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted/40">
                    <MapPin className="h-3.5 w-3.5" /> Open property
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {tab === "jobs" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {JOB_FILTERS.map((f) => (
              <button key={f} type="button" onClick={() => setJobFilter(f)} className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${jobFilter === f ? "bg-primary text-white" : "border border-border"}`}>{f}</button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Job #</th><th className="px-4 py-3">Service</th><th className="px-4 py-3">Property</th><th className="px-4 py-3">Contractor</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Created</th><th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredJobs.map((j) => (
                  <tr key={j.id} className="hover:bg-muted/10 cursor-pointer" onClick={() => onOpenJob?.(j.id)}>
                    <td className="px-4 py-3">{j.bookingId || `#${j.id}`}</td>
                    <td className="px-4 py-3">{j.title || j.category}</td>
                    <td className="px-4 py-3">{j.address || "—"}</td>
                    <td className="px-4 py-3">{j.contractor || "—"}</td>
                    <td className="px-4 py-3 capitalize">{String(j.status).replace(/_/g, " ")}</td>
                    <td className="px-4 py-3">{fmtDate(j.createdAt)}</td>
                    <td className="px-4 py-3 text-right">{j.amount != null ? formatMoney(j.amount) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "quotes" && (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr><th className="px-4 py-3">Quote #</th><th className="px-4 py-3">Job #</th><th className="px-4 py-3">Service</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Created</th></tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {quotes.map((q) => (
                <tr
                  key={q.id}
                  className={onOpenQuote ? "hover:bg-muted/10 cursor-pointer" : ""}
                  onClick={() => onOpenQuote?.(q.id)}
                >
                  <td className="px-4 py-3">{q.quoteNumber}</td><td className="px-4 py-3">#{q.jobId}</td><td className="px-4 py-3">{q.service}</td><td className="px-4 py-3 text-right">{q.amount != null ? formatMoney(q.amount) : "—"}</td><td className="px-4 py-3 capitalize">{q.status}</td><td className="px-4 py-3">{fmtDate(q.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "invoices" && (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr><th className="px-4 py-3">Invoice #</th><th className="px-4 py-3">Job #</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Due</th></tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className={onOpenInvoice ? "hover:bg-muted/10 cursor-pointer" : ""}
                  onClick={() => onOpenInvoice?.(inv.id, inv.proposalId)}
                >
                  <td className="px-4 py-3">{inv.invoiceNumber}</td><td className="px-4 py-3">#{inv.jobId}</td><td className="px-4 py-3 text-right">{formatMoney(inv.total)}</td><td className="px-4 py-3 text-right">{formatMoney(inv.paid)}</td><td className="px-4 py-3 text-right">{formatMoney(inv.amountDue)}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${invoiceBadge(inv.status)}`}>{String(inv.status).toUpperCase()}</span></td>
                  <td className="px-4 py-3">{fmtDate(inv.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "payments" && (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr><th className="px-4 py-3">Payment ID</th><th className="px-4 py-3">Job</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Date</th></tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {txns.map((t) => (
                <tr
                  key={t.id}
                  className={onOpenPayment ? "hover:bg-muted/10 cursor-pointer" : ""}
                  onClick={() => onOpenPayment?.(Number(t.id))}
                >
                  <td className="px-4 py-3 font-mono text-xs">{t.transactionId}</td><td className="px-4 py-3">{t.jobId ? `#${t.jobId}` : "—"}</td><td className="px-4 py-3 text-right">{formatMoney(Number(t.amount))}</td><td className="px-4 py-3 capitalize">{t.provider || "stripe"}</td><td className="px-4 py-3 uppercase text-xs">{t.status}</td><td className="px-4 py-3">{fmtDate(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "documents" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {quotes.map((q) => <div key={`q-${q.id}`} className="rounded-xl border border-border p-4 text-sm"><p className="font-semibold">Quote {q.quoteNumber}</p><p className="text-muted-foreground">{q.service} · {q.status}</p></div>)}
          {invoices.map((inv) => <div key={`i-${inv.id}`} className="rounded-xl border border-border p-4 text-sm"><p className="font-semibold">Invoice {inv.invoiceNumber}</p><p className="text-muted-foreground">{formatMoney(inv.total)} · {inv.status}</p></div>)}
          {quotes.length === 0 && invoices.length === 0 && <p className="text-sm text-muted-foreground">No documents yet.</p>}
        </div>
      )}

      {tab === "tickets" && (
        <div className="space-y-2">
          {tickets.map((t) => (
            <button key={t.id} type="button" onClick={() => onOpenTicket?.(t.ticketNumber)} className="w-full rounded-xl border border-border p-4 text-left hover:bg-muted/30">
              <p className="font-semibold">{t.ticketNumber}</p><p className="text-sm">{t.subject}</p><p className="text-xs text-muted-foreground capitalize">{t.status} · {fmtDate(t.updatedAt)}</p>
            </button>
          ))}
          {tickets.length === 0 && <p className="text-sm text-muted-foreground">No support tickets.</p>}
        </div>
      )}

      {tab === "activity" && (
        <ul className="space-y-2">
          {activity.map((a, i) => (
            <li key={i} className="rounded-xl border border-border px-4 py-3 text-sm flex justify-between gap-3">
              <span>{a.action}{a.detail ? `: ${a.detail}` : ""}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(a.at)}</span>
            </li>
          ))}
        </ul>
      )}

      {tab === "notes" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <textarea rows={3} className="w-full rounded-xl border border-border px-3 py-2 text-sm" placeholder="Internal admin note (never visible to homeowner or contractor)" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
            <button type="button" disabled={noteBusy} onClick={() => void saveNote()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {noteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add note
            </button>
          </div>
          {notes.map((n) => (
            <div key={n.id} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              <p className="whitespace-pre-wrap">{n.note}</p>
              <p className="text-xs text-muted-foreground mt-2">{n.adminName || "Admin"} · {fmtDate(n.createdAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
