/** Shared constants and small UI pieces for AdminPanel (moved out of the main file). */
import type { Tab } from "./AdminPanel";
import type React from "react";
import { Shield, DollarSign, Users, Briefcase, Settings2, Link2, Sparkles, LayoutDashboard, Search, ListTodo, ScrollText, Mail, Gift, MessageSquare, AlertTriangle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { STATUS_LABELS } from "./managedJobs";
import { notifyError } from "./feedback";

export const NAV_GROUPS: { section?: string; label?: string; items: { id: Tab; label: string; icon: React.ElementType }[] }[] = [
  { items: [{ id: "overview", label: "Overview", icon: LayoutDashboard }] },
  { section: "PEOPLE", label: "Users", items: [{ id: "subscriptions", label: "Homeowners", icon: Users }, { id: "contractors", label: "Contractors", icon: Briefcase }] },
  { section: "PEOPLE", label: "Relationships", items: [{ id: "partners", label: "Partners", icon: Link2 }, { id: "referrals", label: "Referrals", icon: Gift }] },
  { section: "WORK", label: "Operations", items: [{ id: "work-queue", label: "Work Queue", icon: ListTodo }, { id: "dispatch", label: "Dispatch", icon: Briefcase }, { id: "disputes", label: "Disputes", icon: AlertTriangle }] },
  { section: "FINANCE", label: "Finance", items: [{ id: "finance", label: "Finance", icon: DollarSign }] },
  { section: "SUPPORT", label: "Communication", items: [{ id: "communications", label: "Messages", icon: MessageSquare }, { id: "support-tickets", label: "Tickets", icon: Mail }] },
  { section: "ADMINISTRATION", label: "Plans & Services", items: [{ id: "pro-plans", label: "HomeCare Plans", icon: Sparkles }, { id: "homecare-pro", label: "HomeCare Pro", icon: Shield }] },
  { section: "ADMINISTRATION", label: "Access Management", items: [{ id: "access", label: "Team & Roles", icon: Shield }] },
  { section: "ADMINISTRATION", label: "Compliance & Records", items: [{ id: "audit-logs", label: "Audit Logs", icon: ScrollText }, { id: "legal-system", label: "Legal / System", icon: ScrollText }] },
  { section: "ADMINISTRATION", label: "System Management", items: [{ id: "fixera", label: "Fixera", icon: Sparkles }, { id: "platform", label: "Settings", icon: Settings2 }] },
];

export const TRADE_LABELS: Record<string, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  hvac: "HVAC",
  painting: "Painting",
  roofing: "Roofing",
  flooring: "Flooring",
  carpentry: "Carpentry",
  snow_removal: "Snow Removal",
  landscaping: "Landscaping",
  cleaning: "Cleaning",
  others: "Others",
};

export const fieldClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
export const cardClass =
  "rounded-2xl border border-border/70 bg-card shadow-sm transition duration-200 hover:border-primary/35 hover:shadow-md";
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";
export const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium transition hover:bg-muted active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export function normalizeCodeInput(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

export function generateReferralCode() {
  const roll = Math.random();
  if (roll < 0.34) return `FIXBRIDGE${10 + Math.floor(Math.random() * 40)}`;
  if (roll < 0.67) return `WELCOME${10 + Math.floor(Math.random() * 40)}`;
  return `SPRING${new Date().getFullYear()}`;
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] || status;
  const tone = /cancel|refund|disput|suspend/i.test(status)
    ? "bg-red-500/10 text-red-700"
    : /paid|complete|closed|approved|succeed/i.test(status)
      ? "bg-teal-500/10 text-teal-800"
      : /await|pending|invit|bid|proposal|review/i.test(status)
        ? "bg-amber-500/10 text-amber-800"
        : "bg-slate-500/10 text-slate-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className={`${cardClass} flex flex-col items-center justify-center gap-1 px-6 py-12 text-center`}>
      <p className="font-medium">{title}</p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block min-w-[200px] flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        className={`${fieldClass} pl-9`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export function TabFade({ tabKey, children }: { tabKey: string; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={tabKey}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function NumField({
  label,
  value,
  onChange,
  suffix,
  step = "1",
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  step?: string;
  hint?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <div className="relative">
        <input
          type="number"
          step={step}
          className={`${fieldClass} pr-10 tabular-nums`}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const viewDocument = (name: string, dataUrl: string | undefined) => {
  if (!dataUrl) {
    notifyError("No document file was uploaded by this contractor yet.");
    return;
  }
  const newWindow = window.open();
  if (newWindow) {
    newWindow.document.title = name;
    if (dataUrl.startsWith("data:application/pdf")) {
      newWindow.document.body.style.margin = "0";
      newWindow.document.body.innerHTML = `<iframe width="100%" height="100%" src="${dataUrl}" style="border:none;"></iframe>`;
    } else {
      newWindow.document.body.style.margin = "0";
      newWindow.document.body.style.background = "#0f172a";
      newWindow.document.body.style.display = "flex";
      newWindow.document.body.style.justifyContent = "center";
      newWindow.document.body.style.alignItems = "center";
      newWindow.document.body.innerHTML = `<img alt="" src="${dataUrl}" style="max-width:100%; max-height:100%; object-fit:contain; box-shadow:0 8px 30px rgba(0,0,0,0.5);" />`;
    }
  }
};
