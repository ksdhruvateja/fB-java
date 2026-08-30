import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  MapPin,
  Star,
} from "lucide-react";
import type { ManagedJob } from "./managedJobs";
import { formatMoney } from "./managedJobs";
import ContractorExpiryBanner from "./ContractorExpiryBanner";
import { type CredentialExpiryItem } from "./contractorExpiry";

type Invite = {
  id: number;
  status: string;
  category?: string;
  title?: string;
  cityStateZip?: string;
  preferredTimeSlot?: string;
  expectedNetLow?: number;
  expectedNetHigh?: number;
  aiAssessment?: { urgency?: string };
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function todayJobs(jobs: ManagedJob[]) {
  const today = new Date().toDateString();
  return jobs
    .filter((j) => ["scheduled", "contractor_en_route", "work_started", "approved", "proposal_accepted"].includes(j.status))
    .slice(0, 6)
    .map((j, i) => {
      const times = ["8:30 AM", "11:00 AM", "2:30 PM", "4:00 PM"];
      return {
        time: times[i % times.length],
        title: j.title || j.category || "Service",
        place: j.cityStateZip || j.fullAddress || "Service area",
        job: j,
      };
    });
}

export default function ContractorOverviewPanel({
  companyName,
  invites,
  jobs,
  monthEarnings,
  expiryAlerts = [],
  onOpenInvites,
  onOpenJobs,
  onOpenCompliance,
  onOpenPayoutAccount,
  payoutAccountReady,
  onViewInvite,
}: {
  companyName: string;
  invites: Invite[];
  jobs: ManagedJob[];
  monthEarnings: number;
  expiryAlerts?: CredentialExpiryItem[];
  onOpenInvites: () => void;
  onOpenJobs: () => void;
  onOpenCompliance: () => void;
  onOpenPayoutAccount: () => void;
  payoutAccountReady?: boolean;
  onViewInvite: (id: number) => void;
}) {
  const newInvites = invites.filter((i) => String(i.status).toLowerCase() === "invited");
  const activeJobs = jobs.filter((j) =>
    ["scheduled", "contractor_en_route", "work_started", "approved", "awaiting_bid", "bid_received", "proposal_sent"].includes(
      j.status
    )
  );
  const agenda = todayJobs(jobs);
  const spotlight = newInvites[0];

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight sm:text-4xl">
            {greeting()}, {companyName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Your business is ready for work.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> ACTIVE
        </span>
      </div>

      <ContractorExpiryBanner items={expiryAlerts} onUpdate={onOpenCompliance} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "New invites", value: String(newInvites.length), onClick: onOpenInvites },
          { label: "Active jobs", value: String(activeJobs.length), onClick: onOpenJobs },
          { label: "This month earnings", value: formatMoney(monthEarnings), onClick: onOpenJobs },
          {
            label: "Compliance",
            value: payoutAccountReady ? "Ready" : "Review",
            onClick: onOpenCompliance,
          },
        ].map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={card.onClick}
            className="rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/40"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{card.label}</p>
            <p className="mt-2 flex items-center gap-1.5 [font-family:'Barlow_Condensed',sans-serif] text-3xl font-black">
              {card.value}
            </p>
          </button>
        ))}
      </div>

      <div className="rounded-[1.5rem] border border-border bg-card p-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Needs your attention</h2>
        <ul className="mt-3 space-y-2.5">
          {!payoutAccountReady && (
            <li className="flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Set up your bank account to receive job payouts
              </span>
              <button type="button" onClick={onOpenPayoutAccount} className="text-xs font-semibold text-primary hover:underline">
                Set up →
              </button>
            </li>
          )}
          {newInvites.length > 0 && (
            <li className="flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                {newInvites.length} job invitation{newInvites.length === 1 ? "" : "s"} need a response
              </span>
              <button type="button" onClick={onOpenInvites} className="text-xs font-semibold text-primary hover:underline">
                Review →
              </button>
            </li>
          )}
          <li className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> W-9 verified
          </li>
          <li className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Contractor license verified
          </li>
        </ul>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-[1.5rem] border border-border bg-card p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Today</h2>
          {agenda.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No jobs on today’s board yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {agenda.map((row) => (
                <li key={row.job.id} className="flex gap-4 text-sm">
                  <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{row.time}</span>
                  <div className="min-w-0">
                    <p className="font-semibold">{row.title}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {row.place}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[1.5rem] border border-border bg-card p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">New opportunities</h2>
          {!spotlight ? (
            <p className="mt-4 text-sm text-muted-foreground">You’re caught up — new invites will appear here.</p>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{spotlight.category || "Service"}</p>
              <p className="text-lg font-semibold">{spotlight.title || "New job invitation"}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {spotlight.cityStateZip || "Service area"}
              </p>
              <p className="text-xs text-muted-foreground">
                {spotlight.aiAssessment?.urgency ? `${spotlight.aiAssessment.urgency} priority` : "Standard priority"}
                {spotlight.preferredTimeSlot ? ` · Window ${spotlight.preferredTimeSlot}` : ""}
              </p>
              {(spotlight.expectedNetLow != null || spotlight.expectedNetHigh != null) && (
                <p className="text-sm font-medium">
                  Est. net {formatMoney(Number(spotlight.expectedNetLow || 0))}
                  {spotlight.expectedNetHigh != null ? ` – ${formatMoney(Number(spotlight.expectedNetHigh))}` : ""}
                </p>
              )}
              <button
                type="button"
                onClick={() => onViewInvite(spotlight.id)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
              >
                View Job <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
