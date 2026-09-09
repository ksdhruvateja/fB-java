import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
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
import { serviceImageFor } from "./serviceVisuals";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "popular", label: "Popular" },
  { id: "subscription", label: "Subscription Eligible" },
  { id: "maintenance", label: "Maintenance" },
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
  onRequestService: (prefill?: { service: string; description?: string }) => void;
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

  useEffect(() => {
    let cancelled = false;
    const token = getStoredToken();
    void fetch("/api/home-services", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.ok) return;
        setOfferings(mergeOfferings(data.offerings));
        if (data.activationFee) setFee(data.activationFee);
      })
      .catch(() => {
        if (!cancelled) setOfferings(mergeOfferings(null));
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
      if (!q) return true;
      return `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(q);
    });
  }, [offerings, query, filter]);

  const selected = offerings.find((item) => item.id === selectedId) || null;
  const dueCents = selected ? activationFeeFor(selected, fee) : 0;

  function openSetup(item: ServiceOffering) {
    const feature = /landscap|snow/i.test(item.category) ? "recurring_landscaping" : "recurring_cleaning";
    if (pro && !pro.requestFeature(feature, "services-setup")) return;
    setSelectedId(item.id);
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
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search services..."
          className="min-h-12 w-full rounded-2xl border border-border bg-card py-3 pl-10 pr-3 text-sm"
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visible.map((item) => (
          <article key={item.id} className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition hover:-translate-y-0.5">
            <img src={serviceImageFor(item.name)} alt="" className="mb-3 h-16 w-16 rounded-2xl object-cover" />
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">{item.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
              </div>
              {item.subscriptionEligible ? (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">Subscription Eligible</span>
              ) : null}
            </div>
            {item.recommendedFrequency ? (
              <p className="mt-2 text-[11px] text-muted-foreground">Recommended: {frequencyLabel(item.recommendedFrequency)}</p>
            ) : null}
            <button type="button" onClick={() => setSelectedId(item.id)} className="mt-3 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary">
              View Service <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </article>
        ))}
      </div>
      {selected && !setup ? (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">{selected.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{selected.description}</p>
          {selected.helpsWith.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {selected.helpsWith.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => onRequestService({ service: selected.category })} className="min-h-11 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white">
              Get AI Assessment
            </button>
            <button type="button" onClick={() => onRequestService({ service: selected.category, description: `Request a professional for ${selected.name}.` })} className="min-h-11 rounded-xl border border-border px-3 py-2 text-xs font-semibold">
              Request a Professional
            </button>
            {selected.subscriptionEligible ? (
              <button type="button" onClick={() => openSetup(selected)} className="min-h-11 rounded-xl border border-border px-3 py-2 text-xs font-semibold">
                Set Up Recurring Service
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {selected && setup ? (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
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
