import { ServiceThumb } from "./serviceVisuals";
import { useEffect, useState } from "react";
import type { ManagedJob } from "./managedJobs";
import { loadHomeServices } from "./homeServicesApi";
import type { ServiceOffering } from "./serviceOfferings";
export function completionOffering(job:ManagedJob, offerings:ServiceOffering[]) {
  if (job.sourceRecurringServiceId || !["closed","paid_out"].includes(job.status)) return null;
  const category=String(job.category || "").toLowerCase();
  return offerings.find(item=>item.active && item.homeownerVisible && item.subscriptionEligible && item.frequencies.length && (item.category.toLowerCase()===category || item.id===category)) || null;
}
export default function CompletionRecurringOffer({ job, onChoose }: { job:ManagedJob; onChoose:(offeringId:string)=>void }) {
  const [offerings,setOfferings]=useState<ServiceOffering[]>([]);
  const [dismissed,setDismissed]=useState(false);
  useEffect(()=>{setDismissed(false); if(job.sourceRecurringServiceId || !["closed","paid_out"].includes(job.status))return;let cancelled=false;void loadHomeServices().then(data=>{if(!cancelled&&data.ok)setOfferings(data.offerings || []);}).catch(()=>{});return()=>{cancelled=true;};},[job.id,job.status]);
  const offering=completionOffering(job,offerings);
  if(!offering || dismissed)return null;
  return <aside aria-label="Recurring care after completion" className="rounded-2xl border border-border bg-card p-4"><ServiceThumb name={offering.name} serviceId={offering.id} category={offering.category} className="mb-3 h-16 w-20" /><h3 className="font-semibold">Keep your {offering.name.toLowerCase()} on a schedule?</h3><p className="mt-2 text-sm text-muted-foreground">Your one-time service is complete. Explore a recurring service schedule, or continue with one-time visits. HomeCare Pro and service visit pricing are separate.</p><div className="mt-3 flex flex-wrap gap-3"><button type="button" onClick={()=>onChoose(offering.id)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">Explore subscription</button><button type="button" onClick={()=>setDismissed(true)} className="min-h-11 px-2 text-sm text-muted-foreground">Not now</button></div></aside>;
}
