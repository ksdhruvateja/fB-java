import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
  FileText,
  Send,
  Wallet,
} from "lucide-react";
import { formatMoney, type ManagedJob } from "./managedJobs";
import {
  computeAttention,
  greetingForNow,
  todayStats,
  type AttentionKind,
} from "./adminOpsHelpers";

const ATTENTION_CARDS: {
  kind: AttentionKind;
  label: string;
  icon: React.ElementType;
  dot: string;
  border: string;
}[] = [
  { kind: "emergency", label: "Emergency requests", icon: AlertTriangle, dot: "bg-red-500", border: "hover:border-red-400/50" },
  { kind: "quotes_waiting", label: "Contractor quotes waiting", icon: Clock, dot: "bg-orange-500", border: "hover:border-orange-400/50" },
  { kind: "quotes_ready", label: "Quotes ready to send", icon: FileText, dot: "bg-amber-400", border: "hover:border-amber-400/50" },
  { kind: "accepted", label: "Homeowners accepted", icon: CheckCircle2, dot: "bg-emerald-500", border: "hover:border-emerald-400/50" },
  { kind: "payments", label: "Payments / completion", icon: Wallet, dot: "bg-sky-500", border: "hover:border-sky-400/50" },
  { kind: "payouts", label: "Contractor payouts ready", icon: Banknote, dot: "bg-violet-500", border: "hover:border-violet-400/50" },
];

export default function AdminAttentionOverview({
  jobs,
  reportPayments,
  onOpenAttention,
  onOpenWorkQueue,
}: {
  jobs: ManagedJob[];
  reportPayments?: number;
  onOpenAttention: (kind: AttentionKind) => void;
  onOpenWorkQueue: () => void;
}) {
  const attention = computeAttention(jobs);
  const today = todayStats(jobs);
  const totalNeeds = ATTENTION_CARDS.reduce((n, c) => n + attention[c.kind].length, 0);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{greetingForNow()}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {totalNeeds > 0 ? `${totalNeeds} things need you` : "You're caught up"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Click any card to jump straight into the work queue.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenWorkQueue}
          className="inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:brightness-110"
        >
          <Send className="h-4 w-4" /> Open work queue
        </button>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Needs your attention
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ATTENTION_CARDS.map((card) => {
            const count = attention[card.kind].length;
            const Icon = card.icon;
            return (
              <button
                key={card.kind}
                type="button"
                onClick={() => onOpenAttention(card.kind)}
                className={`group flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${card.border}`}
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${card.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-2xl font-semibold tabular-nums tracking-tight">{count}</p>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                </div>
                <Icon className="h-5 w-5 text-muted-foreground opacity-60 transition group-hover:opacity-100" />
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Today</p>
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Requests", value: String(today.requests) },
            { label: "Quotes", value: String(today.quotes) },
            { label: "Accepted", value: String(today.accepted) },
            { label: "Active jobs", value: String(today.active) },
            { label: "Completed", value: String(today.completed) },
            {
              label: "Payments",
              value: formatMoney(reportPayments ?? today.paymentsSum),
            },
          ].map((row) => (
            <div key={row.label} className="rounded-xl bg-muted/40 px-3 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{row.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{row.value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
