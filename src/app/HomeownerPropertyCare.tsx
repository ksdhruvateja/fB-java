import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Home, Loader2, Plus } from "lucide-react";
import type { HomeSystemRecord, ManagedJob, Property } from "./managedJobs";
import { normalizeHealthProfile, type PropertyHealthProfile } from "./homeownerPropertyHealth";
import type { PropertyCareSection } from "./homeownerNav";
import type { PropertyPassportSection } from "./propertyPassport";
import HomeownerPropertyPassport from "./HomeownerPropertyPassport";
import HomeownerHomeUpdates from "./HomeownerHomeUpdates";
import HomeownerMaintenanceTimeline from "./HomeownerMaintenanceTimeline";
import HomeCareProHub from "./HomeCareProHub";
import { buildHomeUpdatesSnapshot } from "./homeUpdates";
import { useProFeature } from "./ProFeatureProvider";
import LockedProBadge from "./LockedProBadge";
import ProLockedShell from "./ProLockedShell";
import type { ProFeatureId } from "./proFeatures";
import { VerifiedAddressFields, type AddressVerificationMeta } from "./VerifiedAddressInput";
import { normalizeUsStateCode } from "./UsLocationFields";
import { isAddressComplete } from "./addressFormat";
import { isValidUsZip, normalizeZip } from "./zipCode";

const CARE_HUB_TABS: { id: PropertyCareSection; label: string; proFeature?: ProFeatureId }[] = [
  { id: "passport", label: "Property Passport" },
  { id: "hub", label: "HomeCare Pro" },
  { id: "maintenance", label: "Maintenance", proFeature: "maintenance_calendar" },
  { id: "reminders", label: "Reminders" },
];

function propertyLabel(p: Property): string {
  return p.label?.trim() || p.addressLine1?.trim() || `Home #${p.id}`;
}

function passportSectionForLegacy(section: PropertyCareSection): PropertyPassportSection {
  if (section === "systems") return "systems";
  if (section === "timeline") return "service-history";
  if (section === "upcoming") return "maintenance";
  if (section === "overview") return "overview";
  return "overview";
}

export default function HomeownerPropertyCare({
  properties,
  jobs,
  propertiesLoading = false,
  busy,
  initialSection = "passport",
  initialPropertyId,
  onSaveHealth,
  onSaveProperty,
  onAddProperty,
  onPropertySelect,
  onRequestService,
  onOpenJob,
  onRefresh,
}: {
  properties: Property[];
  jobs: ManagedJob[];
  propertiesLoading?: boolean;
  busy?: boolean;
  initialSection?: PropertyCareSection;
  initialPropertyId?: number | null;
  onSaveHealth: (propertyId: number, next: PropertyHealthProfile) => Promise<void> | void;
  onSaveProperty: (
    propertyId: number,
    body: Partial<Property> & { homeSystems?: HomeSystemRecord[] }
  ) => Promise<boolean>;
  onAddProperty: (input: {
    addressLine1: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    zip?: string;
    label?: string;
    addressVerified?: boolean;
    postalCodePlus4?: string;
  }) => Promise<Property | null>;
  onPropertySelect?: (propertyId: number) => void;
  onRequestService: (prefill?: { category?: string; title?: string; area?: string }) => void;
  onOpenJob: (jobId: number) => void;
  onRefresh: () => Promise<void>;
}) {
  const legacyToHub = (s: PropertyCareSection): PropertyCareSection => {
    if (s === "overview" || s === "systems" || s === "timeline") return "passport";
    if (s === "recommendations") return "reminders";
    if (s === "upcoming") return "maintenance";
    if (s === "hub") return "hub";
    return s;
  };

  const [hub, setHub] = useState<PropertyCareSection>(() => legacyToHub(initialSection));
  const [passportSection, setPassportSection] = useState<PropertyPassportSection>(() =>
    passportSectionForLegacy(initialSection)
  );
  const [selectedId, setSelectedId] = useState<number | null>(
    initialPropertyId ?? properties[0]?.id ?? null
  );
  const [showAddHome, setShowAddHome] = useState(false);
  const [savingHome, setSavingHome] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newAddressLine2, setNewAddressLine2] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [newZip, setNewZip] = useState("");
  const [addHomeError, setAddHomeError] = useState<string | null>(null);
  const [newHomeVerification, setNewHomeVerification] = useState<AddressVerificationMeta>({
    status: "unverified",
    addressVerified: false,
  });

  useEffect(() => {
    setHub(legacyToHub(initialSection));
    setPassportSection(passportSectionForLegacy(initialSection));
  }, [initialSection]);

  useEffect(() => {
    if (initialPropertyId != null) setSelectedId(initialPropertyId);
  }, [initialPropertyId]);

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

  const health = useMemo(
    () => normalizeHealthProfile(property?.healthProfile as PropertyHealthProfile | null),
    [property?.healthProfile]
  );

  const propertyJobs = useMemo(
    () =>
      property?.id != null
        ? jobs.filter((j) => !j.propertyId || Number(j.propertyId) === property.id)
        : jobs,
    [jobs, property?.id]
  );

  const snapshot = useMemo(
    () =>
      buildHomeUpdatesSnapshot({
        property,
        health,
        jobs: propertyJobs,
        prefs: health.homeUpdateState || null,
      }),
    [property, health, propertyJobs]
  );

  const { isPro, requestFeature, openUpgrade } = useProFeature();

  function selectHub(next: PropertyCareSection) {
    const tab = CARE_HUB_TABS.find((t) => t.id === next);
    if (tab?.proFeature && !requestFeature(tab.proFeature, "property-care")) return;
    setHub(next);
  }

  useEffect(() => {
    if (!isPro && hub === "maintenance") {
      requestFeature("maintenance_calendar", "property-care");
      setHub("passport");
    }
  }, [hub, isPro, requestFeature]);

  function selectProperty(id: number) {
    setSelectedId(id);
    onPropertySelect?.(id);
  }

  function resetAddHomeForm() {
    setNewLabel("");
    setNewAddress("");
    setNewAddressLine2("");
    setNewCity("");
    setNewState("");
    setNewZip("");
    setAddHomeError(null);
    setNewHomeVerification({ status: "unverified", addressVerified: false });
  }

  function openAddHome() {
    resetAddHomeForm();
    setShowAddHome(true);
  }

  async function submitAddHome(e: FormEvent) {
    e.preventDefault();
    const structured = {
      addressLine1: newAddress.trim(),
      addressLine2: newAddressLine2.trim(),
      city: newCity.trim(),
      state: normalizeUsStateCode(newState),
      zip: newZip.trim(),
    };
    if (!isAddressComplete(structured) || !isValidUsZip(structured.zip)) {
      setAddHomeError("Address line 1, city, state, and a valid ZIP code are required.");
      return;
    }
    setAddHomeError(null);
    setSavingHome(true);
    let created: Property | null = null;
    try {
    created = await onAddProperty({
      addressLine1: structured.addressLine1,
      addressLine2: structured.addressLine2 || undefined,
      city: structured.city,
      state: structured.state,
      zip: normalizeZip(structured.zip),
      label: newLabel.trim() || undefined,
      addressVerified: newHomeVerification.addressVerified,
      postalCodePlus4: newHomeVerification.postalCodePlus4 || undefined,
    });
    if (!created) {
      setAddHomeError("Could not add this home. Check the address and try again.");
      return;
    }
    setShowAddHome(false);
    resetAddHomeForm();
    selectProperty(created.id);
    } finally {
      setSavingHome(false);
    }
  }

  const propertyBar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
        {properties.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => selectProperty(p.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              property?.id === p.id
                ? "border-primary bg-primary text-white"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            <Home className="h-3.5 w-3.5 shrink-0 opacity-80" />
            {propertyLabel(p)}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={openAddHome}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-primary/40 bg-primary/5 px-3.5 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/10 disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" />
        Add home
      </button>
    </div>
  );

  const addHomeModal = showAddHome ? (
    <form
      onSubmit={(e) => void submitAddHome(e)}
      className="grid gap-3 rounded-[1.5rem] border border-border bg-card p-5 sm:grid-cols-2"
    >
      <p className="text-sm font-semibold sm:col-span-2">Add a home to your Property Passport</p>
      <input
        className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm sm:col-span-2"
        placeholder="Label (e.g. Beach house)"
        value={newLabel}
        onChange={(e) => setNewLabel(e.target.value)}
      />
      <div className="sm:col-span-2">
        <VerifiedAddressFields
          idPrefix="passport-new-home"
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
          onVerificationChange={setNewHomeVerification}
          disabled={savingHome}
          zipRequired
        />
      </div>
      {addHomeError ? (
        <p className="text-sm text-destructive sm:col-span-2">{addHomeError}</p>
      ) : null}
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={savingHome}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {savingHome ? "Saving..." : "Save home"}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowAddHome(false);
            resetAddHomeForm();
          }}
          className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold"
        >
          Cancel
        </button>
      </div>
    </form>
  ) : null;

  if (propertiesLoading && !properties.length) {
    return (
      <section className="mx-auto max-w-5xl space-y-5">
        <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
          Property Passport
        </h1>
        <p className="text-sm text-muted-foreground">Loading your property...</p>
      </section>
    );
  }

  if (!properties.length) {
    return (
      <section className="mx-auto max-w-2xl space-y-5">
        <div className="rounded-[1.5rem] border border-dashed border-border bg-card/80 px-6 py-12 text-center">
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase">
            Property Passport
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Add your first home to build a Property Passport — everything FixBridge knows about each property.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={openAddHome}
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add your first home
          </button>
        </div>
        {addHomeModal}
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
          Property Passport
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a home, then add or edit details. AI insights and recommendations use the selected property.
        </p>
      </div>

      {propertyBar}
      {addHomeModal}

      {property ? (
        <p className="text-xs text-muted-foreground">
          Viewing <span className="font-medium text-foreground">{propertyLabel(property)}</span>
          {property.addressLine1 ? ` · ${property.addressLine1}` : ""}
        </p>
      ) : null}

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {CARE_HUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectHub(t.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
              hub === t.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.proFeature && !isPro ? <LockedProBadge compact className="scale-90" /> : null}
          </button>
        ))}
      </div>

      {hub === "hub" && (
        <HomeCareProHub
          properties={properties}
          selectedPropertyId={property?.id ?? null}
          jobs={jobs}
          onOpenPassport={() => {
            setHub("passport");
            setPassportSection("overview");
          }}
          onOpenMaintenance={() => selectHub("maintenance")}
          onOpenDocuments={() => {
            setHub("passport");
            setPassportSection("documents");
          }}
          onOpenJob={onOpenJob}
        />
      )}

      {hub === "passport" && (
        <HomeownerPropertyPassport
          properties={properties}
          property={property}
          jobs={propertyJobs}
          busy={busy}
          initialSection={passportSection}
          onSaveHealth={onSaveHealth}
          onSaveProperty={onSaveProperty}
          onRefresh={onRefresh}
          onOpenJob={onOpenJob}
        />
      )}

      {hub === "maintenance" && (
        <div className="space-y-6">
          {isPro ? (
            <>
              <HomeownerMaintenanceTimeline
                properties={properties}
                jobs={jobs}
                embedded
                hidePropertyPicker
                selectedPropertyId={property?.id ?? null}
                onSelectedPropertyIdChange={selectProperty}
                onOpenJob={onOpenJob}
              />
              <p className="text-xs text-muted-foreground">
                Maintenance and reminders are scoped to the selected home above.
              </p>
            </>
          ) : (
            <ProLockedShell
              feature="maintenance_calendar"
              onUnlock={() => openUpgrade("maintenance_calendar", "property-care")}
            />
          )}
        </div>
      )}

      {hub === "reminders" && (
        <HomeownerHomeUpdates
          property={property}
          health={health}
          jobs={propertyJobs}
          busy={busy}
          onSaveHealth={async (next) => {
            if (!property?.id) return;
            await onSaveHealth(property.id, next);
          }}
          onRequestService={onRequestService}
          onOpenProperty={() => {
            setHub("passport");
            setPassportSection("overview");
          }}
        />
      )}

      {hub === "reminders" && snapshot.items.length > 0 ? (
        <p className="text-center text-xs text-muted-foreground">
          {snapshot.summary.needsAttention} item(s) need attention · {snapshot.summary.upToDate} up to date
        </p>
      ) : null}
    </section>
  );
}
