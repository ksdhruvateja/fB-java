import { useMemo, useState } from "react";
import { ChevronRight, CreditCard, DollarSign, ShieldCheck } from "lucide-react";
import { formatMoney, type ManagedJob, type Property } from "./managedJobs";

type PaymentFilter = "all" | "pending" | "holds" | "paid";
type PaymentState = "pending" | "authorized" | "captured" | "paid" | "refunded";

type PaymentItem = {
  id: string;
  jobId: number;
  title: string;
  propertyLabel: string;
  amount: number;
  kind: "dispatch" | "service";
  state: PaymentState;
  date?: string;
  subtitle: string;
};

const FILTERS: { id: PaymentFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "holds", label: "Holds" },
  { id: "paid", label: "Paid" },
];

function propertyLabel(prop: Property | undefined): string {
  return prop?.label?.trim() || prop?.addressLine1?.trim() || "Property";
}

function dispatchFee(job: ManagedJob): number {
  const fee = job.visitFeeAmount ?? job.pricing?.contractor_visit_fee;
  return Number.isFinite(Number(fee)) ? Number(fee) : 125;
}

function jobAmount(job: ManagedJob): number | null {
  const report = job.completionReport as Record<string, unknown> | null | undefined;
  const fromReport = report?.amount ?? report?.total ?? report?.retailAmount;
  if (fromReport != null && Number.isFinite(Number(fromReport))) return Number(fromReport);
  if (job.customerRetailEstimateHigh != null) return Number(job.customerRetailEstimateHigh);
  if (job.customerRetailEstimateLow != null) return Number(job.customerRetailEstimateLow);
  return null;
}

function buildPaymentItems(jobs: ManagedJob[], properties: Property[]): PaymentItem[] {
  const items: PaymentItem[] = [];

  for (const job of jobs) {
    const prop = properties.find((p) => p.id === job.propertyId);
    const pl = propertyLabel(prop);
    const title = job.title?.trim() || job.category?.trim() || `Request #${job.bookingId || job.id}`;
    const date = job.updatedAt || job.createdAt;

    if (["awaiting_service_payment", "ai_review_complete"].includes(String(job.status))) {
      items.push({
        id: `dispatch-pending-${job.id}`,
        jobId: job.id,
        title,
        propertyLabel: pl,
        amount: dispatchFee(job),
        kind: "dispatch",
        state: "pending",
        date,
        subtitle: "Dispatch hold not authorized yet",
      });
      continue;
    }

    if (job.visitFeeAuthorized && !job.visitFeeCaptured) {
      items.push({
        id: `dispatch-hold-${job.id}`,
        jobId: job.id,
        title,
        propertyLabel: pl,
        amount: dispatchFee(job),
        kind: "dispatch",
        state: "authorized",
        date,
        subtitle: "Card hold authorized — charged at check-in",
      });
    } else if (job.visitFeeCaptured || job.status === "paid_for_dispatch") {
      items.push({
        id: `dispatch-captured-${job.id}`,
        jobId: job.id,
        title,
        propertyLabel: pl,
        amount: dispatchFee(job),
        kind: "dispatch",
        state: "captured",
        date,
        subtitle: "Visit fee captured",
      });
    }

    const serviceAmount = jobAmount(job);
    const paidServiceStatuses = new Set([
      "approved",
      "scheduled",
      "contractor_en_route",
      "work_started",
      "change_order_pending",
      "work_completed",
      "customer_review_pending",
      "admin_review_pending",
      "payout_pending",
      "paid_out",
      "closed",
    ]);

    if (paidServiceStatuses.has(String(job.status)) && serviceAmount != null) {
      const paid = ["work_completed", "customer_review_pending", "admin_review_pending", "payout_pending", "paid_out", "closed"].includes(
        String(job.status)
      );
      items.push({
        id: `service-${job.id}`,
        jobId: job.id,
        title,
        propertyLabel: pl,
        amount: serviceAmount,
        kind: "service",
        state: paid ? "paid" : "pending",
        date,
        subtitle: paid ? "Service payment recorded" : "Quote approved — payment due",
      });
    }

    if (job.status === "refunded") {
      items.push({
        id: `refund-${job.id}`,
        jobId: job.id,
        title,
        propertyLabel: pl,
        amount: dispatchFee(job),
        kind: "dispatch",
        state: "refunded",
        date,
        subtitle: "Refund processed",
      });
    }
  }

  return items.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

function stateBadge(state: PaymentState): { label: string; className: string } {
  switch (state) {
    case "pending":
      return { label: "Pending", className: "bg-amber-500/15 text-amber-800 dark:text-amber-300" };
    case "authorized":
      return { label: "Hold", className: "bg-sky-500/15 text-sky-800 dark:text-sky-300" };
    case "captured":
      return { label: "Captured", className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300" };
    case "paid":
      return { label: "Paid", className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300" };
    case "refunded":
      return { label: "Refunded", className: "bg-muted text-muted-foreground" };
  }
}

function matchesFilter(item: PaymentItem, filter: PaymentFilter): boolean {
  if (filter === "all") return true;
  if (filter === "pending") return item.state === "pending";
  if (filter === "holds") return item.state === "authorized" || (item.kind === "dispatch" && item.state === "captured");
  if (filter === "paid") return item.state === "paid" || item.state === "captured";
  return true;
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function HomeownerPaymentsPanel({
  jobs,
  properties,
  onOpenJob,
}: {
  jobs: ManagedJob[];
  properties: Property[];
  onOpenJob?: (jobId: number) => void;
}) {
  const [filter, setFilter] = useState<PaymentFilter>("all");
  const items = useMemo(() => buildPaymentItems(jobs, properties), [jobs, properties]);
  const filtered = useMemo(() => items.filter((item) => matchesFilter(item, filter)), [items, filter]);

  const totalPaid = useMemo(
    () => items.filter((i) => i.state === "paid" || i.state === "captured").reduce((sum, i) => sum + i.amount, 0),
    [items]
  );

  const pendingCount = useMemo(() => items.filter((i) => i.state === "pending").length, [items]);

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
          Payments
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dispatch holds, service charges, and spend across your homes.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total recorded</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(totalPaid)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Needs action</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{pendingCount}</p>
        </div>
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
          <CreditCard className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 text-sm font-medium">No payments in this view</p>
          <p className="mt-1 text-xs text-muted-foreground">
            When you authorize dispatch or pay for service, transactions will show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((item) => {
            const badge = stateBadge(item.state);
            const Icon = item.kind === "dispatch" ? ShieldCheck : DollarSign;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpenJob?.(item.jobId)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/30 active:scale-[0.99]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-semibold truncate">{item.title}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(item.amount)}</span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{item.propertyLabel}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}>
                        {badge.label}
                      </span>
                      {item.date ? (
                        <span className="text-[10px] text-muted-foreground">{formatDate(item.date)}</span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{item.subtitle}</span>
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
