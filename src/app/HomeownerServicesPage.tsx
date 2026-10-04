import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Loader2, RefreshCw, Search, Sparkles, UserRound, Wrench } from "lucide-react";
import { getStoredToken } from "./auth";
import { loadHomeServices } from "./homeServicesApi";
import type { Property } from "./managedJobs";
import { formatMoney } from "./managedJobs";
import { useProFeatureOptional } from "./ProFeatureProvider";
import {
  activationFeeFor,
  defaultActivationFee,
  frequencyLabel,
  mergeOfferings,
  type ActivationFeeSettings,
  type ServiceOffering,
} from "./serviceOfferings";
import ServiceThumb from "./HomeownerServiceArtwork";
import HomeownerServiceIcon from "./HomeownerServiceIcon";
import "./homeownerServices.css";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "popular", label: "Popular" },
  { id: "subscription", label: "Subscription Eligible" },
  { id: "maintenance", label: "Maintenance" },
  { id: "indoor", label: "Indoor" },
  { id: "outdoor", label: "Outdoor" },
] as const;

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Flexible"];
const TIMES = ["Morning", "Afternoon", "Evening", "Flexible"];
const COMMITMENTS = [
  { id: "month_to_month", label: "Month-to-Month" },
  { id: "3_months", label: "3 Months" },
  { id: "6_months", label: "6 Months" },
  { id: "12_months", label: "12 Months" },
];

export default function HomeownerServicesPage({
  property,
  initialOfferingId,
  onRequestService,
  onOpenHomeCare,
}: {
  property?: Property | null;
  initialOfferingId?: string | null;
  onRequestService: (prefill?: { service: string; description?: string; intent?: "request" | "hire" | "diy" }) => void;
  onOpenHomeCare: () => void;
}) {
  const pro = useProFeatureOptional();
  const [offerings, setOfferings] = useState<ServiceOffering[]>([]);
  const [fee, setFee] = useState<ActivationFeeSettings>(defaultActivationFee());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialOfferingId || null);
  const [setup, setSetup] = useState(false);
  const [step, setStep] = useState(0);
  const [recurrence, setRecurrence] = useState("");
  const [day, setDay] = useState("Flexible");
  const [time, setTime] = useState("Flexible");
  const [commitment, setCommitment] = useState(COMMITMENTS[0].id);
  const [startDate, setStartDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const setupSubmissionRef = useRef(false);
  const setupInvocationRef = useRef("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [helpChoice, setHelpChoice] = useState("");
  const [visitMode, setVisitMode] = useState<"one_time" | "recurring" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCatalogError(false);
    void loadHomeServices()
      .then((data) => {
        if (cancelled) return;
        if (!data?.ok) throw new Error("Catalog unavailable");
        const merged = mergeOfferings(data.offerings);
        const ids = new Set((Array.isArray(data.offerings) ? data.offerings : []).map((row: { id?: string }) => String(row.id)));
        setOfferings(ids.size ? merged.filter((item) => ids.has(item.id)) : merged.filter((item) => item.active && item.homeownerVisible));
        if (data.activationFee) setFee(data.activationFee);
      })
      .catch(() => {
        if (!cancelled) {
          setCatalogError(true);
          setOfferings(mergeOfferings(null).filter((item) => item.active && item.homeownerVisible));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [catalogAttempt]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = offerings.filter((item) => {
      if (filter === "popular" && !item.popular) return false;
      if (filter === "subscription" && !item.subscriptionEligible) return false;
      if (filter === "maintenance" && item.kind !== "maintenance" && !item.subscriptionEligible) return false;
      if (filter === "indoor" && item.place === "outdoor") return false;
      if (filter === "outdoor" && item.place === "indoor") return false;
      if (!q) return true;
      return `${item.name} ${item.description} ${item.category} ${(item.helpsWith || []).join(" ")} ${(item.searchTerms || []).join(" ")}`.toLowerCase().includes(q);
    });
    // Featured categories lead discovery; retain every matching offering.
    return filter === "all"
      ? matches.sort((a, b) => Number(b.popular) - Number(a.popular) || a.name.localeCompare(b.name))
      : matches;
  }, [offerings, query, filter]);

  const selected = offerings.find((item) => item.id === selectedId) || null;
  const dueCents = selected ? activationFeeFor(selected, fee) : 0;

  function openService(item: ServiceOffering) {
    setSetup(false);
    setSelectedId(item.id);
    setHelpChoice("");
    setVisitMode(null);
    setMessage(null);
  }

  function startAction(item: ServiceOffering, intent: "request" | "hire" | "diy") {
    const detail = helpChoice || notes;
    const payload = {
      service: item.category,
      description: detail || undefined,
      intent,
    } as const;

    setMessage(null);
    onRequestService(payload);
  }

  function openSetup(item: ServiceOffering) {
    const feature = /landscap|snow/i.test(item.category) ? "recurring_landscaping" : "recurring_cleaning";
    if (pro && !pro.requestFeature(feature, "services-setup")) return;
    setSelectedId(item.id);
    setNotes(helpChoice || "");
    setStartDate("");
    setSetup(true);
    setStep(0);
    setRecurrence(item.frequencies.some(value => value === item.recommendedFrequency) ? item.recommendedFrequency : item.frequencies[0] || "");
    setupInvocationRef.current = crypto.randomUUID();
    setMessage(null);
  }

  async function submitSetup() {
    if (setupSubmissionRef.current) return;
    if (!selected || !property?.id) {
      setMessage("Add a property before setting up a recurring service.");
      return;
    }
    setupSubmissionRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const token = getStoredToken() || "";
      const res = await fetch("/api/recurring-services/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          offeringId: selected.id,
          setupInvocationId: setupInvocationRef.current,
          propertyId: property.id,
          recurrence,
          frequencyLabel: frequencyLabel(recurrence),
          preferredDay: day,
          preferredTimeWindow: time,
          commitment,
          commitmentLabel: COMMITMENTS.find((c) => c.id === commitment)?.label,
          startDate: startDate || undefined,
          notes,
          details: notes,
        }),
      });
      const data = await res.json();
      if (res.status === 403) {
        onOpenHomeCare();
        return;
      }
      if (!data.ok) {
        setMessage(data.message || "Could not submit this recurring service.");
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      setMessage(data.message || "Your recurring service request is confirmed. FixBridge will send pricing before the service begins.");
      setSetup(false);
    } catch {
      setMessage("Could not submit this recurring service.");
    } finally {
      setupSubmissionRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="homeowner-services mx-auto max-w-6xl space-y-8">
      <header className="homeowner-services-heading service-discovery-hero">
        <div className="service-discovery-copy">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Care for your home</p>
        <h1 className="text-2xl font-semibold tracking-tight">Home Services, All in One Place</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose what your home needs and FixBridge will help diagnose, guide, or connect you with the right professional.
        </p>
        <p className="service-discovery-note"><span>01 / Choose your service</span><span>02 / Tell us what you need</span><span>03 / Review your next step</span></p>
        </div>
        <div className="service-discovery-art" aria-hidden="true"><ServiceThumb name="HVAC" className="service-hero-image" /><span className="service-art-caption">A little care. A better home.</span></div>
      </header>
      {!selected ? (
        <>

          <aside className="service-homecare-rail" aria-label="HomeCare subscription">
            <div className="service-homecare-mark"><Sparkles aria-hidden="true" className="h-5 w-5" /></div>
            <div className="min-w-0"><p className="service-eyebrow">Your home, throughout the year</p><h2>HomeCare Pro subscription</h2><p>Explore ongoing home management and AI features. Service visits and recurring service pricing are separate.</p></div>
            <button type="button" onClick={onOpenHomeCare}>View Plans <ArrowRight aria-hidden="true" className="h-4 w-4" /></button>
          </aside>
          <div className="service-catalog-intro"><div><p className="service-eyebrow">Find the right help</p><h2>Explore home services</h2></div><p>Start with a one-time need, or choose recurring care where available.</p></div>
          <label className="relative block service-search">
            <span className="mb-1.5 block text-sm font-medium">What does your home need?</span>
            <Search className="pointer-events-none absolute bottom-3.5 left-3 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search services, problems, or AC not cooling..."
              aria-label="Search services"
              className="min-h-12 w-full rounded-2xl border border-border bg-card py-3 pl-10 pr-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
          </label>
          {catalogError ? <div role="status" className="service-catalog-notice">Live availability could not be loaded. You can browse the service guide; availability will be checked when you submit.<button type="button" onClick={() => setCatalogAttempt((value) => value + 1)}>Retry loading</button></div> : null}
          <div className="homeowner-service-filters flex gap-5 overflow-x-auto border-b border-border">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                aria-pressed={filter === item.id}
                className={`shrink-0 border-b-2 px-0 py-3 text-xs font-medium ${filter === item.id ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
      {!selected ? (
        loading && offerings.length === 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-3xl bg-muted" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground">
            No services match that search. Try a home problem like “leaking faucet” or “AC not cooling”.
          </div>
        ) : (
          <div className="service-catalog-groups">
            {[{ id: "regular", title: "One-time services", description: "Book help when you need it.", items: visible.filter(item => !item.subscriptionEligible) }, { id: "recurring", title: "Subscription & recurring care", description: "Choose a one-time visit or a regular service schedule. Visit pricing is separate from HomeCare Pro.", items: visible.filter(item => item.subscriptionEligible) }].filter(group => group.items.length).map(group => (
            <section key={group.id} className="service-catalog-group" aria-labelledby={`services-${group.id}`}>
              <header className="service-group-heading"><h2 id={`services-${group.id}`}>{group.title}</h2><p>{group.description}</p></header>
              <div className="homeowner-service-directory service-gallery">
            {group.items.map((item) => {
              const q = query.trim().toLowerCase();
              const match = q
                ? item.helpsWith.find((line) => line.toLowerCase().includes(q)) ||
                  item.searchTerms.find((line) => line.toLowerCase().includes(q))
                : "";
              return (
              <article key={item.id} className="homeowner-service-entry service-gallery-entry">
                <button type="button" onClick={() => openService(item)} className="service-gallery-image" aria-label={`Explore ${item.name}`}><ServiceThumb name={item.name} serviceId={item.id} category={item.category} className="service-catalog-image" />{item.popular ? <span className="service-popular-label">Popular</span> : null}</button>
                <div className="service-gallery-copy min-w-0">
                  <h3 className="text-base font-medium">{item.name}</h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                  {item.id === "landscaping_yard" && !item.subscriptionEligible ? <p className="service-catalog-scope">One-time yard requests. For scheduled care, explore Landscaping.</p> : null}
                  {match ? <p className="mt-1 text-xs font-medium text-primary">{match}</p> : null}
                  <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                    {item.oneTimeAvailable ? <li>One-Time</li> : null}
                    {item.subscriptionEligible ? <li className="text-primary">Recurring care available</li> : null}
                    {item.professionalAvailable ? <li>Professional</li> : null}
                    {item.diyAvailable && item.aiAssessmentAvailable ? <li>AI assessment with HomeCare</li> : null}

                  </ul>
                  <button type="button" onClick={() => openService(item)} className="mt-2 inline-flex min-h-11 items-center gap-3 text-xs font-medium text-foreground hover:text-primary">View Service <ArrowRight className="h-4 w-4" /></button>
                </div>
              </article>
              );
            })}
              </div>
            </section>
            ))}
          </div>
        )
      ) : null}
      {selected && !setup ? (
        <div className="space-y-4">
          <button type="button" onClick={() => setSelectedId(null)} className="text-sm font-semibold text-primary">
            Back to services
          </button>
          <div className="homeowner-service-detail border-b border-border pb-6">
            <div className="service-detail-intro grid gap-6 md:grid-cols-[240px_1fr] md:items-center">
              <ServiceThumb name={selected.name} serviceId={selected.id} category={selected.category} className="service-detail-image" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">{selected.name}</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">{selected.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{selected.description}</p>
                <ul className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                  {selected.oneTimeAvailable ? <li className="rounded-full bg-muted px-2 py-1">One-Time Service</li> : null}
                  {selected.subscriptionEligible ? <li className="rounded-full bg-primary/10 px-2 py-1 text-primary">Recurring care available</li> : null}
                  {selected.professionalAvailable ? <li className="rounded-full bg-muted px-2 py-1">Professional Available</li> : null}
                  {selected.diyAvailable ? <li className="rounded-full bg-muted px-2 py-1">DIY with HomeCare</li> : null}
                </ul>
              </div>
            </div>
          </div>
          {selected.helpsWith.length ? (
            <div>
              <h3 className="text-sm font-semibold">What we can help with</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {selected.helpsWith.map((line) => (
                  <button
                    key={line}
                    type="button"
                    onClick={() => setHelpChoice(line)}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-2xl border px-3 py-2 text-sm motion-safe:transition ${helpChoice === line ? "border-primary bg-primary/10" : "border-border bg-card"}`}
                  >
                    <HomeownerServiceIcon name={line} fallbackName={selected.name} className="h-6 w-6" />{line}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {selected.oneTimeAvailable && selected.subscriptionEligible ? (
            <div>
              <h3 className="text-sm font-semibold">How do you need this service?</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <button type="button" aria-pressed={visitMode === "one_time"} onClick={() => setVisitMode("one_time")} className={`rounded-2xl border p-4 text-left motion-safe:transition motion-safe:hover:-translate-y-0.5 ${visitMode === "one_time" ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
                  <span className="font-semibold">One-Time Service</span>
                  <span className="mt-1 block text-sm text-muted-foreground">Best for a single service visit.</span>
                </button>
                <button type="button" aria-pressed={visitMode === "recurring"} onClick={() => setVisitMode("recurring")} className={`rounded-2xl border p-4 text-left motion-safe:transition motion-safe:hover:-translate-y-0.5 ${visitMode === "recurring" ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
                  <span className="font-semibold">Subscription / Recurring Service</span>
                  <span className="mt-1 block text-sm text-muted-foreground">Set a schedule and let FixBridge manage it.</span>
                </button>
              </div>
            </div>
          ) : null}
          {(!selected.subscriptionEligible || !selected.oneTimeAvailable || visitMode) ? <div>
            <h3 className="text-sm font-semibold">Choose your next step</h3><p className="mt-1 text-sm text-muted-foreground">Add your details and property address next. Professional requests continue to scheduling and a pricing review before checkout.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {selected.oneTimeAvailable && visitMode !== "recurring" ? (
                <button type="button" onClick={() => startAction(selected, "request")} className="homeowner-service-action border-b border-border py-5 text-left transition hover:border-primary/50">
                  <Wrench className="h-5 w-5 text-primary" />
                  <span className="mt-2 block font-semibold">Request a Service</span>
                  <span className="mt-1 block text-sm text-muted-foreground">Tell us what is happening and we will start a request.</span>
                </button>
              ) : null}
              {selected.professionalAvailable && visitMode !== "recurring" ? (
                <button type="button" onClick={() => startAction(selected, "hire")} className="homeowner-service-action border-b border-border py-5 text-left transition hover:border-primary/50">
                  <UserRound className="h-5 w-5 text-primary" />
                  <span className="mt-2 block font-semibold">Hire a Professional</span>
                  <span className="mt-1 block text-sm text-muted-foreground">Skip the DIY path and request a professional directly.</span>
                </button>
              ) : null}
              {selected.diyAvailable && selected.aiAssessmentAvailable && visitMode !== "recurring" ? (
                <button type="button" onClick={() => startAction(selected, "diy")} className="homeowner-service-action border-b border-border py-5 text-left transition hover:border-primary/50">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span className="mt-2 block font-semibold">Get AI assessment</span>
                  <span className="mt-1 block text-sm text-muted-foreground">Get a Fixera AI assessment with active HomeCare. DIY guidance is only available when the assessment supports it; unsafe work stays with a professional.</span>
                </button>
              ) : null}
              {selected.subscriptionEligible && visitMode !== "one_time" ? (
                <button type="button" onClick={() => openSetup(selected)} className="homeowner-service-action border-b border-border py-5 text-left transition hover:border-primary/50">
                  <RefreshCw className="h-5 w-5 text-primary" />
                  <span className="mt-2 block font-semibold">Set Up Recurring Service</span>
                  <span className="mt-1 block text-sm text-muted-foreground">Choose a regular schedule. Review any activation fee before submitting; visit pricing follows a contractor review.</span>
                </button>
              ) : null}
            </div>
          </div> : <p role="status" className="text-sm text-muted-foreground">Choose a one-time visit or subscription above to continue.</p>}
        </div>
      ) : null}
      {selected && setup ? (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <button type="button" onClick={() => step > 0 ? setStep(step - 1) : setSetup(false)} className="text-sm font-semibold text-primary">
            Back
          </button>
          <p className="service-eyebrow">Recurring service setup · Step {step + 1} of 4</p>
          <div className="flex items-center gap-3"><ServiceThumb name={selected.name} serviceId={selected.id} category={selected.category} sizes="80px" className="h-16 w-20 shrink-0" /><h2 className="text-lg font-semibold">{selected.name}</h2></div>
          <p className="text-sm text-muted-foreground">Frequency → Schedule → Preferences → Review. FixBridge coordinates contractors; submitting does not assign a contractor or approve visit pricing.</p>
          {step === 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">How often do you need this service?</p>
              <div className="grid grid-cols-2 gap-2">
                {selected.frequencies.map((id) => (
                  <button key={id} type="button" onClick={() => setRecurrence(id)} className={`min-h-11 rounded-xl border px-3 py-2 text-sm ${recurrence === id ? "border-primary bg-primary/10" : "border-border"}`}>
                    {frequencyLabel(id)}
                  </button>
                ))}
              </div>
              <button type="button" disabled={!recurrence} onClick={() => setStep(1)} className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">
                Continue
              </button>
            </div>
          ) : null}
          {step === 1 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Preferred service day</p>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((value) => (
                  <button key={value} type="button" onClick={() => setDay(value)} className={`min-h-11 rounded-xl border px-3 py-2 text-sm ${day === value ? "border-primary bg-primary/10" : "border-border"}`}>
                    {value}
                  </button>
                ))}
              </div>
              <p className="text-sm font-medium">Preferred time</p>
              <div className="flex flex-wrap gap-2">
                {TIMES.map((value) => (
                  <button key={value} type="button" onClick={() => setTime(value)} className={`min-h-11 rounded-xl border px-3 py-2 text-sm ${time === value ? "border-primary bg-primary/10" : "border-border"}`}>
                    {value}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setStep(2)} className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">Continue</button>
            </div>
          ) : null}
          {step === 2 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">How long would you like this service?</p>
              <div className="grid grid-cols-2 gap-2">
                {COMMITMENTS.map((item) => (
                  <button key={item.id} type="button" onClick={() => setCommitment(item.id)} className={`min-h-11 rounded-xl border px-3 py-2 text-sm ${commitment === item.id ? "border-primary bg-primary/10" : "border-border"}`}>
                    {item.label}
                  </button>
                ))}
              </div>
              <label className="block text-sm">
                Preferred start
                <input type="date" min={new Date().toISOString().slice(0, 10)} value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border px-3" />
              </label>
              <textarea aria-label="Notes for FixBridge" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for FixBridge" className="min-h-20 w-full rounded-xl border border-border p-3 text-sm" />
              <button type="button" onClick={() => { if (startDate && startDate < new Date().toISOString().slice(0, 10)) { setMessage("Choose today or a future start date."); return; } setMessage(null); setStep(3); }} className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">Review</button>
            </div>
          ) : null}
          {step === 3 ? (
            <div className="space-y-3 text-sm">
              <p>Service: {selected.name}</p>
              <p>Frequency: {frequencyLabel(recurrence)}</p>
              <p>Preferred start: {startDate || "Today / next available"}</p>
              <p>Preferred day: {day}</p>
              <p>Preferred time: {time}</p>
              <p>Notes: {notes || "None"}</p>
              {["custom", "per_snow_event"].includes(recurrence) ? <p className="text-muted-foreground">FixBridge will coordinate dates for this custom or event-based schedule with you.</p> : null}
              <p>Commitment: {COMMITMENTS.find((c) => c.id === commitment)?.label}</p>
              <p>Property: {property ? [property.addressLine1, property.city].filter(Boolean).join(", ") : "Select a property on Home"}</p>
              <p className="text-muted-foreground">FixBridge will review your service requirements and work with qualified local professionals to secure the best available pricing for your recurring service.</p>
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="font-semibold">{fee.label}</p>
                <p>{dueCents > 0 ? formatMoney(dueCents / 100) : "No activation fee"}</p>
                <p className="mt-1 text-muted-foreground">Recurring service price: Pending contractor pricing</p>
                <p className="font-semibold">Due today: {dueCents > 0 ? formatMoney(dueCents / 100) : "$0.00"}</p>
              </div>
              <button type="button" disabled={busy} onClick={() => void submitSetup()} className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {dueCents > 0 ? "Pay Activation Fee & Submit" : "Submit Recurring Request"}
              </button>
            </div>
          ) : null}
          {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
        </div>
      ) : null}
      {message && !setup ? <p role="status" className="service-catalog-notice">{message}</p> : null}
      <a className="service-photo-credits" href="/brand/service-photos/credits.html" target="_blank" rel="noopener noreferrer">Service photo credits</a>
    </section>
  );
}
