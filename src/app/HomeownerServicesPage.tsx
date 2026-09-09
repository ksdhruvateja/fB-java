import { useEffect, useMemo, useState } from "react";
import { ArrowRight, RefreshCw, Search, Sparkles, UserRound, Wrench } from "lucide-react";
import { getStoredToken } from "./auth";
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
import { ServiceThumb } from "./serviceVisuals";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "popular", label: "Popular" },
  { id: "subscription", label: "Subscription Eligible" },
  { id: "maintenance", label: "Maintenance" },
  { id: "indoor", label: "Indoor" },
  { id: "outdoor", label: "Outdoor" },
] as const;

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Flexible"];
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
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [helpChoice, setHelpChoice] = useState("");
  const [visitMode, setVisitMode] = useState<"one_time" | "recurring" | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = getStoredToken();
    void fetch("/api/home-services", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.ok) return;
        const merged = mergeOfferings(data.offerings);
        const ids = new Set((Array.isArray(data.offerings) ? data.offerings : []).map((row: { id?: string }) => String(row.id)));
        setOfferings(ids.size ? merged.filter((item) => ids.has(item.id)) : merged.filter((item) => item.active && item.homeownerVisible));
        if (data.activationFee) setFee(data.activationFee);
      })
      .catch(() => {
        if (!cancelled) setOfferings(mergeOfferings(null).filter((item) => item.active && item.homeownerVisible));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return offerings.filter((item) => {
      if (filter === "popular" && !item.popular) return false;
      if (filter === "subscription" && !item.subscriptionEligible) return false;
      if (filter === "maintenance" && item.kind !== "maintenance" && !item.subscriptionEligible) return false;
      if (filter === "indoor" && item.place === "outdoor") return false;
      if (filter === "outdoor" && item.place === "indoor") return false;
      if (!q) return true;
      return `${item.name} ${item.description} ${item.category} ${(item.helpsWith || []).join(" ")} ${(item.searchTerms || []).join(" ")}`.toLowerCase().includes(q);
    });
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
    onRequestService({
      service: item.category,
      description: detail || undefined,
      intent,
    });
  }

  function openSetup(item: ServiceOffering) {
    const feature = /landscap|snow/i.test(item.category) ? "recurring_landscaping" : "recurring_cleaning";
    if (pro && !pro.requestFeature(feature, "services-setup")) return;
    setSelectedId(item.id);
    if (helpChoice && !notes) setNotes(helpChoice);
    setSetup(true);
    setStep(0);
    setRecurrence(item.frequencies[0] || "");
    setMessage(null);
  }

  async function submitSetup() {
    if (!selected || !property?.id) {
      setMessage("Add a property before setting up a recurring service.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const token = getStoredToken() || "";
      const res = await fetch("/api/recurring-services/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          offeringId: selected.id,
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
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home Services, All in One Place</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose what your home needs and FixBridge will help diagnose, guide, or connect you with the right professional.
        </p>
      </div>
      {!selected ? (
        <>
          <label className="relative block">
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
          <div className="flex gap-2 overflow-x-auto pb-1">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${filter === item.id ? "bg-primary text-white" : "bg-card ring-1 ring-border"}`}
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
          <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((item) => {
              const q = query.trim().toLowerCase();
              const match = q
                ? item.helpsWith.find((line) => line.toLowerCase().includes(q)) ||
                  item.searchTerms.find((line) => line.toLowerCase().includes(q))
                : "";
              return (
              <article
                key={item.id}
                className="flex h-full flex-col rounded-3xl border border-border/80 bg-card p-4 text-left shadow-sm motion-safe:transition motion-safe:duration-300 motion-safe:hover:-translate-y-1 motion-safe:hover:border-primary/50"
              >
                <ServiceThumb name={item.name} className="h-24 w-full" />
                <h2 className="mt-3 text-base font-semibold">{item.name}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                {match ? <p className="mt-1 text-xs font-semibold text-primary">{match}</p> : null}
                <ul className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                  {item.oneTimeAvailable ? <li className="rounded-full bg-muted px-2 py-1">One-Time</li> : null}
                  {item.subscriptionEligible ? <li className="rounded-full bg-primary/10 px-2 py-1 text-primary">Subscription Eligible</li> : null}
                  {item.professionalAvailable ? <li className="rounded-full bg-muted px-2 py-1">Professional</li> : null}
                  {item.diyAvailable ? <li className="rounded-full bg-muted px-2 py-1">DIY Available</li> : null}
                  {item.popular ? <li className="rounded-full bg-primary/10 px-2 py-1 text-primary">Popular</li> : null}
                </ul>
                <button
                  type="button"
                  onClick={() => openService(item)}
                  className="mt-4 inline-flex min-h-11 items-center justify-between rounded-2xl bg-primary px-3 py-2 text-sm font-semibold text-white"
                >
                  View Service <ArrowRight className="h-4 w-4" />
                </button>
              </article>
              );
            })}
          </div>
        )
      ) : null}
      {selected && !setup ? (
        <div className="space-y-4">
          <button type="button" onClick={() => setSelectedId(null)} className="text-sm font-semibold text-primary">
            Back to services
          </button>
          <div className="overflow-hidden rounded-3xl border border-border bg-card">
            <div className="grid gap-4 p-5 md:grid-cols-[180px_1fr] md:items-center">
              <ServiceThumb name={selected.name} className="h-36 w-full" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">{selected.name}</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">{selected.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{selected.description}</p>
                <ul className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                  {selected.oneTimeAvailable ? <li className="rounded-full bg-muted px-2 py-1">One-Time Service</li> : null}
                  {selected.subscriptionEligible ? <li className="rounded-full bg-primary/10 px-2 py-1 text-primary">Subscription Eligible</li> : null}
                  {selected.professionalAvailable ? <li className="rounded-full bg-muted px-2 py-1">Professional Available</li> : null}
                  {selected.diyAvailable ? <li className="rounded-full bg-muted px-2 py-1">DIY Available</li> : null}
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
                    className={`min-h-11 rounded-2xl border px-3 py-2 text-sm motion-safe:transition ${helpChoice === line ? "border-primary bg-primary/10" : "border-border bg-card"}`}
                  >
                    {line}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {selected.oneTimeAvailable && selected.subscriptionEligible ? (
            <div>
              <h3 className="text-sm font-semibold">How do you need this service?</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setVisitMode("one_time")} className={`rounded-2xl border p-4 text-left motion-safe:transition motion-safe:hover:-translate-y-0.5 ${visitMode === "one_time" ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
                  <span className="font-semibold">One-Time Service</span>
                  <span className="mt-1 block text-sm text-muted-foreground">Best for a single service visit.</span>
                </button>
                <button type="button" onClick={() => setVisitMode("recurring")} className={`rounded-2xl border p-4 text-left motion-safe:transition motion-safe:hover:-translate-y-0.5 ${visitMode === "recurring" ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
                  <span className="font-semibold">Recurring Service</span>
                  <span className="mt-1 block text-sm text-muted-foreground">Set a schedule and let FixBridge manage it.</span>
                </button>
              </div>
            </div>
          ) : null}
          <div>
            <h3 className="text-sm font-semibold">How would you like FixBridge to help?</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {selected.oneTimeAvailable && visitMode !== "recurring" ? (
                <button type="button" onClick={() => startAction(selected, "request")} className="rounded-2xl border border-border bg-card p-4 text-left motion-safe:transition motion-safe:hover:-translate-y-1 motion-safe:hover:border-primary/50">
                  <Wrench className="h-5 w-5 text-primary" />
                  <span className="mt-2 block font-semibold">Request a Service</span>
                  <span className="mt-1 block text-sm text-muted-foreground">Tell us what is happening and we will start a request.</span>
                </button>
              ) : null}
              {selected.professionalAvailable && visitMode !== "recurring" ? (
                <button type="button" onClick={() => startAction(selected, "hire")} className="rounded-2xl border border-border bg-card p-4 text-left motion-safe:transition motion-safe:hover:-translate-y-1 motion-safe:hover:border-primary/50">
                  <UserRound className="h-5 w-5 text-primary" />
                  <span className="mt-2 block font-semibold">Hire a Professional</span>
                  <span className="mt-1 block text-sm text-muted-foreground">Skip the DIY path and request a professional directly.</span>
                </button>
              ) : null}
              {selected.diyAvailable && selected.aiAssessmentAvailable && visitMode !== "recurring" ? (
                <button type="button" onClick={() => startAction(selected, "diy")} className="rounded-2xl border border-border bg-card p-4 text-left motion-safe:transition motion-safe:hover:-translate-y-1 motion-safe:hover:border-primary/50">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span className="mt-2 block font-semibold">Try DIY</span>
                  <span className="mt-1 block text-sm text-muted-foreground">Get AI guidance. Unsafe work stays with a professional.</span>
                </button>
              ) : null}
              {selected.subscriptionEligible && visitMode !== "one_time" ? (
                <button type="button" onClick={() => openSetup(selected)} className="rounded-2xl border border-border bg-card p-4 text-left motion-safe:transition motion-safe:hover:-translate-y-1 motion-safe:hover:border-primary/50">
                  <RefreshCw className="h-5 w-5 text-primary" />
                  <span className="mt-2 block font-semibold">Set Up Recurring Service</span>
                  <span className="mt-1 block text-sm text-muted-foreground">Available as a recurring service. Activation fee comes from admin settings.</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {selected && setup ? (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <button type="button" onClick={() => setSetup(false)} className="text-sm font-semibold text-primary">
            Back
          </button>
          <h2 className="text-lg font-semibold">{selected.name}</h2>
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
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border px-3" />
              </label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for FixBridge" className="min-h-20 w-full rounded-xl border border-border p-3 text-sm" />
              <button type="button" onClick={() => setStep(3)} className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">Review</button>
            </div>
          ) : null}
          {step === 3 ? (
            <div className="space-y-3 text-sm">
              <p>Service: {selected.name}</p>
              <p>Frequency: {frequencyLabel(recurrence)}</p>
              <p>Preferred day: {day}</p>
              <p>Preferred time: {time}</p>
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
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
