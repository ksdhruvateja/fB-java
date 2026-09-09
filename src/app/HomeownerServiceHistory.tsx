import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  FileText,
  Receipt,
  X,
} from "lucide-react";
import type { ManagedJob, Property, PropertyDocument, Proposal } from "./managedJobs";
import { STATUS_LABELS, formatMoney, getProposal } from "./managedJobs";

const HISTORY_STATUSES = new Set([
  "proposal_sent",
  "awaiting_customer_approval",
  "approved",
  "scheduled",
  "contractor_en_route",
  "work_started",
  "work_completed",
  "customer_review_pending",
  "admin_review_pending",
  "payout_pending",
  "paid_out",
  "closed",
]);

function jobAmount(job: ManagedJob, proposal?: Proposal | null): number | null {
  if (proposal?.retailAmount != null) return Number(proposal.retailAmount);
  const report = job.completionReport as Record<string, unknown> | null | undefined;
  const fromReport = report?.amount ?? report?.total ?? report?.retailAmount;
  if (fromReport != null && Number.isFinite(Number(fromReport))) return Number(fromReport);
  if (job.customerRetailEstimateHigh != null) return Number(job.customerRetailEstimateHigh);
  if (job.customerRetailEstimateLow != null) return Number(job.customerRetailEstimateLow);
  return null;
}

function jobDate(job: ManagedJob): Date {
  const report = job.completionReport as Record<string, unknown> | null | undefined;
  if (report?.completedAt) {
    const d = new Date(String(report.completedAt));
    if (!Number.isNaN(d.getTime())) return d;
  }
  for (const raw of [job.updatedAt, job.createdAt]) {
    if (!raw) continue;
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function companyName(job: ManagedJob): string {
  const t = job.technician;
  return t?.company || t?.name || t?.trade || "FixBridge pro";
}

function invoicesForJob(job: ManagedJob, properties: Property[]): PropertyDocument[] {
  const prop = properties.find((p) => p.id === job.propertyId);
  if (!prop?.documents?.length) return [];
  const jd = jobDate(job).getTime();
  return prop.documents.filter((d) => {
    const cat = String(d.category || "");
    if (!["invoice", "receipt"].includes(cat)) return false;
    if (!d.createdAt) return true;
    return Math.abs(new Date(d.createdAt).getTime() - jd) < 1000 * 60 * 60 * 24 * 60;
  });
}

export default function HomeownerServiceHistory({
  jobs,
  properties,
  onOpenTracking,
  embedded,
}: {
  jobs: ManagedJob[];
  properties: Property[];
  onOpenTracking?: (jobId: number) => void;
  embedded?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [invoiceDocs, setInvoiceDocs] = useState<PropertyDocument[] | null>(null);
  const [invoiceIndex, setInvoiceIndex] = useState(0);
  const [showInvoiceSummary, setShowInvoiceSummary] = useState(false);

  const historyJobs = useMemo(
    () =>
      [...jobs]
        .filter((j) => HISTORY_STATUSES.has(String(j.status)))
        .sort((a, b) => jobDate(b).getTime() - jobDate(a).getTime()),
    [jobs]
  );

  const loggedPrevious = useMemo(() => {
    const rows: Array<{
      id: string;
      title: string;
      system: string;
      company?: string;
      date?: string;
      cost?: string;
      home: string;
    }> = [];
    for (const p of properties) {
      const prev = (p.healthProfile as { previousServices?: Array<Record<string, unknown>> } | null)
        ?.previousServices;
      if (!Array.isArray(prev)) continue;
      for (const s of prev) {
        if (!s || !String(s.title || "").trim()) continue;
        rows.push({
          id: String(s.id || `${p.id}-${s.title}`),
          title: String(s.title),
          system: String(s.system || "Other"),
          company: s.company ? String(s.company) : undefined,
          date: s.date ? String(s.date) : undefined,
          cost: s.cost != null ? String(s.cost) : undefined,
          home: p.label || p.addressLine1 || `Home #${p.id}`,
        });
      }
    }
    return rows.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [properties]);

  const selected = useMemo(
    () => historyJobs.find((j) => j.id === selectedId) || null,
    [historyJobs, selectedId]
  );

  useEffect(() => {
    if (!selectedId && historyJobs[0]) setSelectedId(historyJobs[0].id);
  }, [historyJobs, selectedId]);

  useEffect(() => {
    if (!selected) {
      setProposal(null);
      return;
    }
    let cancelled = false;
    void getProposal(selected.id).then((r) => {
      if (cancelled) return;
      setProposal(r.ok ? r.proposal : null);
    });
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  const amount = selected ? jobAmount(selected, proposal) : null;
  const company = selected ? companyName(selected) : "";
  const techName = selected?.technician?.name || null;
  const prop = selected
    ? properties.find((p) => p.id === selected.propertyId) || null
    : null;
  const linkedInvoices = selected ? invoicesForJob(selected, properties) : [];
  const report = (selected?.completionReport || null) as Record<string, unknown> | null;

  const openDocs = (docs: PropertyDocument[], idx = 0) => {
    if (!docs.length) return;
    setInvoiceDocs(docs);
    setInvoiceIndex(Math.min(idx, docs.length - 1));
  };

  const currentDoc = invoiceDocs?.[invoiceIndex] || null;

  return (
    <section className={embedded ? "space-y-4" : "mx-auto max-w-5xl space-y-5"}>
      {!embedded ? (
        <div>
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
            Service History
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Past and in-progress work — company, invoice, and full service details.
          </p>
        </div>
      ) : null}

      {historyJobs.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-border bg-card px-6 py-12 text-center">
          <Building2 className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 text-sm font-medium">No FixBridge jobs yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            After you hire a pro, jobs and invoices will appear here. Past services you log in Property Health show below.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
          <div className="space-y-2">
            {historyJobs.map((job) => {
              const active = selected?.id === job.id;
              const amt = jobAmount(job);
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedId(job.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    active ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{job.title || job.category}</p>
                      <p className="mt-1 text-sm text-muted-foreground truncate">{companyName(job)}</p>
                    </div>
                    <ChevronRight className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {jobDate(job).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span>{STATUS_LABELS[job.status] || job.status}</span>
                    {amt != null && <span className="font-semibold text-foreground">{formatMoney(amt)}</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="space-y-4 rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm sm:p-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Service details
                </p>
                <h2 className="mt-1 text-xl font-semibold">{selected.title || selected.category}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selected.bookingId ? `Request #${selected.bookingId}` : `Job #${selected.id}`}
                </p>
              </div>

              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">Company</p>
                </div>
                <p className="text-base font-semibold">{company}</p>
                {techName && techName !== company && (
                  <p className="text-sm text-muted-foreground">Technician: {techName}</p>
                )}
                {selected.technician?.verified && (
                  <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                  </p>
                )}
                {selected.technician?.insured && (
                  <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 ml-2">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Insured
                  </p>
                )}
              </div>

              <dl className="grid gap-2 sm:grid-cols-2 text-sm">
                <div className="rounded-xl bg-muted/30 px-3 py-2.5 flex justify-between gap-2">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="font-semibold">{STATUS_LABELS[selected.status] || selected.status}</dd>
                </div>
                <div className="rounded-xl bg-muted/30 px-3 py-2.5 flex justify-between gap-2">
                  <dt className="text-muted-foreground">Date</dt>
                  <dd className="font-semibold">
                    {jobDate(selected).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </dd>
                </div>
                <div className="rounded-xl bg-muted/30 px-3 py-2.5 flex justify-between gap-2 sm:col-span-2">
                  <dt className="text-muted-foreground">Amount</dt>
                  <dd className="font-semibold">{amount != null ? formatMoney(amount) : "—"}</dd>
                </div>
                {prop && (
                  <div className="rounded-xl bg-muted/30 px-3 py-2.5 sm:col-span-2">
                    <dt className="text-muted-foreground text-xs">Property</dt>
                    <dd className="mt-0.5 font-medium">
                      {[prop.addressLine1, prop.city, prop.state].filter(Boolean).join(", ")}
                    </dd>
                  </div>
                )}
              </dl>

              {selected.description && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What was reported</p>
                  <p className="mt-1.5 text-sm text-muted-foreground whitespace-pre-wrap">{selected.description}</p>
                </div>
              )}

              {report?.summary != null && String(report.summary).trim() && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Work summary</p>
                  <p className="mt-1.5 text-sm text-muted-foreground whitespace-pre-wrap">{String(report.summary)}</p>
                </div>
              )}

              {(report?.beforePhotoUrl || report?.afterPhotoUrl) && (
                <div className="grid grid-cols-2 gap-3">
                  {report.beforePhotoUrl ? (
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">Before</p>
                      <img
                        src={String(report.beforePhotoUrl)}
                        alt="Before"
                        className="h-28 w-full rounded-xl border border-border object-cover"
                      />
                    </div>
                  ) : null}
                  {report.afterPhotoUrl ? (
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">After</p>
                      <img
                        src={String(report.afterPhotoUrl)}
                        alt="After"
                        className="h-28 w-full rounded-xl border border-border object-cover"
                      />
                    </div>
                  ) : null}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowInvoiceSummary(true)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                >
                  <Receipt className="h-4 w-4" /> View invoice
                </button>
                {linkedInvoices.length > 0 && (
                  <button
                    type="button"
                    onClick={() => openDocs(linkedInvoices)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold"
                  >
                    <FileText className="h-4 w-4" /> Uploaded receipt
                    {linkedInvoices.length > 1 ? `s (${linkedInvoices.length})` : ""}
                  </button>
                )}
                {onOpenTracking && (
                  <button
                    type="button"
                    onClick={() => onOpenTracking(selected.id)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold"
                  >
                    Track request
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {showInvoiceSummary && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close"
            onClick={() => setShowInvoiceSummary(false)}
          />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-[1.5rem] border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <p className="font-semibold">Invoice</p>
              <button
                type="button"
                onClick={() => setShowInvoiceSummary(false)}
                className="rounded-lg p-2 hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-5 text-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bill to</p>
                <p className="mt-1 font-medium">Homeowner</p>
                {prop && (
                  <p className="text-muted-foreground">
                    {[prop.addressLine1, prop.city, prop.state, prop.zip].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">From</p>
                <p className="mt-1 font-semibold">{company}</p>
                {techName && <p className="text-muted-foreground">{techName}</p>}
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Service</span>
                  <span className="font-medium text-right">{selected.title || selected.category}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Reference</span>
                  <span className="font-medium">{selected.bookingId || selected.id}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">
                    {jobDate(selected).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                {proposal?.scopeSummary && (
                  <div>
                    <p className="text-muted-foreground">Scope</p>
                    <p className="mt-0.5 font-medium">{proposal.scopeSummary}</p>
                  </div>
                )}
                <div className="flex justify-between gap-3 border-t border-border pt-2 text-base">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold text-primary">{amount != null ? formatMoney(amount) : "TBD"}</span>
                </div>
              </div>
              {linkedInvoices.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowInvoiceSummary(false);
                    openDocs(linkedInvoices);
                  }}
                  className="w-full rounded-xl border border-border py-2.5 text-sm font-semibold"
                >
                  Open uploaded invoice file
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {loggedPrevious.length > 0 && (
        <div className="rounded-[1.5rem] border border-border/70 bg-card p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Previous services you logged
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            From Property Health — used by FixBridge AI for suggestions and home scoring.
          </p>
          <ul className="mt-4 divide-y divide-border">
            {loggedPrevious.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="font-semibold">{s.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[s.system, s.company, s.home].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {s.date ? (
                    <p>
                      {new Date(`${s.date}T12:00:00`).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  ) : null}
                  {s.cost ? <p className="font-semibold text-foreground">{s.cost}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {invoiceDocs && currentDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close"
            onClick={() => setInvoiceDocs(null)}
          />
          <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[1.5rem] border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <p className="truncate text-sm font-semibold">
                {currentDoc.title || currentDoc.fileName || "Invoice"}
              </p>
              <button
                type="button"
                onClick={() => setInvoiceDocs(null)}
                className="rounded-lg p-2 hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-muted/20 p-4">
              {currentDoc.mimeType?.startsWith("image/") || currentDoc.dataUrl?.startsWith("data:image/") ? (
                <img
                  src={currentDoc.dataUrl}
                  alt=""
                  className="mx-auto max-h-[70vh] max-w-full rounded-xl border border-border object-contain"
                />
              ) : (
                <iframe
                  title="Invoice"
                  src={currentDoc.dataUrl}
                  className="h-[70vh] w-full rounded-xl border border-border bg-white"
                />
              )}
            </div>
            <div className="flex justify-between gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                disabled={invoiceIndex <= 0}
                onClick={() => setInvoiceIndex((i) => Math.max(0, i - 1))}
                className="rounded-xl border border-border px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                Previous
              </button>
              <a
                href={currentDoc.dataUrl}
                download={currentDoc.fileName || "invoice"}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-primary hover:underline"
              >
                Open / download
              </a>
              <button
                type="button"
                disabled={invoiceIndex >= invoiceDocs.length - 1}
                onClick={() => setInvoiceIndex((i) => Math.min(invoiceDocs.length - 1, i + 1))}
                className="rounded-xl border border-border px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
