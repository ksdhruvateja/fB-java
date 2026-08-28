import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Loader2,
  Plus,
  Shield,
  Sparkles,
  Wrench,
  ArrowRight,
  Trash2,
} from "lucide-react";
import { chatWithAi } from "./geminiAssessment";
import type { ManagedJob, Property } from "./managedJobs";
import { StructuredAddressFields } from "./UsLocationFields";
import {
  PROPERTY_SYSTEMS,
  analyzePropertyHealthProfile,
  applyHealthUpdate,
  applyPreviousServicesToSystems,
  buildHealthFromProperty,
  formatPropertyLine,
  healthHeadline,
  healthScore,
  mergeHealthWithJobs,
  needsHealthAnalysis,
  needsHealthOnboarding,
  normalizeHealthProfile,
  propertyHasHealthInputs,
  propertyHealthContext,
  statusLabel,
  statusTone,
  suggestServicesFromHistory,
  type AiServiceSuggestion,
  type PreviousServiceRecord,
  type PropertyHealthProfile,
  type PropertySystem,
  type SystemHealthStatus,
} from "./homeownerPropertyHealth";

function profileForProperty(property?: Property | null): PropertyHealthProfile {
  const base = normalizeHealthProfile(property?.healthProfile as PropertyHealthProfile | null);
  return {
    ...base,
    beds: property?.beds ?? base.beds,
    baths: property?.baths ?? base.baths,
    sqft: property?.sqft ?? base.sqft,
  };
}

function emptyDraftService(): PreviousServiceRecord {
  return {
    id: `svc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: "",
    system: "HVAC",
    company: "",
    date: "",
    cost: "",
    notes: "",
  };
}

function urgencyLabel(u?: AiServiceSuggestion["urgency"]) {
  if (u === "soon") return "Soon";
  if (u === "this_year") return "This year";
  return "Later";
}

export default function HomeownerHealthPanel({
  properties,
  jobs,
  busy,
  onSave,
  onAddProperty,
  onRequestService,
}: {
  properties: Property[];
  jobs: ManagedJob[];
  busy?: boolean;
  onSave: (propertyId: number, next: PropertyHealthProfile) => Promise<void> | void;
  onAddProperty: (input: {
    addressLine1: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    zip?: string;
    label?: string;
  }) => Promise<Property | null>;
  onRequestService?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(properties[0]?.id ?? null);
  const [showAdd, setShowAdd] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [newAddressLine2, setNewAddressLine2] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [newZip, setNewZip] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const [onboardingStep, setOnboardingStep] = useState<"welcome" | "services" | "suggestions" | null>(null);
  const [draftServices, setDraftServices] = useState<PreviousServiceRecord[]>([emptyDraftService()]);
  const [suggestions, setSuggestions] = useState<AiServiceSuggestion[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [showAddPast, setShowAddPast] = useState(false);
  const autoAnalyzeKeyRef = useRef<string>("");

  useEffect(() => {
    if (!selectedId && properties[0]) setSelectedId(properties[0].id);
    if (selectedId && properties.length && !properties.some((p) => p.id === selectedId)) {
      setSelectedId(properties[0]?.id ?? null);
    }
  }, [properties, selectedId]);

  const property = useMemo(
    () => properties.find((p) => p.id === selectedId) || properties[0] || null,
    [properties, selectedId]
  );
  const serverHealth = useMemo(() => profileForProperty(property), [property]);
  /** Keeps latest edits in sync so sequential saves never overwrite with stale props. */
  const [workingHealth, setWorkingHealth] = useState<PropertyHealthProfile | null>(null);
  const workingRef = useRef<PropertyHealthProfile | null>(null);
  const health = workingHealth && property ? workingHealth : serverHealth;

  useEffect(() => {
    workingRef.current = null;
    setWorkingHealth(null);
  }, [property?.id]);

  const jobCount = useMemo(
    () => (property ? jobs.filter((j) => !j.propertyId || Number(j.propertyId) === property.id).length : 0),
    [jobs, property]
  );
  const merged = mergeHealthWithJobs(health, jobs, property?.id);
  const score = healthScore(merged);
  const showOnboarding = Boolean(property && needsHealthOnboarding(health, jobCount) && onboardingStep !== null);

  useEffect(() => {
    if (!property) {
      setOnboardingStep(null);
      return;
    }
    if (needsHealthOnboarding(profileForProperty(property), jobCount)) {
      setOnboardingStep((s) => s ?? "welcome");
    } else {
      setOnboardingStep(null);
      const fromServer = profileForProperty(property).aiSuggestions || [];
      setSuggestions((prev) => (prev.length ? prev : fromServer));
    }
  }, [property?.id, jobCount]);

  useEffect(() => {
    if (!property || aiBusy || busy) return;
    const fingerprint = JSON.stringify({
      id: property.id,
      yearBuilt: property.yearBuilt,
      beds: property.beds,
      baths: property.baths,
      sqft: property.sqft,
      systems: (property.homeSystems || []).map((s) => [
        s.key,
        s.brand,
        s.installedYear,
        s.warrantyUntil,
        s.lastService,
      ]),
      previous: (health.previousServices || []).length,
      onboardingComplete: health.onboardingComplete,
    });
    if (fingerprint === autoAnalyzeKeyRef.current) return;
    if (!needsHealthAnalysis(health, property)) return;

    autoAnalyzeKeyRef.current = fingerprint;
    void (async () => {
      const analyzed = analyzePropertyHealthProfile(property, workingRef.current || health);
      workingRef.current = analyzed;
      setWorkingHealth(analyzed);
      await runAiSuggestions(analyzed.previousServices || [], analyzed, property);
    })();
  }, [property, health, aiBusy, busy]);

  const [editing, setEditing] = useState<PropertySystem | null>(null);
  const [status, setStatus] = useState<SystemHealthStatus>("good");
  const [nextAction, setNextAction] = useState("");
  const [notes, setNotes] = useState("");
  const [beds, setBeds] = useState("");
  const [baths, setBaths] = useState("");
  const [sqft, setSqft] = useState("");

  useEffect(() => {
    setBeds(health.beds != null ? String(health.beds) : "");
    setBaths(health.baths != null ? String(health.baths) : "");
    setSqft(health.sqft != null ? String(health.sqft) : "");
    setEditing(null);
  }, [property?.id, health.beds, health.baths, health.sqft]);

  async function persist(next: PropertyHealthProfile) {
    if (!property) return;
    const normalized = normalizeHealthProfile(next);
    workingRef.current = normalized;
    setWorkingHealth(normalized);
    await onSave(property.id, normalized);
  }

  const startEdit = (system: PropertySystem) => {
    const row = merged.systems.find((s) => s.system === system)!;
    setEditing(system);
    setStatus(row.status);
    setNextAction(row.nextAction);
    setNotes(row.notes || "");
  };

  const saveRow = async () => {
    if (!editing || !property) return;
    const base = workingRef.current || health;
    const next = applyHealthUpdate(base, {
      system: editing,
      status,
      nextAction,
      notes,
      updatedBy: "homeowner",
    });
    await persist(next);
    setEditing(null);
  };

  const saveMeta = async () => {
    if (!property) return;
    const base = workingRef.current || health;
    const withMeta = {
      ...base,
      beds: beds ? Number(beds) : null,
      baths: baths ? Number(baths) : null,
      sqft: sqft ? Number(sqft) : null,
    };
    const propertyDraft: Property = {
      ...property,
      beds: withMeta.beds ?? property.beds,
      baths: withMeta.baths ?? property.baths,
      sqft: withMeta.sqft ?? property.sqft,
    };
    const analyzed = analyzePropertyHealthProfile(propertyDraft, withMeta);
    await persist(analyzed);
    setSuggestions(analyzed.aiSuggestions || []);
    autoAnalyzeKeyRef.current = "";
    await runAiSuggestions(analyzed.previousServices || [], analyzed, propertyDraft);
  };

  const addHome = async (e: FormEvent) => {
    e.preventDefault();
    if (!newAddress.trim()) return;
    const created = await onAddProperty({
      addressLine1: newAddress.trim(),
      addressLine2: newAddressLine2.trim() || undefined,
      city: newCity.trim() || undefined,
      state: newState.trim() || undefined,
      zip: newZip.trim() || undefined,
      label: newLabel.trim() || undefined,
    });
    if (created) {
      setSelectedId(created.id);
      setShowAdd(false);
      setNewAddress("");
      setNewAddressLine2("");
      setNewCity("");
      setNewState("");
      setNewZip("");
      setNewLabel("");
      setOnboardingStep("welcome");
      setDraftServices([emptyDraftService()]);
      setSuggestions([]);
      workingRef.current = null;
      setWorkingHealth(null);
    }
  };

  async function runAiSuggestions(
    services: PreviousServiceRecord[],
    baseOverride?: PropertyHealthProfile,
    propertyOverride?: Property | null
  ) {
    setAiBusy(true);
    setAiNote(null);
    const prop = propertyOverride || property;
    const base = baseOverride || workingRef.current || health;
    let next = prop ? buildHealthFromProperty(prop, base) : base;
    if (services.length) {
      next = applyPreviousServicesToSystems(next, services);
    }
    next = {
      ...next,
      aiSuggestions: suggestServicesFromHistory(services, next),
    };
    try {
      const summary = services
        .map(
          (s) =>
            `- ${s.title || "Service"} (${s.system})${s.company ? ` by ${s.company}` : ""}${s.date ? ` on ${s.date}` : ""}`
        )
        .join("\n");
      const propertyContext = propertyHealthContext(prop);
      const systemSummary = next.systems
        .map((s) => `- ${s.system}: ${s.status} — ${s.nextAction}`)
        .join("\n");
      const result = await chatWithAi([
        {
          role: "user",
          content: `You are FixBridge home-care AI. Analyze this home's health based on property details, system statuses, and past services. Suggest 3-5 additional or future maintenance services the homeowner may need. Reply ONLY with a JSON array of objects: [{"title":"...","reason":"...","system":"HVAC|Plumbing|Electrical|Roof|Appliances|Pest|Safety|Other","urgency":"soon|this_year|later"}].\n\nProperty:\n${propertyContext || "(no property facts yet)"}\n\nSystem health:\n${systemSummary}\n\nPast services:\n${summary || "(none listed)"}`,
        },
      ]);
      if (result.reply) {
        const match = result.reply.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]) as Array<{
            title?: string;
            reason?: string;
            system?: string;
            urgency?: string;
          }>;
          if (Array.isArray(parsed) && parsed.length) {
            next = {
              ...next,
              aiSuggestions: parsed.slice(0, 6).map((p, i) => ({
                id: `ai_${i}_${Date.now()}`,
                title: String(p.title || "Suggested service"),
                reason: String(p.reason || "Recommended from your home history."),
                system: (PROPERTY_SYSTEMS.includes(p.system as PropertySystem)
                  ? p.system
                  : "Other") as PropertySystem | "Other",
                urgency:
                  p.urgency === "soon" || p.urgency === "this_year" || p.urgency === "later"
                    ? p.urgency
                    : "this_year",
              })),
            };
            setAiNote("Suggestions refined by FixBridge AI from your property details and service history.");
          }
        }
      } else if (propertyContext || systemSummary) {
        setAiNote("Using FixBridge smart analysis from your property details.");
      } else {
        setAiNote("Using FixBridge smart suggestions based on your history.");
      }
    } catch {
      setAiNote(
        propertyHasHealthInputs(prop)
          ? "Using FixBridge smart analysis from your property details."
          : "Using FixBridge smart suggestions based on your history."
      );
    } finally {
      setSuggestions(next.aiSuggestions || []);
      setAiBusy(false);
      if (property) {
        const latest = workingRef.current || next;
        await persist({
          ...latest,
          ...next,
          previousServices: services.length ? services : latest.previousServices || [],
          aiSuggestions: next.aiSuggestions || [],
        });
      }
    }
  }

  async function finishServicesStep() {
    if (!property) return;
    const cleaned = draftServices.filter((s) => s.title.trim());
    const base = workingRef.current || health;
    const withSystems = applyPreviousServicesToSystems(base, cleaned);
    const allPrevious = [...(base.previousServices || []), ...cleaned];
    const nextProfile: PropertyHealthProfile = {
      ...withSystems,
      previousServices: allPrevious,
      maintenance: withSystems.maintenance || [],
      onboardingComplete: false,
    };
    await persist(nextProfile);
    setOnboardingStep("suggestions");
    await runAiSuggestions(allPrevious, nextProfile);
  }

  async function acceptSuggestion(sug: AiServiceSuggestion) {
    if (!property) return;
    const base = workingRef.current || health;
    const due = new Date();
    if (sug.urgency === "soon") due.setDate(due.getDate() + 21);
    else if (sug.urgency === "this_year") due.setMonth(due.getMonth() + 4);
    else due.setMonth(due.getMonth() + 10);
    const maintenance = [
      ...(base.maintenance || []),
      {
        label: sug.title,
        dueDate: due.toISOString().slice(0, 10),
        system: sug.system === "Other" ? undefined : sug.system,
      },
    ];
    let systems = base.systems;
    if (sug.system && sug.system !== "Other") {
      systems = applyHealthUpdate(base, {
        system: sug.system,
        status: sug.urgency === "soon" ? "due_soon" : "good",
        nextAction: sug.title,
        notes: sug.reason,
        updatedBy: "homeowner",
      }).systems;
    }
    const aiSuggestions = (suggestions.length ? suggestions : base.aiSuggestions || []).map((s) =>
      s.id === sug.id ? { ...s, accepted: true } : s
    );
    setSuggestions(aiSuggestions);
    await persist({
      ...base,
      systems,
      maintenance,
      aiSuggestions,
      onboardingComplete: base.onboardingComplete === true,
    });
  }

  async function completeOnboarding() {
    if (!property) return;
    const base = workingRef.current || health;
    let next: PropertyHealthProfile = {
      ...base,
      aiSuggestions: suggestions.length ? suggestions : base.aiSuggestions || [],
      onboardingComplete: true,
    };
    if (propertyHasHealthInputs(property)) {
      next = analyzePropertyHealthProfile(property, next);
    }
    await persist(next);
    setOnboardingStep(null);
    if (propertyHasHealthInputs(property) || (next.previousServices || []).length) {
      await runAiSuggestions(next.previousServices || [], next, property);
    }
  }

  async function savePastServicesInline() {
    if (!property) return;
    const cleaned = draftServices.filter((s) => s.title.trim());
    if (!cleaned.length) return;
    const base = workingRef.current || health;
    const withSystems = applyPreviousServicesToSystems(base, cleaned);
    const allPrevious = [...(base.previousServices || []), ...cleaned];
    const nextProfile: PropertyHealthProfile = {
      ...withSystems,
      previousServices: allPrevious,
      onboardingComplete: true,
    };
    await persist(nextProfile);
    setShowAddPast(false);
    setDraftServices([emptyDraftService()]);
    await runAiSuggestions(allPrevious, nextProfile);
  }

  const serviceForm = (
    <div className="space-y-3">
      {draftServices.map((svc, idx) => (
        <div key={svc.id} className="rounded-2xl border border-border bg-background p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">Service {idx + 1}</p>
            {draftServices.length > 1 && (
              <button
                type="button"
                onClick={() => setDraftServices((list) => list.filter((s) => s.id !== svc.id))}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <input
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
            placeholder="What was done? (e.g. HVAC annual service)"
            value={svc.title}
            onChange={(e) => {
              const next = [...draftServices];
              next[idx] = { ...svc, title: e.target.value };
              setDraftServices(next);
            }}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
              value={svc.system}
              onChange={(e) => {
                const next = [...draftServices];
                next[idx] = { ...svc, system: e.target.value as PreviousServiceRecord["system"] };
                setDraftServices(next);
              }}
            >
              {PROPERTY_SYSTEMS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="Other">Other</option>
            </select>
            <input
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
              placeholder="Company name"
              value={svc.company || ""}
              onChange={(e) => {
                const next = [...draftServices];
                next[idx] = { ...svc, company: e.target.value };
                setDraftServices(next);
              }}
            />
            <input
              type="date"
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
              value={svc.date || ""}
              onChange={(e) => {
                const next = [...draftServices];
                next[idx] = { ...svc, date: e.target.value };
                setDraftServices(next);
              }}
            />
            <input
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
              placeholder="Cost (optional)"
              value={svc.cost || ""}
              onChange={(e) => {
                const next = [...draftServices];
                next[idx] = { ...svc, cost: e.target.value };
                setDraftServices(next);
              }}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setDraftServices((list) => [...list, emptyDraftService()])}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
      >
        <Plus size={14} /> Add another past service
      </button>
    </div>
  );

  return (
    <section className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
            Property Health
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track systems for each home — log past work and let FixBridge AI suggest what&apos;s next.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Add address
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={(e) => void addHome(e)}
          className="grid gap-3 rounded-[1.5rem] border border-border bg-card p-5 sm:grid-cols-2"
        >
          <p className="sm:col-span-2 text-sm font-semibold">New home address</p>
          <input
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm sm:col-span-2"
            placeholder="Label (e.g. My Home 2)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <div className="sm:col-span-2">
            <StructuredAddressFields
              idPrefix="health-add-home"
              addressLine1={newAddress}
              addressLine2={newAddressLine2}
              city={newCity}
              state={newState}
              zip={newZip}
              onAddressLine1Change={setNewAddress}
              onAddressLine2Change={setNewAddressLine2}
              onCityChange={setNewCity}
              onStateChange={setNewState}
              onZipChange={setNewZip}
            />
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save address"}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {properties.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-border bg-card px-6 py-12 text-center">
          <Shield className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 text-sm font-medium">No addresses yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Add a home to start tracking property health.</p>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus size={16} /> Add address
          </button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
          <div className="space-y-2">
            {properties.map((p, idx) => {
              const active = property?.id === p.id;
              const pHealth = active && workingHealth ? workingHealth : profileForProperty(p);
              const pScore = healthScore(mergeHealthWithJobs(pHealth, jobs, p.id));
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full rounded-2xl border px-3.5 py-3 text-left transition ${
                    active ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Home {idx + 1}
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-snug line-clamp-2">
                    {p.label || p.addressLine1}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-primary">{pScore} / 100</p>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border px-3 py-3 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary"
            >
              <Plus size={14} /> Add address
            </button>
          </div>

          {property && (
            <div className="space-y-5">
              {showOnboarding && onboardingStep === "welcome" && (
                <div className="relative overflow-hidden rounded-[1.75rem] border border-primary/20 bg-card p-6 shadow-sm sm:p-7">
                  <div
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,77,28,0.12),transparent_55%)]"
                    aria-hidden
                  />
                  <div className="relative">
                    <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      <Sparkles className="h-3.5 w-3.5" /> FixBridge AI
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight">Build your home health profile</h2>
                    <p className="mt-2 max-w-xl text-sm text-muted-foreground leading-relaxed">
                      Add previous services done on this home. FixBridge AI can detect patterns and suggest additional
                      or future services you may need — then you can update details anytime.
                    </p>
                    <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> Log past HVAC, plumbing, pest, and more
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> Get AI-suggested follow-ups & seasonal care
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> Update systems and next actions as things change
                      </li>
                    </ul>
                    <div className="mt-6 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDraftServices([emptyDraftService()]);
                          setOnboardingStep("services");
                        }}
                        className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white"
                      >
                        Add previous services <ArrowRight size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void completeOnboarding()}
                        className="rounded-2xl border border-border px-4 py-3 text-sm font-semibold"
                      >
                        Skip for now
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showOnboarding && onboardingStep === "services" && (
                <div className="rounded-[1.75rem] border border-border bg-card p-5 sm:p-6 space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold">Previous services</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Tell us what&apos;s already been done — company, date, and system help AI recommend what&apos;s next.
                    </p>
                  </div>
                  {serviceForm}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy || aiBusy || !draftServices.some((s) => s.title.trim())}
                      onClick={() => void finishServicesStep()}
                      className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {busy || aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Continue — get AI suggestions
                    </button>
                    <button
                      type="button"
                      onClick={() => setOnboardingStep("welcome")}
                      className="rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold"
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}

              {showOnboarding && onboardingStep === "suggestions" && (
                <div className="rounded-[1.75rem] border border-border bg-card p-5 sm:p-6 space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" /> Suggested for your home
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {aiNote ||
                        "Based on your history, here are additional or future services you might need. Accept any to add them to your plan — or update system details below."}
                    </p>
                  </div>
                  {aiBusy ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" /> Analyzing your home history…
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {suggestions.map((sug) => (
                        <li
                          key={sug.id}
                          className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/20 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold">{sug.title}</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">{sug.reason}</p>
                            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {[sug.system, urgencyLabel(sug.urgency)].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          {sug.accepted ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Added
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-2 shrink-0">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void acceptSuggestion(sug)}
                                className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                              >
                                Add to plan
                              </button>
                              {onRequestService && (
                                <button
                                  type="button"
                                  onClick={onRequestService}
                                  className="rounded-xl border border-border px-3 py-2 text-xs font-semibold"
                                >
                                  Request now
                                </button>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void completeOnboarding()}
                      className="rounded-2xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-60"
                    >
                      Save & view health dashboard
                    </button>
                    <button
                      type="button"
                      onClick={() => setOnboardingStep("services")}
                      className="rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold"
                    >
                      Edit past services
                    </button>
                  </div>

                  {(health.previousServices || []).length > 0 && (
                    <div className="rounded-2xl border border-border bg-muted/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Logged so far
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {(health.previousServices || []).map((s) => (
                          <li key={s.id} className="text-sm">
                            <span className="font-medium">{s.title}</span>
                            <span className="text-muted-foreground">
                              {" "}
                              · {[s.system, s.company, s.date].filter(Boolean).join(" · ")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                    <div>
                      <p className="text-sm font-semibold">Update system details</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Adjust status or next actions based on what you logged and AI suggested.
                      </p>
                    </div>
                    <div className="space-y-2">
                      {PROPERTY_SYSTEMS.map((system) => {
                        const row = merged.systems.find((s) => s.system === system)!;
                        return (
                          <div
                            key={system}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 px-3 py-2.5 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold">{system}</p>
                              <p className="text-xs text-muted-foreground truncate">{row.nextAction}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="inline-flex items-center gap-1.5 text-xs">
                                <span className={`h-2 w-2 rounded-full ${statusTone(row.status)}`} />
                                {statusLabel(row.status)}
                              </span>
                              <button
                                type="button"
                                onClick={() => startEdit(system)}
                                className="text-xs font-semibold text-primary hover:underline"
                              >
                                Update
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {editing && (
                      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
                        <p className="text-sm font-semibold">Update {editing}</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <select
                            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                            value={status}
                            onChange={(e) => setStatus(e.target.value as SystemHealthStatus)}
                          >
                            <option value="good">Good</option>
                            <option value="due_soon">Due Soon</option>
                            <option value="attention">Attention</option>
                            <option value="critical">Critical</option>
                          </select>
                          <input
                            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                            value={nextAction}
                            onChange={(e) => setNextAction(e.target.value)}
                            placeholder="Next action"
                          />
                          <textarea
                            rows={2}
                            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm sm:col-span-2"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Notes"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void saveRow()}
                            className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            Save update
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="rounded-xl border border-border px-3 py-2 text-xs font-semibold"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!showOnboarding && (
                <>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Selected home
                    </p>
                    <p className="mt-1 text-base font-semibold">{formatPropertyLine(property)}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDraftServices([emptyDraftService()]);
                          setShowAddPast(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:border-primary/40"
                      >
                        <Wrench className="h-3.5 w-3.5" /> Add previous service
                      </button>
                      <button
                        type="button"
                        disabled={aiBusy}
                        onClick={() => void runAiSuggestions(health.previousServices || [])}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:border-primary/40"
                      >
                        {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Refresh AI suggestions
                      </button>
                    </div>
                  </div>

                  {showAddPast && (
                    <div className="rounded-[1.5rem] border border-border bg-card p-5 space-y-4">
                      <p className="text-sm font-semibold">Log a previous service</p>
                      {serviceForm}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy || !draftServices.some((s) => s.title.trim())}
                          onClick={() => void savePastServicesInline()}
                          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          Save services
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAddPast(false)}
                          className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {(suggestions.length > 0 || (health.aiSuggestions || []).length > 0) && (
                    <div className="rounded-[1.5rem] border border-primary/20 bg-primary/5 p-5 space-y-3">
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" /> AI suggestions for this home
                      </p>
                      {(suggestions.length ? suggestions : health.aiSuggestions || [])
                        .filter((s) => !s.accepted)
                        .slice(0, 4)
                        .map((sug) => (
                          <div
                            key={sug.id}
                            className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <p className="text-sm font-semibold">{sug.title}</p>
                              <p className="text-xs text-muted-foreground">{sug.reason}</p>
                            </div>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void acceptSuggestion(sug)}
                              className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white"
                            >
                              Add to plan
                            </button>
                          </div>
                        ))}
                    </div>
                  )}

                  {(health.previousServices || []).length > 0 && (
                    <div className="rounded-[1.5rem] border border-border/70 bg-card p-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Previous services logged
                      </p>
                      <ul className="mt-3 space-y-2.5">
                        {(health.previousServices || []).map((s) => (
                          <li key={s.id} className="text-sm">
                            <p className="font-semibold">{s.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {[s.system, s.company, s.date, s.cost].filter(Boolean).join(" · ")}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="rounded-[1.5rem] border border-border/70 bg-card p-5 sm:p-6">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Home Health Score
                        </p>
                        <p className="mt-2 flex items-center gap-2 text-sm font-medium">
                          <Shield className="h-4 w-4 text-primary" />
                          {healthHeadline(score)}
                        </p>
                      </div>
                      <p className="[font-family:'Barlow_Condensed',sans-serif] text-5xl font-black text-primary">
                        {score}
                        <span className="text-xl text-muted-foreground"> / 100</span>
                      </p>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-card shadow-sm">
                    <div className="grid grid-cols-[1.1fr_1fr_1.4fr_auto] gap-2 border-b border-border bg-muted/30 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span>System</span>
                      <span>Status</span>
                      <span>Next Action</span>
                      <span className="text-right">Edit</span>
                    </div>
                    {PROPERTY_SYSTEMS.map((system) => {
                      const row = merged.systems.find((s) => s.system === system)!;
                      return (
                        <div
                          key={system}
                          className="grid grid-cols-[1.1fr_1fr_1.4fr_auto] gap-2 border-b border-border/60 px-4 py-3.5 text-sm last:border-b-0"
                        >
                          <span className="font-semibold">{system}</span>
                          <span className="inline-flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${statusTone(row.status)}`} />
                            {statusLabel(row.status)}
                          </span>
                          <span className="text-muted-foreground">{row.nextAction}</span>
                          <button
                            type="button"
                            onClick={() => startEdit(system)}
                            className="justify-self-end text-xs font-semibold text-primary hover:underline"
                          >
                            Update
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {editing && (
                    <div className="rounded-[1.5rem] border border-primary/25 bg-primary/5 p-5">
                      <p className="text-sm font-semibold">Update {editing}</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1.5 text-sm">
                          <span className="text-xs font-medium text-muted-foreground">Status</span>
                          <select
                            className="rounded-xl border border-border bg-background px-3 py-2.5"
                            value={status}
                            onChange={(e) => setStatus(e.target.value as SystemHealthStatus)}
                          >
                            <option value="good">Good</option>
                            <option value="due_soon">Due Soon</option>
                            <option value="attention">Attention</option>
                            <option value="critical">Critical</option>
                          </select>
                        </label>
                        <label className="grid gap-1.5 text-sm">
                          <span className="text-xs font-medium text-muted-foreground">Next action</span>
                          <input
                            className="rounded-xl border border-border bg-background px-3 py-2.5"
                            value={nextAction}
                            onChange={(e) => setNextAction(e.target.value)}
                            placeholder="Filter due Aug 28"
                          />
                        </label>
                        <label className="grid gap-1.5 text-sm sm:col-span-2">
                          <span className="text-xs font-medium text-muted-foreground">Notes</span>
                          <textarea
                            rows={3}
                            className="rounded-xl border border-border bg-background px-3 py-2.5"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="What was checked, replaced, or recommended?"
                          />
                        </label>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void saveRow()}
                          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Save update
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="rounded-[1.5rem] border border-border/70 bg-card p-5">
                    <p className="text-sm font-semibold">Property details</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <label className="grid gap-1.5 text-sm">
                        <span className="text-xs text-muted-foreground">Beds</span>
                        <input
                          className="rounded-xl border border-border bg-background px-3 py-2.5"
                          value={beds}
                          onChange={(e) => setBeds(e.target.value)}
                          inputMode="numeric"
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm">
                        <span className="text-xs text-muted-foreground">Baths</span>
                        <input
                          className="rounded-xl border border-border bg-background px-3 py-2.5"
                          value={baths}
                          onChange={(e) => setBaths(e.target.value)}
                          inputMode="numeric"
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm">
                        <span className="text-xs text-muted-foreground">Sq ft</span>
                        <input
                          className="rounded-xl border border-border bg-background px-3 py-2.5"
                          value={sqft}
                          onChange={(e) => setSqft(e.target.value)}
                          inputMode="numeric"
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveMeta()}
                      className="mt-4 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-60"
                    >
                      Save & analyze health
                    </button>
                    {aiNote && !showOnboarding ? (
                      <p className="mt-2 text-xs text-muted-foreground">{aiNote}</p>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
