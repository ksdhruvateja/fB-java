import { useEffect, useMemo, useState } from "react";
import { CalendarDays, FileText, Receipt, X } from "lucide-react";
import type { ManagedJob, Property, PropertyDocument } from "./managedJobs";
import { formatMoney } from "./managedJobs";

export type HistoryEntry = {
  id: string;
  date: Date;
  title: string;
  contractor?: string | null;
  amount?: number | null;
  receipts: PropertyDocument[];
  source: "job" | "document" | "system";
  jobId?: number;
};

const COMPLETED = new Set([
  "work_completed",
  "customer_review_pending",
  "admin_review_pending",
  "payout_pending",
  "paid_out",
  "closed",
]);

function monthDay(d: Date) {
  return d
    .toLocaleDateString("en-US", { month: "short", day: "2-digit" })
    .toUpperCase()
    .replace(",", "");
}

function jobAmount(job: ManagedJob): number | null {
  const report = job.completionReport as Record<string, unknown> | null | undefined;
  const fromReport = report?.amount ?? report?.total ?? report?.retailAmount;
  if (fromReport != null && Number.isFinite(Number(fromReport))) return Number(fromReport);
  if (job.customerRetailEstimateHigh != null) return Number(job.customerRetailEstimateHigh);
  if (job.customerRetailEstimateLow != null) return Number(job.customerRetailEstimateLow);
  return null;
}

function jobDate(job: ManagedJob): Date {
  const report = job.completionReport as Record<string, unknown> | null | undefined;
  const completedAt = report?.completedAt ? new Date(String(report.completedAt)) : null;
  if (completedAt && !Number.isNaN(completedAt.getTime())) return completedAt;
  if (job.updatedAt) {
    const u = new Date(job.updatedAt);
    if (!Number.isNaN(u.getTime())) return u;
  }
  if (job.createdAt) {
    const c = new Date(job.createdAt);
    if (!Number.isNaN(c.getTime())) return c;
  }
  return new Date();
}

function buildHistory(property: Property, jobs: ManagedJob[], propertyCount: number): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  const scopedJobs = jobs.filter((j) => {
    if (!COMPLETED.has(String(j.status))) return false;
    if (j.propertyId != null) return Number(j.propertyId) === Number(property.id);
    return propertyCount === 1;
  });

  for (const job of scopedJobs) {
    const tech = job.technician;
    const contractor =
      [tech?.company, tech?.name].filter(Boolean).join(" · ") ||
      tech?.trade ||
      null;
    const receipts = (property.documents || []).filter((d) => {
      const cat = String(d.category || "");
      if (!["receipt", "invoice", "warranty"].includes(cat)) return false;
      if (!d.createdAt) return cat === "receipt" || cat === "invoice";
      const dd = new Date(d.createdAt);
      const jd = jobDate(job);
      const diff = Math.abs(dd.getTime() - jd.getTime());
      return diff < 1000 * 60 * 60 * 24 * 45;
    });
    entries.push({
      id: `job-${job.id}`,
      date: jobDate(job),
      title: job.title || job.category || "Service",
      contractor,
      amount: jobAmount(job),
      receipts,
      source: "job",
      jobId: job.id,
    });
  }

  for (const doc of property.documents || []) {
    const cat = String(doc.category || "");
    if (!["receipt", "invoice", "inspection", "contractor"].includes(cat)) continue;
    // Skip if already attached near a job entry
    const already = entries.some((e) => e.receipts.some((r) => r.id === doc.id));
    if (already) continue;
    const d = doc.createdAt ? new Date(doc.createdAt) : new Date();
    if (Number.isNaN(d.getTime())) continue;
    entries.push({
      id: `doc-${doc.id}`,
      date: d,
      title: doc.title || doc.fileName || DOC_LABEL[cat] || "Document",
      contractor: null,
      amount: null,
      receipts: [doc],
      source: "document",
    });
  }

  for (const sys of property.homeSystems || []) {
    if (!sys.lastService?.trim()) continue;
    const parsed = new Date(sys.lastService);
    // Accept "May 12, 2026" style
    const d = Number.isNaN(parsed.getTime()) ? tryLooseDate(sys.lastService) : parsed;
    if (!d) continue;
    entries.push({
      id: `sys-${sys.key}-${sys.lastService}`,
      date: d,
      title: `${sys.name}${sys.brand ? ` · ${sys.brand}` : ""} service`,
      contractor: null,
      amount: null,
      receipts: (property.documents || []).filter((doc) => doc.systemKey === sys.key),
      source: "system",
    });
  }

  const previous = (property.healthProfile as { previousServices?: Array<Record<string, unknown>> } | null)
    ?.previousServices;
  if (Array.isArray(previous)) {
    for (const svc of previous) {
      if (!svc || !String(svc.title || "").trim()) continue;
      const rawDate = svc.date ? String(svc.date) : "";
      const d = rawDate ? new Date(rawDate.includes("T") ? rawDate : `${rawDate}T12:00:00`) : new Date();
      if (Number.isNaN(d.getTime())) continue;
      const costNum = svc.cost != null && String(svc.cost).trim() !== "" ? Number(svc.cost) : null;
      entries.push({
        id: `prev-${String(svc.id || `${svc.title}-${rawDate}`)}`,
        date: d,
        title: String(svc.title),
        contractor: svc.company ? String(svc.company) : null,
        amount: costNum != null && Number.isFinite(costNum) ? costNum : null,
        receipts: [],
        source: "system",
      });
    }
  }

  entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  return entries;
}

const DOC_LABEL: Record<string, string> = {
  receipt: "Receipt",
  invoice: "Invoice",
  inspection: "Inspection report",
  contractor: "Contractor record",
  warranty: "Warranty",
};

function tryLooseDate(raw: string): Date | null {
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d;
  const m = raw.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (m) {
    const attempt = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
    if (!Number.isNaN(attempt.getTime())) return attempt;
  }
  return null;
}

function groupByYear(entries: HistoryEntry[]) {
  const map = new Map<number, HistoryEntry[]>();
  for (const e of entries) {
    const y = e.date.getFullYear();
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push(e);
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]);
}

export default function HomeownerMaintenanceTimeline({
  properties,
  jobs,
  onOpenJob,
  embedded,
  selectedPropertyId,
  onSelectedPropertyIdChange,
  hidePropertyPicker,
}: {
  properties: Property[];
  jobs: ManagedJob[];
  onOpenJob?: (jobId: number) => void;
  embedded?: boolean;
  selectedPropertyId?: number | null;
  onSelectedPropertyIdChange?: (id: number) => void;
  hidePropertyPicker?: boolean;
}) {
  const [internalId, setInternalId] = useState<number | null>(properties[0]?.id ?? null);
  const [receiptViewer, setReceiptViewer] = useState<PropertyDocument[] | null>(null);
  const [receiptIndex, setReceiptIndex] = useState(0);

  const selectedId = selectedPropertyId != null ? selectedPropertyId : internalId;
  const setSelectedId = (id: number) => {
    if (onSelectedPropertyIdChange) onSelectedPropertyIdChange(id);
    else setInternalId(id);
  };

  useEffect(() => {
    if (selectedPropertyId != null) return;
    if (!internalId && properties[0]) setInternalId(properties[0].id);
    if (internalId && properties.length && !properties.some((p) => p.id === internalId)) {
      setInternalId(properties[0]?.id ?? null);
    }
  }, [properties, internalId, selectedPropertyId]);

  const selected = useMemo(
    () => properties.find((p) => p.id === selectedId) || properties[0] || null,
    [properties, selectedId]
  );

  const history = useMemo(
    () => (selected ? buildHistory(selected, jobs, properties.length) : []),
    [selected, jobs, properties.length]
  );
  const years = useMemo(() => groupByYear(history), [history]);

  const openReceipts = (docs: PropertyDocument[], start = 0) => {
    if (!docs.length) return;
    setReceiptViewer(docs);
    setReceiptIndex(Math.min(start, docs.length - 1));
  };

  const currentReceipt = receiptViewer?.[receiptIndex] || null;

  return (
    <section className={embedded ? "space-y-4" : "mx-auto max-w-5xl space-y-5"}>
      {!embedded ? (
        <div>
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
            Maintenance Timeline
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Home history by property — services, costs, and receipts in one place.
          </p>
        </div>
      ) : (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Property Timeline
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            FixBridge jobs, previous repairs, inspections, and documents in one chronology.
          </p>
        </div>
      )}

      {properties.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-border bg-card px-6 py-12 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 text-sm font-medium">Add a home to start your timeline</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Completed jobs and uploaded receipts will appear here per property.
          </p>
        </div>
      ) : (
        <div className={hidePropertyPicker ? "" : "grid gap-5 lg:grid-cols-[200px_1fr]"}>
          {!hidePropertyPicker ? (
            <div className="space-y-2">
              {properties.map((p, idx) => {
                const active = selected?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`w-full rounded-2xl border px-3.5 py-3 text-left transition ${
                      active ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/30"
                    }`}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Home {idx + 1}
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-snug line-clamp-2">
                      {p.label || p.addressLine1}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm sm:p-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Home History
            </p>
            {selected && (
              <p className="mt-1 text-sm text-muted-foreground">
                {[selected.addressLine1, selected.city, selected.state].filter(Boolean).join(", ")}
              </p>
            )}

            {years.length === 0 ? (
              <p className="mt-8 text-sm text-muted-foreground">
                No history yet. Completed FixBridge jobs and passport receipts will show up here.
              </p>
            ) : (
              <div className="mt-6 space-y-8">
                {years.map(([year, items]) => (
                  <div key={year}>
                    <p className="[font-family:'Barlow_Condensed',sans-serif] text-2xl font-black text-foreground">
                      {year}
                    </p>
                    <div className="relative mt-3 ml-1 border-l-2 border-border pl-5">
                      {items.map((entry, i) => {
                        const isLast = i === items.length - 1;
                        return (
                          <div key={entry.id} className={`relative ${isLast ? "pb-0" : "pb-6"}`}>
                            <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-primary bg-card" />
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              {monthDay(entry.date)}
                            </p>
                            <p className="mt-1 text-base font-semibold">{entry.title}</p>
                            {(entry.contractor || entry.amount != null) && (
                              <p className="mt-0.5 text-sm text-muted-foreground">
                                {[entry.contractor, entry.amount != null ? formatMoney(entry.amount) : null]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            )}
                            <div className="mt-2 flex flex-wrap gap-2">
                              {entry.receipts.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => openReceipts(entry.receipts)}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold hover:border-primary/40"
                                >
                                  <Receipt className="h-3.5 w-3.5 text-primary" />
                                  View receipt{entry.receipts.length > 1 ? `s (${entry.receipts.length})` : ""}
                                </button>
                              )}
                              {entry.jobId && onOpenJob && (
                                <button
                                  type="button"
                                  onClick={() => onOpenJob(entry.jobId!)}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                                >
                                  View request
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selected && (selected.documents || []).some((d) =>
              ["receipt", "invoice"].includes(String(d.category))
            ) && (
              <div className="mt-8 border-t border-border pt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  All receipts on file
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(selected.documents || [])
                    .filter((d) => ["receipt", "invoice"].includes(String(d.category)))
                    .map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() =>
                          openReceipts(
                            (selected.documents || []).filter((x) =>
                              ["receipt", "invoice"].includes(String(x.category))
                            ),
                            (selected.documents || [])
                              .filter((x) => ["receipt", "invoice"].includes(String(x.category)))
                              .findIndex((x) => x.id === d.id)
                          )
                        }
                        className="inline-flex max-w-full items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2 text-left text-xs font-medium hover:border-primary/35"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="truncate">{d.title || d.fileName || "Receipt"}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {receiptViewer && currentReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close"
            onClick={() => setReceiptViewer(null)}
          />
          <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[1.5rem] border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {currentReceipt.title || currentReceipt.fileName || "Receipt"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {receiptIndex + 1} of {receiptViewer.length}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptViewer(null)}
                className="rounded-lg p-2 hover:bg-muted"
                aria-label="Close viewer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-muted/20 p-4">
              {currentReceipt.mimeType?.startsWith("image/") ||
              currentReceipt.dataUrl?.startsWith("data:image/") ? (
                <img
                  src={currentReceipt.dataUrl}
                  alt={currentReceipt.title || "Receipt"}
                  className="mx-auto max-h-[70vh] w-auto max-w-full rounded-xl border border-border object-contain"
                />
              ) : (
                <iframe
                  title={currentReceipt.title || "Document"}
                  src={currentReceipt.dataUrl}
                  className="h-[70vh] w-full rounded-xl border border-border bg-white"
                />
              )}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                disabled={receiptIndex <= 0}
                onClick={() => setReceiptIndex((i) => Math.max(0, i - 1))}
                className="rounded-xl border border-border px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                Previous
              </button>
              <a
                href={currentReceipt.dataUrl}
                download={currentReceipt.fileName || "receipt"}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-primary hover:underline"
              >
                Open / download
              </a>
              <button
                type="button"
                disabled={receiptIndex >= receiptViewer.length - 1}
                onClick={() => setReceiptIndex((i) => Math.min(receiptViewer.length - 1, i + 1))}
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
