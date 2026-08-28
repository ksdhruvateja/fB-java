import { useMemo, useState } from "react";
import { BadgeCheck, Ban, Briefcase, FileText, Shield, Star, Wallet } from "lucide-react";
import type { AuthUser } from "./auth";
import { ContractorApplicationAdminView } from "./ContractorAdminDetail";
import { applicationFromUser } from "./contractorApplication";
import { formatMoney, STATUS_LABELS, type ManagedJob } from "./managedJobs";
import { relativeTime } from "./adminOpsHelpers";

type ProfileTab =
  | "profile"
  | "trades"
  | "verification"
  | "stripe"
  | "jobs"
  | "performance"
  | "financials"
  | "documents"
  | "internal";

const TABS: { id: ProfileTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "trades", label: "Trades" },
  { id: "verification", label: "Verification" },
  { id: "stripe", label: "Stripe" },
  { id: "jobs", label: "Jobs" },
  { id: "performance", label: "Performance" },
  { id: "financials", label: "Financials" },
  { id: "documents", label: "Documents" },
  { id: "internal", label: "Internal" },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | number | null | boolean }) {
  if (value === undefined || value === null || value === "") return null;
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  return (
    <div className="grid grid-cols-[minmax(7rem,11rem)_1fr] gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-words font-medium">{display}</span>
    </div>
  );
}

export default function Contractor360Profile({
  contractor,
  jobs,
  onOpenJob,
  onApprove,
  onSuspend,
  onViewDocument,
  busy,
}: {
  contractor: AuthUser;
  jobs: ManagedJob[];
  onOpenJob: (jobId: number) => void;
  onApprove: () => void;
  onSuspend: () => void;
  onViewDocument: (name: string, data?: string) => void;
  busy?: boolean;
}) {
  const [tab, setTab] = useState<ProfileTab>("profile");
  const app = applicationFromUser(contractor);
  const contractorId = Number(contractor.id);

  const contractorJobs = useMemo(
    () => jobs.filter((j) => Number(j.assignedContractorUserId) === contractorId),
    [jobs, contractorId],
  );

  const stats = useMemo(() => {
    const completed = contractorJobs.filter((j) =>
      ["work_completed", "customer_review_pending", "admin_review_pending", "payout_pending", "paid_out", "closed"].includes(
        j.status,
      ),
    );
    const active = contractorJobs.filter((j) =>
      ["approved", "scheduled", "contractor_en_route", "diagnosing", "work_started", "change_order_pending"].includes(
        j.status,
      ),
    );
    const lifetime = completed.reduce(
      (s, j) => s + (Number(j.estimatedContractorNetHigh) || Number(j.estimatedContractorNetLow) || 0),
      0,
    );
    const pendingPayout = contractorJobs.filter((j) => j.status === "payout_pending").length;
    return {
      total: contractorJobs.length,
      completed: completed.length,
      active: active.length,
      lifetime,
      pendingPayout,
      acceptanceHint: contractor.complianceStatus === "approved" ? "Eligible" : "Restricted",
    };
  }, [contractorJobs, contractor.complianceStatus]);

  const stripeId = (contractor as AuthUser & { stripeAccountId?: string }).stripeAccountId;
  const onboarding = (contractor as AuthUser & { stripeOnboardingStatus?: string }).stripeOnboardingStatus;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border/70 bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FF4D1C]/12 text-sm font-bold text-[#FF4D1C]">
            {(contractor.name || "?").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-semibold">{contractor.name}</p>
            <p className="text-sm text-muted-foreground">
              ID #{contractor.id}
              {app.legalBusinessName || contractor.companyName
                ? ` · ${app.legalBusinessName || contractor.companyName}`
                : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {contractor.email}
              {contractor.phone ? ` · ${contractor.phone}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {contractor.complianceStatus !== "approved" && (
            <button
              type="button"
              disabled={busy}
              onClick={onApprove}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#FF4D1C] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <BadgeCheck className="h-4 w-4" /> Approve
            </button>
          )}
          {contractor.complianceStatus !== "suspended" && (
            <button
              type="button"
              disabled={busy}
              onClick={onSuspend}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              <Ban className="h-4 w-4" /> Suspend
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Jobs" value={String(stats.total)} />
        <Stat label="Active" value={String(stats.active)} />
        <Stat label="Completed" value={String(stats.completed)} />
        <Stat label="Est. earnings" value={formatMoney(stats.lifetime)} />
        <Stat label="Payouts pending" value={String(stats.pendingPayout)} />
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-t-lg px-3 py-2 text-sm font-medium transition ${
              tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border/70 bg-card p-4">
        {tab === "profile" && (
          <div className="space-y-2">
            <Row label="Legal business" value={app.legalBusinessName || contractor.companyName} />
            <Row label="DBA" value={app.dbaTradeName} />
            <Row label="Contact" value={app.contactName || contractor.name} />
            <Row label="Phone" value={app.contactPhone || contractor.phone} />
            <Row label="Email" value={app.contactEmail || contractor.contactEmail || contractor.email} />
            <Row
              label="Address"
              value={
                [app.businessAddress, app.businessCity, app.businessState, app.businessZip].filter(Boolean).join(", ") ||
                contractor.address
              }
            />
            <Row
              label="Service ZIPs"
              value={app.serviceZips || (Array.isArray(contractor.serviceZips) ? contractor.serviceZips.join(", ") : "")}
            />
            <Row label="Status" value={contractor.complianceStatus || "pending"} />
            <Row label="Created" value={contractor.createdAt ? relativeTime(String(contractor.createdAt)) : null} />
          </div>
        )}

        {tab === "trades" && (
          <div className="space-y-2">
            <Row label="Primary trade" value={contractor.trade} />
            <Row label="All trades" value={(app.primaryServices || []).join(", ") || contractor.trade} />
            <Row label="Emergency avail." value={app.emergencyAvailability} />
            <Row label="Radius (mi)" value={app.maxServiceRadius || contractor.travelRadiusMiles} />
            <Row label="Available days" value={app.availableDays} />
            <Row label="Services note" value={app.servicesDescription} />
          </div>
        )}

        {tab === "verification" && (
          <div className="space-y-2">
            <Row label="Verification" value={contractor.complianceStatus} />
            <Row label="License #" value={app.licenseNumber || contractor.licenseNumber} />
            <Row label="License exp." value={app.licenseExpiration || contractor.licenseExpiresAt} />
            <Row label="Insurance exp." value={app.insuranceExpiration || contractor.insuranceExpiresAt} />
            <Row label="EIN / Tax ID" value={app.ein} />
            <Row label="GL insurance" value={app.generalLiability} />
            <Row label="Workers' comp" value={app.workersComp} />
            <Row label="Background checks" value={app.backgroundChecks} />
            <Row label="Insurance exp." value={contractor.insuranceExpiresAt} />
            <p className="pt-2 text-xs text-muted-foreground">
              Full document packet is under Documents. Sensitive banking data stays with Stripe.
            </p>
          </div>
        )}

        {tab === "stripe" && (
          <div className="space-y-2">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Wallet className="h-4 w-4 text-[#FF4D1C]" /> Stripe Connect
            </div>
            <Row label="Account ID" value={stripeId || "Not connected"} />
            <Row label="Onboarding" value={onboarding || (stripeId ? "submitted" : "not_started")} />
            <Row label="Connected" value={Boolean(stripeId)} />
            <p className="rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Bank account numbers are never stored in FixBridge. Use Stripe Dashboard for account requirements,
              charges/payouts enabled, and instant payout eligibility.
            </p>
          </div>
        )}

        {tab === "jobs" && (
          <div className="space-y-2">
            {contractorJobs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No assigned jobs yet.</p>
            ) : (
              contractorJobs.slice(0, 25).map((j) => (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => onOpenJob(j.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2.5 text-left text-sm hover:bg-muted/40"
                >
                  <span>
                    <span className="font-mono text-xs text-[#FF4D1C]">{j.bookingId || `FB-${j.id}`}</span>
                    <span className="mt-0.5 block font-medium">{j.title || j.category}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{STATUS_LABELS[j.status] || j.status}</span>
                </button>
              ))
            )}
          </div>
        )}

        {tab === "performance" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="font-semibold">
                {contractor.rating != null && Number(contractor.rating) > 0
                  ? Number(contractor.rating).toFixed(1)
                  : "—"}
              </span>
              <span className="text-muted-foreground">rating (platform)</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Assigned" value={String(stats.total)} />
              <Stat label="Completed" value={String(stats.completed)} />
              <Stat
                label="Completion rate"
                value={stats.total ? `${Math.round((stats.completed / stats.total) * 100)}%` : "—"}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Acceptance rate, response time, and dispute metrics will deepen as job events accumulate.
            </p>
          </div>
        )}

        {tab === "financials" && (
          <div className="space-y-2">
            <Row label="Lifetime est. earnings" value={formatMoney(stats.lifetime)} />
            <Row label="Pending payout jobs" value={stats.pendingPayout} />
            <Row label="Dispatch eligible" value={stats.acceptanceHint} />
            <p className="pt-2 text-xs text-muted-foreground">
              Open Finance → Payouts for approved / processing / paid ledger entries for this contractor.
            </p>
          </div>
        )}

        {tab === "documents" && <ContractorApplicationAdminView user={contractor} onViewDocument={onViewDocument} />}

        {tab === "internal" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Shield className="h-4 w-4" /> Internal admin
            </div>
            <Row label="Risk level" value="Standard" />
            <Row label="Account manager" value="Unassigned" />
            <Row label="Flags" value="None" />
            <p className="text-xs text-muted-foreground">
              Team notes, risk flags, and audit trail for this contractor will appear here as staff collaborate.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                <Briefcase className="h-3 w-3" /> {stats.active} active jobs
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                <FileText className="h-3 w-3" /> {contractor.complianceStatus || "pending"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
