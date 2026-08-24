import { useMemo, useState } from "react";
import { ChevronRight, FileText, HardHat, Receipt, Shield } from "lucide-react";
import type { ElementType } from "react";
import type { ManagedJob, Property, PropertyDocument } from "./managedJobs";

type DocFilter = "all" | "invoice" | "warranty" | "receipt" | "report" | "other";

type DocRow = {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  propertyLabel: string;
  date?: string;
  dataUrl?: string;
  jobId?: number;
  source: "upload" | "completion";
};

const FILTERS: { id: DocFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "invoice", label: "Invoices" },
  { id: "warranty", label: "Warranties" },
  { id: "receipt", label: "Receipts" },
  { id: "report", label: "Reports" },
  { id: "other", label: "Other" },
];

const CATEGORY_LABELS: Record<string, string> = {
  receipt: "Receipt",
  warranty: "Warranty",
  manual: "Manual",
  invoice: "Invoice",
  inspection: "Inspection",
  contractor: "Contractor record",
  photo_before: "Before photo",
  photo_after: "After photo",
  other: "Other",
  report: "Completion report",
};

function propertyLabel(prop: Property | undefined): string {
  return prop?.label?.trim() || prop?.addressLine1?.trim() || "Property";
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category.replace(/_/g, " ");
}

function iconForCategory(category: string): ElementType {
  switch (category) {
    case "invoice":
      return Receipt;
    case "warranty":
      return Shield;
    case "report":
      return HardHat;
    case "receipt":
      return Receipt;
    default:
      return FileText;
  }
}

function filterBucket(category: string, source: DocRow["source"]): DocFilter {
  if (source === "completion" || category === "report" || category === "inspection") return "report";
  if (category === "invoice") return "invoice";
  if (category === "warranty") return "warranty";
  if (category === "receipt") return "receipt";
  if (["invoice", "warranty", "receipt", "report"].includes(category)) return category as DocFilter;
  return "other";
}

function collectDocuments(jobs: ManagedJob[], properties: Property[]): DocRow[] {
  const rows: DocRow[] = [];

  for (const prop of properties) {
    for (const doc of prop.documents || []) {
      rows.push(docToRow(doc, prop));
    }
  }

  for (const job of jobs) {
    if (!job.completionReport) continue;
    const prop = properties.find((p) => p.id === job.propertyId);
    const title = job.title?.trim() || job.category?.trim() || `Job #${job.id}`;
    rows.push({
      id: `completion-${job.id}`,
      title: `Completion report — ${title}`,
      category: "report",
      categoryLabel: categoryLabel("report"),
      propertyLabel: propertyLabel(prop),
      date: job.updatedAt || job.createdAt,
      jobId: job.id,
      source: "completion",
    });
  }

  return rows.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

function docToRow(doc: PropertyDocument, prop: Property): DocRow {
  const category = String(doc.category || "other");
  return {
    id: `doc-${prop.id}-${doc.id}`,
    title: doc.title?.trim() || doc.fileName?.trim() || categoryLabel(category),
    category,
    categoryLabel: categoryLabel(category),
    propertyLabel: propertyLabel(prop),
    date: doc.createdAt,
    dataUrl: doc.dataUrl,
    source: "upload",
  };
}

export default function HomeownerDocumentsPanel({
  jobs,
  properties,
  onOpenJob,
}: {
  jobs: ManagedJob[];
  properties: Property[];
  onOpenJob?: (jobId: number) => void;
}) {
  const [filter, setFilter] = useState<DocFilter>("all");
  const rows = useMemo(() => collectDocuments(jobs, properties), [jobs, properties]);
  const filtered = useMemo(
    () => rows.filter((row) => filter === "all" || filterBucket(row.category, row.source) === filter),
    [rows, filter]
  );

  const openRow = (row: DocRow) => {
    if (row.source === "completion" && row.jobId != null) {
      onOpenJob?.(row.jobId);
      return;
    }
    if (row.dataUrl) {
      window.open(row.dataUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
          Documents
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invoices, warranties, receipts, and completion reports for your properties.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setFilter(chip.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              filter === chip.id
                ? "bg-primary text-white"
                : "border border-border bg-card text-muted-foreground hover:border-primary/30"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-border bg-card px-6 py-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 text-sm font-medium">No documents yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload files in Property Health or complete a job to collect reports here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((row) => {
            const Icon = iconForCategory(row.category);
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => openRow(row)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/30 active:scale-[0.99]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold truncate block">{row.title}</span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{row.propertyLabel}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {row.categoryLabel}
                      </span>
                      {row.date ? (
                        <span className="text-[10px] text-muted-foreground">{formatDate(row.date)}</span>
                      ) : null}
                      {row.source === "completion" ? (
                        <span className="text-[10px] font-medium text-primary">View job</span>
                      ) : null}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
