import "./propertyCoverPresentation.css";
import { ServiceThumb } from "./serviceVisuals";
import { useState } from "react";
import { ArrowRight, ChevronDown, MessageSquare } from "lucide-react";
import type { ManagedJob } from "./managedJobs";
import { STATUS_LABELS } from "./managedJobs";
// Stages come only from recorded lifecycle states, never dates or inferred appointments.
export function homeServiceStage(status: string): number | null {
  if (["awaiting_service_payment", "paid_for_dispatch", "awaiting_contractor", "contractor_invited", "awaiting_bid"].includes(status)) return 0;
  if (["contractor_accepted", "bid_received", "proposal_sent", "awaiting_customer_approval"].includes(status)) return 1;
  if (["approved", "diagnosing", "scheduled", "contractor_en_route", "work_started", "change_order_pending"].includes(status)) return 2;
  if (["work_completed", "customer_review_pending", "admin_review_pending", "payout_pending", "paid_out", "closed"].includes(status)) return 3;
  return null;
}
export function activeJobsForHome(jobs: ManagedJob[]) {
  const terminal = new Set(["work_completed", "customer_review_pending", "admin_review_pending", "payout_pending", "paid_out", "closed", "canceled", "refunded", "disputed"]);
  return jobs.filter(job => !terminal.has(job.status));
}
function provider(job: ManagedJob) {
  return job.technician?.company || job.technician?.name || job.contractorName || (job.assignedContractorUserId ? "Assigned professional" : null);
}
function requestedWindow(job: ManagedJob) {
  let date = job.preferredDate;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const parsed = new Date(`${date}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) date = parsed.toLocaleDateString(undefined, {month:"short", day:"numeric"});
  }
  return [date, job.preferredTimeSlot].filter(Boolean).join(" · ");
}
function Progress({job}:{job:ManagedJob}) {
  const stage = homeServiceStage(job.status);
  if (stage == null) return <p className="homeowner-service-status">{job.homeownerStatusLabel || STATUS_LABELS[job.status] || job.status}</p>;
  return <ol className="homeowner-service-rail" aria-label="Service progress">{["Requested", "Matched", "Scheduled", "Completed"].map((label,index)=><li key={label} className={index<stage?"is-complete":index===stage?"is-current":"is-future"} aria-current={index===stage?"step":undefined}><span aria-hidden="true"/><span>{label}</span></li>)}</ol>;
}
export default function ActiveServiceCards({jobs,onOpenJob,onRequestService}:{jobs:ManagedJob[];onOpenJob:(id:number)=>void;onRequestService:()=>void}) {
  const [open,setOpen] = useState(false);
  const first = jobs[0];
  if (!first) return <section className="homeowner-active-service homeowner-active-empty"><div><p className="homeowner-service-eyebrow">Active service</p><h2>No active services</h2><p>Your service requests will appear here.</p></div><button type="button" onClick={onRequestService}>Request service <ArrowRight size={16}/></button></section>;
  const name = provider(first), window = requestedWindow(first);
  return <section className="homeowner-active-service">
    <div className="homeowner-active-summary"><div className="homeowner-active-description"><p className="homeowner-service-eyebrow">Active service <span>{first.homeownerStatusLabel || STATUS_LABELS[first.status] || first.status}</span></p><ServiceThumb name={first.category || first.title} className="my-2 h-16 w-20" /><h2>{first.title || first.category || "Service request"}</h2><p>{name || "Professional not assigned yet"}{window && <><span aria-hidden="true"> · </span>Requested: {window}</>}</p></div><button type="button" className="homeowner-service-expand" aria-expanded={open} aria-controls="homeowner-active-details" onClick={()=>setOpen(v=>!v)}>{open?"Hide requests":`View ${jobs.length===1?"request":`all ${jobs.length} requests`}`} <ChevronDown size={16} className={open?"rotate-180":""}/></button></div>
    <Progress job={first}/>
    {open&&<div id="homeowner-active-details" className="homeowner-active-details">{jobs.map(job=><article key={job.id}><div><h3>{job.title || job.category || "Service request"}</h3><p>{job.homeownerStatusLabel || STATUS_LABELS[job.status] || job.status}{provider(job)&&` · ${provider(job)}`}</p>{requestedWindow(job)&&<p>Requested: {requestedWindow(job)}</p>}</div><div className="homeowner-active-controls"><button type="button" onClick={()=>onOpenJob(job.id)}>Track Service <ArrowRight size={15}/></button><button type="button" onClick={()=>onOpenJob(job.id)}><MessageSquare size={15}/>Messages</button></div></article>)}</div>}
  </section>;
}
