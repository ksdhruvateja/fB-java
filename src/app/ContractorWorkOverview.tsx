import { ArrowRight, CalendarDays, FileText, MapPin, Wrench } from "lucide-react";
import type { ManagedJob } from "./managedJobs";
import { formatMoney } from "./managedJobs";
import ContractorExpiryBanner from "./ContractorExpiryBanner";
import type { CredentialExpiryItem } from "./contractorExpiry";

type Invite = { id: number; status: string; category?: string; title?: string; cityStateZip?: string; preferredTimeSlot?: string; expectedNetLow?: number; expectedNetHigh?: number; aiAssessment?: { urgency?: string } };
const CURRENT_STATUSES = ["scheduled", "contractor_en_route", "work_started", "approved", "proposal_accepted"];
function repairPhoto(job: ManagedJob) {
  return [job.mediaDataUrl, ...(job.mediaDataUrls || [])].find(value => typeof value === "string" && /^data:image\/(jpeg|png|webp);base64,/i.test(value));
}
function dateLabel(value?: string | null) {
  if (!value) return "Date not confirmed";
  // A requested calendar day is local, not a UTC midnight timestamp.
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? "Date not confirmed" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
export default function ContractorWorkOverview({ companyName, invites, jobs, monthEarnings, expiryAlerts = [], onOpenInvites, onOpenJobs, onOpenCompliance, onOpenPayoutAccount, payoutAccountReady, onViewInvite }: {
  companyName: string; invites: Invite[]; jobs: ManagedJob[]; monthEarnings: number; expiryAlerts?: CredentialExpiryItem[];
  onOpenInvites: () => void; onOpenJobs: () => void; onOpenCompliance: () => void; onOpenPayoutAccount: () => void; payoutAccountReady?: boolean; onViewInvite: (id: number) => void;
}) {
  const newInvites = invites.filter(invite => String(invite.status).toLowerCase() === "invited");
  const current = jobs.filter(job => CURRENT_STATUSES.includes(job.status));
  const active = jobs.filter(job => [...CURRENT_STATUSES, "awaiting_bid", "bid_received", "proposal_sent"].includes(job.status));
  const quoteCount = jobs.filter(job => ["awaiting_bid", "bid_received", "proposal_sent"].includes(job.status)).length;
  const spotlight = newInvites[0];
  return <section className="contractor-work-overview">
    <header className="contractor-work-heading">
      <div><p className="contractor-eyebrow">{companyName} · Contractor workspace</p><h1>A clear plan for your day</h1><p>Keep work moving, from the first invitation to the final follow-up.</p></div>
      <button type="button" className="contractor-primary-action" onClick={onOpenJobs}>View job board <ArrowRight size={17} /></button>
    </header>
    <ContractorExpiryBanner items={expiryAlerts} onUpdate={onOpenCompliance} />
    <div className="contractor-summary-strip">
      {[{ label: "New invitations", value: String(newInvites.length), action: onOpenInvites }, { label: "Active jobs", value: String(active.length), action: onOpenJobs }, { label: "This month earnings", value: formatMoney(monthEarnings), action: onOpenPayoutAccount }].map(metric => <button key={metric.label} type="button" onClick={metric.action}><span>{metric.label}</span><strong>{metric.value}</strong></button>)}
    </div>
    <div className="contractor-work-grid">
      <section className="contractor-work-panel contractor-schedule-panel">
        <div className="contractor-panel-heading"><div><p className="contractor-eyebrow">Your work</p><h2>Scheduled &amp; in progress</h2></div><CalendarDays size={22}/></div>
        {current.length ? <ul className="contractor-job-timeline">{current.slice(0, 6).map(job => { const photo = repairPhoto(job); return <li key={job.id}><div className="contractor-job-date"><strong>{dateLabel(job.preferredDate)}</strong><span>{job.preferredTimeSlot || "Time not confirmed"}</span></div><div className="contractor-job-summary">{photo ? <img src={photo} alt="Repair photo attached to this job" onError={event => { event.currentTarget.hidden = true; }} /> : <span className="contractor-job-symbol" aria-hidden="true"><Wrench size={22}/></span>}<div><button type="button" onClick={onOpenJobs}>{job.title || job.category || "Service request"}</button><p><MapPin size={13}/>{job.cityStateZip || job.fullAddress || "Address not available"}</p><span className="contractor-job-status">{job.status.replaceAll("_", " ")}</span></div></div></li>; })}</ul> : <div className="contractor-empty"><CalendarDays size={30}/><h3>Your next job starts here</h3><p>No scheduled or accepted jobs yet. Review invitations to find your next opportunity.</p><button type="button" onClick={onOpenInvites}>Review invitations <ArrowRight size={15}/></button></div>}
        {current.length > 6 && <button type="button" className="contractor-text-action" onClick={onOpenJobs}>View all {current.length} current jobs <ArrowRight size={15}/></button>}
      </section>
      <section className="contractor-work-panel contractor-context-panel">
        <p className="contractor-eyebrow">What’s next</p><h2>New opportunities</h2>
        {spotlight ? <div className="contractor-opportunity"><span className="contractor-job-status">{spotlight.category || "Service request"}</span><h3>{spotlight.title || "New job invitation"}</h3><p><MapPin size={15}/>{spotlight.cityStateZip || "Service area not available"}</p>{spotlight.preferredTimeSlot && <p>Requested window: {spotlight.preferredTimeSlot}</p>}{(spotlight.expectedNetLow != null || spotlight.expectedNetHigh != null) && <p>Estimated net: {formatMoney(Number(spotlight.expectedNetLow || 0))}{spotlight.expectedNetHigh != null ? ` – ${formatMoney(Number(spotlight.expectedNetHigh))}` : ""}</p>}<button type="button" className="contractor-primary-action" onClick={() => onViewInvite(spotlight.id)}>View Job <ArrowRight size={16}/></button></div> : <div className="contractor-empty"><p>You’re caught up. New invitations will appear here.</p></div>}
        <div className="contractor-schedule-context"><h3>Before you head out</h3><p>Review the saved address and requested time in each job. Confirm appointment details with the homeowner before travelling.</p><button type="button" className="contractor-text-action" onClick={onOpenJobs}>Open current jobs <ArrowRight size={15}/></button></div>
      </section>
    </div>
    <section className="contractor-followup-band"><div><FileText size={22}/><div><h2>Keep the paperwork moving</h2><p>{quoteCount ? `${quoteCount} job${quoteCount === 1 ? "" : "s"} in the quote workflow.` : "Quotes, documents and payout details stay connected to your work."}</p></div></div><div className="contractor-followup-actions"><button type="button" onClick={onOpenJobs}>Review quotes <ArrowRight size={15}/></button><button type="button" onClick={onOpenCompliance}>Compliance &amp; documents <ArrowRight size={15}/></button><button type="button" onClick={onOpenPayoutAccount}>{payoutAccountReady ? "Payout account" : "Set up payouts"}<ArrowRight size={15}/></button></div></section>
  </section>;
}
