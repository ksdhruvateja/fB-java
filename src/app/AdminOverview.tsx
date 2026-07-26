import {
  Briefcase,
  Users,
  Wallet,
  Truck,
  LayoutDashboard,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "./managedJobs";

export type DashboardReport = {
  revenueCollected: number;
  revenueLive?: number;
  revenueSimulated?: number;
  contractorPaidOut: number;
  contractorPaidOutLive?: number;
  contractorPaidOutSimulated?: number;
  grossEstimate: number;
  stripeConfigured?: boolean;
  paymentsMode?: "live" | "simulated" | string;
  jobsByStatus: Record<string, number>;
  kpis?: {
    totalJobs: number;
    activeJobs: number;
    awaitingDispatch: number;
    availableContractors: number;
    avgRetailEstimate: number;
    partnersCount: number;
    jobsThisMonth: number;
  };
  trendByMonth?: Array<{ label: string; open: number; completed: number; total: number }>;
  byCategory?: Array<{ category: string; count: number }>;
  byUrgency?: Array<{ name: string; value: number }>;
  byHour?: Array<{ hour: number; label: string; count: number }>;
  byDayThisMonth?: Array<{ label: string; count: number }>;
  diySplit?: { diyOk: number; proRequired: number; pendingAi: number; diyPct: number };
};

const BRAND = "#FF4D1C";
const TEAL = "#0D9488";
const AMBER = "#F59E0B";
const SLATE = "#64748B";

const URGENCY_COLORS: Record<string, string> = {
  low: TEAL,
  medium: AMBER,
  high: BRAND,
  emergency: "#B91C1C",
  unknown: SLATE,
};

const CATEGORY_LABELS: Record<string, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  hvac: "HVAC",
  painting: "Painting",
  roofing: "Roofing",
  flooring: "Flooring",
  carpentry: "Carpentry",
  others: "Others",
};

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <div className="group rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#FF4D1C]/35 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        </div>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl transition group-hover:scale-105"
          style={{ backgroundColor: `${accent}18`, color: accent }}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#FF4D1C]/30 hover:shadow-md ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function AdminOverview({
  report,
  onOpenDispatch,
}: {
  report: DashboardReport;
  onOpenDispatch?: () => void;
}) {
  const kpis = report.kpis || {
    totalJobs: 0,
    activeJobs: 0,
    awaitingDispatch: 0,
    availableContractors: 0,
    avgRetailEstimate: 0,
    partnersCount: 0,
    jobsThisMonth: 0,
  };

  const trend = report.trendByMonth || [];
  const categories = report.byCategory || [];
  const urgency = (report.byUrgency || []).map((u) => ({
    ...u,
    label: u.name.charAt(0).toUpperCase() + u.name.slice(1),
  }));
  const byHour = (report.byHour || []).filter((h) => h.hour >= 6 && h.hour <= 22);
  const byDay = report.byDayThisMonth || [];
  const diy = report.diySplit || { diyOk: 0, proRequired: 0, pendingAi: 0, diyPct: 0 };
  const diyPie = [
    { name: "DIY-eligible", value: diy.diyOk, color: TEAL },
    { name: "Pro required", value: diy.proRequired, color: BRAND },
    { name: "Pending AI", value: diy.pendingAi, color: SLATE },
  ].filter((d) => d.value > 0);
  const peakDay = byDay.reduce(
    (best, cur) => (cur.count > (best?.count || 0) ? cur : best),
    byDay[0] || { label: "—", count: 0 }
  );

  const assessedTotal = diy.diyOk + diy.proRequired;
  const completionShare =
    trend.reduce((s, m) => s + m.completed, 0) + trend.reduce((s, m) => s + m.open, 0);
  const completedSharePct =
    completionShare > 0
      ? Math.round((trend.reduce((s, m) => s + m.completed, 0) / completionShare) * 100)
      : 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <LayoutDashboard className="h-3.5 w-3.5" /> Overview
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Operations dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live snapshot of jobs, staffing, estimates, and revenue across the managed network.
          </p>
        </div>
        {onOpenDispatch && (
          <button
            type="button"
            onClick={onOpenDispatch}
            className="rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:brightness-105"
          >
            Open dispatch queue
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total jobs" value={String(kpis.totalJobs)} icon={Briefcase} accent={BRAND} />
        <KpiCard
          label="Available contractors"
          value={String(kpis.availableContractors)}
          icon={Users}
          accent={TEAL}
        />
        <KpiCard
          label="Avg. retail estimate"
          value={formatMoney(kpis.avgRetailEstimate)}
          icon={Wallet}
          accent={AMBER}
        />
        <KpiCard
          label="Awaiting dispatch"
          value={String(kpis.awaitingDispatch)}
          icon={Truck}
          accent={SLATE}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.6fr_0.9fr]">
        <Panel
          title="Open vs completed jobs"
          action={<span className="text-xs text-muted-foreground">Last 6 months</span>}
        >
          <div className="grid gap-4 lg:grid-cols-[1fr_140px] lg:items-center">
            <div className="h-64 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} barGap={6} barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #E2E8F0",
                      boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
                    }}
                  />
                  <Bar dataKey="open" name="Open / in progress" fill={TEAL} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="completed" name="Completed pipeline" fill={BRAND} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mx-auto flex h-36 w-36 flex-col items-center justify-center">
              <div className="relative h-32 w-32">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Completed share", value: completedSharePct || 1 },
                        { name: "Rest", value: Math.max(0, 100 - (completedSharePct || 1)) },
                      ]}
                      dataKey="value"
                      innerRadius={38}
                      outerRadius={52}
                      startAngle={90}
                      endAngle={-270}
                      strokeWidth={0}
                    >
                      <Cell fill={BRAND} />
                      <Cell fill="#F1F5F9" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-semibold tabular-nums">{completedSharePct}%</span>
                  <span className="text-[10px] text-muted-foreground">completed</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TEAL }} /> Open / in progress
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: BRAND }} /> Completed pipeline
            </span>
          </div>
        </Panel>

        <Panel title="Assessment mix">
          <div className="flex h-64 flex-col items-center justify-center">
            {diyPie.length === 0 ? (
              <p className="text-sm text-muted-foreground">No AI assessments yet.</p>
            ) : (
              <>
                <div className="relative h-44 w-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={diyPie} dataKey="value" innerRadius={52} outerRadius={72} paddingAngle={3} strokeWidth={0}>
                        {diyPie.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-semibold tabular-nums">{diy.diyPct}%</span>
                    <span className="text-[10px] text-muted-foreground">DIY-eligible</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs">
                  {diyPie.map((d) => (
                    <span key={d.name} className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                      {d.name} ({d.value})
                    </span>
                  ))}
                </div>
                {assessedTotal > 0 && (
                  <p className="mt-2 text-center text-xs text-muted-foreground">{assessedTotal} assessed jobs</p>
                )}
              </>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Jobs created by hour" action={<span className="text-xs text-muted-foreground">Last 30 days</span>}>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byHour}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#64748B" }}
                  interval={3}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis allowDecimals={false} width={28} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="Jobs"
                  stroke={TEAL}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: TEAL, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: BRAND }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Jobs by trade">
          <div className="space-y-3">
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs yet.</p>
            ) : (
              categories.map((c) => {
                const max = categories[0]?.count || 1;
                const pct = Math.round((c.count / max) * 100);
                return (
                  <div key={c.category}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span>{CATEGORY_LABELS[c.category] || c.category}</span>
                      <span className="tabular-nums text-muted-foreground">{c.count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-[#0D9488]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {urgency.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Urgency mix</p>
              <div className="flex flex-wrap gap-2">
                {urgency.map((u) => (
                  <span
                    key={u.name}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
                    style={{ backgroundColor: `${URGENCY_COLORS[u.name] || SLATE}18`, color: URGENCY_COLORS[u.name] || SLATE }}
                  >
                    {u.label}: {u.value}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <div className="overflow-hidden rounded-2xl bg-[#FF4D1C] p-5 text-white shadow-sm">
          <p className="text-sm text-white/80">This month</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
            {kpis.jobsThisMonth.toLocaleString()} jobs
          </p>
          <p className="mt-1 text-sm text-white/80">
            Gross platform estimate {formatMoney(report.grossEstimate)} · Revenue{" "}
            {formatMoney(report.revenueCollected)}
            {report.paymentsMode === "simulated" || (report.revenueSimulated || 0) > 0
              ? ` · ${formatMoney(report.revenueSimulated || 0)} simulated`
              : ""}
          </p>
          <div className="mt-6 h-28">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={byDay}>
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "none" }}
                  labelStyle={{ color: "#0f172a" }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Jobs"
                  stroke="#fff"
                  fill="rgba(255,255,255,0.28)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {peakDay && peakDay.count > 0 && (
            <p className="mt-2 text-xs text-white/85">
              Peak day {peakDay.label}: <span className="font-semibold">{peakDay.count}</span> jobs
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Revenue collected</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(report.revenueCollected)}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Contractor paid out</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(report.contractorPaidOut)}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Active jobs</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{kpis.activeJobs}</p>
        </div>
      </div>
    </section>
  );
}
