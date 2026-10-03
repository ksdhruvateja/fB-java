import "./homeownerConcept.css";
import PropertyCoverPicker from "./PropertyCoverPicker";
import { useMemo } from "react";
import {
  ArrowRight,
  CalendarDays,
  Home,
  Plus,
  Wind,
  Droplets,
  Zap,
  Refrigerator,
  Bug,
  ShieldCheck,
} from "lucide-react";
import type { ManagedJob, Property } from "./managedJobs";
import { formatMoney } from "./managedJobs";
import {
  formatPropertyLine,
  healthHeadline,
  healthScore,
  jobStats,
  mergeHealthWithJobs,
  normalizeHealthProfile,
  statusLabel,
  type PropertyHealthProfile,
  type PropertySystem,
} from "./homeownerPropertyHealth";
import { buildHomeUpdatesSnapshot } from "./homeUpdates";
import ActiveServiceCards, { activeJobsForHome } from "./ActiveServiceCards";
import { defaultServiceOfferings, frequencyLabel, visibleOfferings } from "./serviceOfferings";



function fmtMaintDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const SYSTEM_ICONS: Record<PropertySystem, React.ElementType> = {
  HVAC: Wind,
  Plumbing: Droplets,
  Electrical: Zap,
  Roof: Home,
  Appliances: Refrigerator,
  Pest: Bug,
  Safety: ShieldCheck,
};

export default function HomeownerOverview({
  property,
  health,
  jobs,
  onRequestService,
  onOpenJob,
  onOpenHealth,
  onOpenProperty,
  onOpenPropertyPicker,
  onOpenQuotes,
  onOpenHomeUpdates,
  onOpenServices,
  quotesWaiting = 0,
  hasHomeCarePro = false, onOpenFixera, onOpenPlans,
}: {
  userName: string;
  property?: Property | null;
  health: PropertyHealthProfile;
  jobs: ManagedJob[];
  onRequestService: () => void;
  onOpenJob: (jobId: number) => void;
  onOpenHealth: () => void;
  onOpenProperty: () => void;
  onOpenPropertyPicker?: () => void;
  onOpenQuotes?: () => void;
  onOpenHomeUpdates?: () => void;
  onOpenServices?: (offeringId?: string) => void;
  quotesWaiting?: number;
  hasHomeCarePro?: boolean; onOpenFixera?: () => void; onOpenPlans?: () => void;
}) {
  const propertyJobs = useMemo(
    () =>
      property?.id != null
        ? jobs.filter((j) => Number(j.propertyId) === property.id)
        : jobs,
    [jobs, property?.id]
  );

  const recordedSystems = new Set((property?.healthProfile?.systems || []).filter(system => Boolean(system.updatedAt) || system.updatedBy === "homeowner" || system.updatedBy === "contractor").map((system) => system.system));
  const merged = mergeHealthWithJobs(health, propertyJobs, property?.id);
  const hasCompleteHealthProfile = merged.systems.every((system) => recordedSystems.has(system.system));
  const score = healthScore(merged);
  const stats = jobStats(propertyJobs);
  const activeJobs = activeJobsForHome(propertyJobs);
  const popular = visibleOfferings(defaultServiceOfferings()).filter((item) => ["Plumbing", "Electrical", "HVAC & Heating/Cooling"].includes(item.name)).sort((a,b) => ["Plumbing", "Electrical", "HVAC & Heating/Cooling"].indexOf(a.name) - ["Plumbing", "Electrical", "HVAC & Heating/Cooling"].indexOf(b.name));
  const recurring = visibleOfferings(defaultServiceOfferings()).filter((item) => item.subscriptionEligible).slice(0, 4);
  const sortedSystems = [...merged.systems].sort((a, b) => {
    const rank = { critical: 0, attention: 1, due_soon: 2, good: 3 } as const;
    return rank[a.status] - rank[b.status];
  });

  const upcomingMaint = [...(merged.maintenance || [])].sort((a,b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 2);
  const homeUpdates = useMemo(
    () =>
      buildHomeUpdatesSnapshot({
        property,
        health,
        jobs: propertyJobs,
        prefs: health.homeUpdateState || null,
      }),
    [property, health, propertyJobs]
  );

  const homeTiles = sortedSystems.slice(0, 4);

  return (
    <section className="homeowner-overview mx-auto max-w-6xl space-y-8">
      <div className="homeowner-concept-topbar">
        <button type="button" onClick={onOpenPropertyPicker || onOpenProperty}><Home size={16}/><span>{formatPropertyLine(property)}</span></button>
        <div>{onOpenServices && <button type="button" onClick={() => onOpenServices()}>Search services</button>}<button type="button" className="homeowner-orange-action" onClick={onRequestService}><Plus size={16}/>Request service</button></div>
      </div>
      <header className="homeowner-concept-heading"><h1>Your home, in good hands.</h1><p>Keep track of care, repairs, and what comes next.</p></header>
      <div className="homeowner-care-workspace">
        <PropertyCoverPicker key={`property-cover-${property?.id || "none"}`} propertyId={property?.id} label={property?.label || "Your home workspace"} address={formatPropertyLine(property)} onOpenProperty={onOpenProperty} />
        <section className="homeowner-up-next"><div className="homeowner-section-title"><h2>Up next</h2><CalendarDays size={21}/></div>
          {upcomingMaint.length ? <ul>{upcomingMaint.map(m=><li key={`${m.label}-${m.dueDate}`}><span className="homeowner-reminder-icon"><CalendarDays size={20}/></span><div><strong>{m.label}</strong><span>Due {fmtMaintDate(m.dueDate)}</span><button type="button" onClick={onOpenHealth}>View reminder <ArrowRight size={13}/></button></div></li>)}</ul> : <div className="homeowner-up-next-empty"><p>No maintenance reminders saved.</p><button type="button" onClick={onOpenHealth}>Add home details <ArrowRight size={16}/></button></div>}
          {onOpenHomeUpdates && <button type="button" className="homeowner-reminders-all" onClick={onOpenHomeUpdates}>View home updates <ArrowRight size={16}/></button>}
        </section>
        <div className="homeowner-service-activity homeowner-concept-progress"><ActiveServiceCards jobs={activeJobs} onOpenJob={onOpenJob} onRequestService={onRequestService} /></div>
      </div>
      <div className="homeowner-concept-service-row">
        <section className="homeowner-concept-services"><div className="homeowner-section-title"><h2>What can we help with?</h2>{onOpenServices && <button type="button" onClick={()=>onOpenServices()}>All services <ArrowRight size={15}/></button>}</div>
          <div className="homeowner-photo-service-grid">{popular.slice(0,3).map((item,index)=><button key={item.id} type="button" onClick={()=>onOpenServices?.(item.id)} className="homeowner-photo-service"><img src={index===0?"/service-plumbing.jpg":index===1?"/service-electrical.jpg":"/service-hvac.jpg"} alt="" loading="lazy"/><span><strong>{index===2?"Heating & cooling":item.name}</strong><ArrowRight size={18}/></span></button>)}</div>
        </section>
        <section className="homeowner-concept-ai"><ShieldCheck size={22}/><h2>Help with your next home question.</h2><p>Describe an issue and add photos. Fixera uses your saved property details to help assess the next step.</p><button type="button" onClick={hasHomeCarePro ? (onOpenFixera || onRequestService) : (onOpenPlans || onRequestService)}>{hasHomeCarePro?"Open Fixera":"Explore HomeCare plans"} <ArrowRight size={17}/></button></section>
      </div>
      {propertyJobs.filter(job=>job.status==="customer_review_pending").map(job=><button key={job.id} type="button" className="homeowner-home-summary" onClick={()=>onOpenJob(job.id)}><strong>{job.title || "Service request"}</strong><span>Review completion</span><ArrowRight size={18}/></button>)}
      <div className="homeowner-concept-details">
        <section><div className="homeowner-section-title"><h2>Your home systems</h2><button type="button" onClick={onOpenHealth}>All systems</button></div><div className="homeowner-system-list">{homeTiles.map(system=>{const Icon=SYSTEM_ICONS[system.system]||Home;return <button key={system.system} type="button" onClick={onOpenHealth}><Icon size={20}/><span><strong>{system.system}</strong><small>{recordedSystems.has(system.system)||system.status!=="good"?statusLabel(system.status):"Not assessed"}</small></span></button>;})}</div><button type="button" className="homeowner-health-note" onClick={onOpenHealth}><strong>{hasCompleteHealthProfile?`${score}/100 · ${healthHeadline(score)}`:"Build your home's profile"}</strong><p>{hasCompleteHealthProfile?"Based on saved details; not an inspection.":"Add system details to see an informed health summary."}</p></button></section>
        <section><div className="homeowner-section-title"><h2>Recurring care</h2></div><div className="homeowner-system-list">{recurring.map(item=><button key={item.id} type="button" onClick={()=>onOpenServices?.(item.id)}><CalendarDays size={20}/><span><strong>{item.name}</strong><small>{item.recommendedFrequency?frequencyLabel(item.recommendedFrequency):"Recurring"}</small></span></button>)}</div></section>
      </div>
      {onOpenHomeUpdates && <button type="button" onClick={onOpenHomeUpdates} className="homeowner-home-summary"><strong>Property Passport</strong><span>{hasCompleteHealthProfile?`${homeUpdates.summary.trackedSystems} home systems tracked`:"Build a clearer picture of your home."}</span><ArrowRight size={18}/></button>}
      {quotesWaiting>0&&onOpenQuotes&&<button type="button" onClick={onOpenQuotes} className="homeowner-home-summary"><strong>{quotesWaiting} quotes waiting for approval</strong><span>Review quotes</span><ArrowRight size={18}/></button>}

      <div className="homeowner-overview-stats hidden grid-cols-2 gap-8 border-t border-border py-6 lg:grid lg:grid-cols-4">
        {[
          { label: "Open Requests", value: String(stats.open) },
          { label: "In Progress", value: String(stats.inProgress) },
          { label: "Completed", value: String(stats.completed) },
          { label: "Home Spend", value: formatMoney(stats.spend) || "$0" },
        ].map((item) => (
          <div key={item.label} className="py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{item.label}</p>
            <p className="mt-2 [font-family:'Barlow_Condensed',sans-serif] text-3xl font-black leading-none">
              {item.value}
            </p>
          </div>
        ))}
      </div>


      <div className="homeowner-overview-details border-t border-border pt-6">
        <button
          type="button"
          onClick={onOpenProperty}
          className="py-2 text-left transition hover:text-primary"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Property</p>
            <Home className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-4 text-base font-semibold">{formatPropertyLine(property)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {[
              merged.beds != null ? `${merged.beds} Bed` : null,
              merged.baths != null ? `${merged.baths} Bath` : null,
              merged.sqft != null ? `${merged.sqft.toLocaleString()} sq ft` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Add details in Property Health"}
          </p>
        </button>
      </div>
    </section>
  );
}

export function emptyHealth(): PropertyHealthProfile {
  return normalizeHealthProfile(null);
}
