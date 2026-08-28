import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  FileText,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import type { HomeSystemRecord, ManagedJob, Property, PropertyDocument, PropertyDocumentExtraction } from "./managedJobs";
import {
  addPropertyDocument,
  analyzePropertyDocument,
  applyPropertyDocumentExtract,
  deletePropertyDocument,
  updateProperty,
} from "./managedJobs";
import { normalizeHealthProfile, type PropertyHealthProfile } from "./homeownerPropertyHealth";
import { useProFeature } from "./ProFeatureProvider";
import LockedProBadge from "./LockedProBadge";
import ProLockedShell from "./ProLockedShell";
import type { ProFeatureId } from "./proFeatures";
import HomeownerServiceHistory from "./HomeownerServiceHistory";
import PropertyTimelinePanel from "./PropertyTimelinePanel";
import {
  confirmMemorySuggestion,
  ignoreMemorySuggestion,
  listMemorySuggestions,
  type MemorySuggestion,
} from "./homeAssistantApi";
import {
  ADD_INFORMATION_OPTIONS,
  APPLIANCE_TYPES,
  LOCATION_PRESETS,
  PASSPORT_SECTIONS,
  PROPERTY_TYPE_OPTIONS,
  SYSTEM_EQUIPMENT_TYPES,
  buildPassportSummary,
  completedServiceJobs,
  defaultApplianceRecord,
  defaultSystemRecord,
  docsForEquipment,
  formatPropertyAddress,
  hasEquipmentData,
  homeDetailsFromProperty,
  isProPassportSection,
  mergeEquipmentLists,
  mergePassportIntoHealth,
  newId,
  normalizePassportData,
  serviceHistoryForEquipment,
  sourceLabel,
  warrantyStatus,
  type AddInformationKind,
  type ImportantLocation,
  type PassportHomeDetails,
  type PassportWarranty,
  type PropertyPassportSection,
} from "./propertyPassport";

function FieldRow({
  label,
  value,
  onAdd,
  onEdit,
}: {
  label: string;
  value?: string | null;
  onAdd?: () => void;
  onEdit?: () => void;
}) {
  const has = Boolean(value?.trim());
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-0.5 text-sm ${has ? "font-medium" : "text-muted-foreground italic"}`}>
          {has ? value : "Not added"}
        </p>
      </div>
      {has ? (
        onEdit ? (
          <button type="button" onClick={onEdit} className="shrink-0 text-xs font-semibold text-primary">
            Edit
          </button>
        ) : null
      ) : onAdd ? (
        <button type="button" onClick={onAdd} className="shrink-0 text-xs font-semibold text-primary">
          Add
        </button>
      ) : null}
    </div>
  );
}

function SectionCard({
  title,
  description,
  onClick,
  count,
  locked,
}: {
  title: string;
  description: string;
  onClick: () => void;
  count?: number;
  locked?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-[1.25rem] border border-border/70 bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:bg-muted/20"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{title}</p>
          {locked ? <LockedProBadge compact /> : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        {count != null && count > 0 ? (
          <p className="mt-1 text-[11px] font-semibold text-primary">{count} recorded</p>
        ) : null}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function SourcedValue({ label, value, source, confirmed }: { label: string; value?: string; source?: string; confirmed?: boolean }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
      {source ? (
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {sourceLabel(source as never)}
          {confirmed ? " · ✓ Confirmed" : " · Pending confirmation"}
        </p>
      ) : null}
    </div>
  );
}

export default function HomeownerPropertyPassport({
  properties,
  property,
  jobs,
  busy,
  onSaveHealth,
  onSaveProperty,
  onRefresh,
  onOpenJob,
  initialSection = "overview",
}: {
  properties: Property[];
  property: Property | null;
  jobs: ManagedJob[];
  busy?: boolean;
  onSaveHealth: (propertyId: number, next: PropertyHealthProfile) => Promise<void> | void;
  onSaveProperty: (propertyId: number, body: Partial<Property> & { homeSystems?: HomeSystemRecord[] }) => Promise<boolean>;
  onRefresh: () => Promise<void>;
  onOpenJob: (jobId: number) => void;
  initialSection?: PropertyPassportSection;
}) {
  const [section, setSection] = useState<PropertyPassportSection>(initialSection);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [editingHomeDetails, setEditingHomeDetails] = useState(false);
  const [homeDetailsDraft, setHomeDetailsDraft] = useState<PassportHomeDetails>({});
  const [editingEquipment, setEditingEquipment] = useState<HomeSystemRecord | null>(null);
  const [equipmentDraft, setEquipmentDraft] = useState<HomeSystemRecord | null>(null);
  const [viewEquipment, setViewEquipment] = useState<HomeSystemRecord | null>(null);
  const [editingLocation, setEditingLocation] = useState<ImportantLocation | null>(null);
  const [locationDraft, setLocationDraft] = useState<ImportantLocation | null>(null);
  const [editingWarranty, setEditingWarranty] = useState<PassportWarranty | null>(null);
  const [warrantyDraft, setWarrantyDraft] = useState<PassportWarranty | null>(null);
  const [editingPropertyAddress, setEditingPropertyAddress] = useState(false);
  const [addressDraft, setAddressDraft] = useState({ line1: "", line2: "", city: "", state: "", zip: "" });
  const [extractDoc, setExtractDoc] = useState<PropertyDocument | null>(null);
  const [extractDraft, setExtractDraft] = useState<PropertyDocumentExtraction | null>(null);
  const [extractBusy, setExtractBusy] = useState(false);
  const [memorySuggestions, setMemorySuggestions] = useState<MemorySuggestion[]>([]);
  const [docCategory, setDocCategory] = useState("warranty");
  const [docTitle, setDocTitle] = useState("");
  const [docSystemKey, setDocSystemKey] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { isPro, requestFeature, openUpgrade } = useProFeature();

  function proFeatureForSection(id: PropertyPassportSection): ProFeatureId {
    if (id === "maintenance") return "maintenance_calendar";
    if (id === "documents" || id === "warranties") return "document_vault";
    return "document_vault";
  }

  function openSection(id: PropertyPassportSection) {
    if (isProPassportSection(id) && !requestFeature(proFeatureForSection(id), "property-passport")) return;
    setSection(id);
  }

  useEffect(() => {
    if (!property?.id || !isPro) {
      setMemorySuggestions([]);
      return;
    }
    void listMemorySuggestions(property.id).then((r) => {
      if (r.ok && r.suggestions) setMemorySuggestions(r.suggestions);
    });
  }, [property?.id, isPro]);

  useEffect(() => {
    if (isProPassportSection(initialSection) && !isPro) {
      requestFeature(proFeatureForSection(initialSection), "property-passport");
      setSection("overview");
      return;
    }
    setSection(initialSection);
  }, [initialSection, isPro, requestFeature]);

  const health = useMemo(
    () => normalizeHealthProfile(property?.healthProfile as PropertyHealthProfile | null),
    [property?.healthProfile]
  );
  const passport = useMemo(() => normalizePassportData(health), [health]);
  const homeDetails = useMemo(() => homeDetailsFromProperty(property, passport), [property, passport]);
  const systems = useMemo(() => mergeEquipmentLists(property?.homeSystems, "system"), [property?.homeSystems]);
  const appliances = useMemo(() => mergeEquipmentLists(property?.homeSystems, "appliance"), [property?.homeSystems]);
  const summary = useMemo(() => buildPassportSummary(property, health, jobs), [property, health, jobs]);
  const serviceJobs = useMemo(() => completedServiceJobs(jobs, property?.id ?? null), [jobs, property?.id]);

  function openHomeDetailsEdit() {
    setHomeDetailsDraft({ ...homeDetails });
    setEditingHomeDetails(true);
  }

  async function saveHomeDetails() {
    if (!property?.id) return;
    const nextHealth = mergePassportIntoHealth(health, {
      ...passport,
      homeDetails: homeDetailsDraft,
    });
    await onSaveHealth(property.id, nextHealth);
    await onSaveProperty(property.id, {
      propertyType: homeDetailsDraft.propertyType || property.propertyType,
      yearBuilt: homeDetailsDraft.yearBuilt ? Number(homeDetailsDraft.yearBuilt) : null,
      beds: homeDetailsDraft.bedrooms ? Number(homeDetailsDraft.bedrooms) : null,
      baths: homeDetailsDraft.bathrooms ? Number(homeDetailsDraft.bathrooms) : null,
      sqft: homeDetailsDraft.squareFootage ? Number(homeDetailsDraft.squareFootage) : null,
      accessNotes: homeDetailsDraft.otherNotes || property.accessNotes,
    });
    setEditingHomeDetails(false);
  }

  function openEquipmentEdit(eq: HomeSystemRecord) {
    setEquipmentDraft({ ...eq });
    setEditingEquipment(eq);
  }

  async function saveEquipment() {
    if (!property?.id || !equipmentDraft) return;
    const isApp = equipmentDraft.category === "appliance";
    const list = isApp ? appliances : systems;
    const nextList = list.map((s) => (s.key === equipmentDraft.key ? equipmentDraft : s));
    const other = isApp ? systems : appliances;
    const ok = await onSaveProperty(property.id, { homeSystems: [...other, ...nextList] });
    if (ok) {
      setEditingEquipment(null);
      setEquipmentDraft(null);
    }
  }

  async function addEquipment(kind: "system" | "appliance", typeKey?: string) {
    if (!property?.id) return;
    const types = kind === "system" ? SYSTEM_EQUIPMENT_TYPES : APPLIANCE_TYPES;
    const type = types.find((t) => t.key === typeKey) || types[0];
    const record = kind === "system" ? defaultSystemRecord(type) : defaultApplianceRecord(type);
    const other = kind === "system" ? appliances : systems;
    const list = kind === "system" ? systems : appliances;
    if (list.some((s) => s.key === record.key && hasEquipmentData(s))) {
      openEquipmentEdit(list.find((s) => s.key === record.key)!);
      return;
    }
    setEquipmentDraft(record);
    setEditingEquipment(record);
  }

  function openLocationEdit(loc?: ImportantLocation) {
    const draft = loc || { id: newId("loc"), name: "", description: "" };
    setLocationDraft(draft);
    setEditingLocation(loc || { id: draft.id, name: "", description: "" });
  }

  async function saveLocation() {
    if (!property?.id || !locationDraft?.name.trim()) return;
    const existing = passport.importantLocations || [];
    const idx = existing.findIndex((l) => l.id === locationDraft.id);
    const nextLocs = idx >= 0 ? existing.map((l, i) => (i === idx ? locationDraft : l)) : [...existing, locationDraft];
    const nextHealth = mergePassportIntoHealth(health, { ...passport, importantLocations: nextLocs });
    await onSaveHealth(property.id, nextHealth);
    setEditingLocation(null);
    setLocationDraft(null);
  }

  function openWarrantyEdit(w?: PassportWarranty) {
    const draft = w || { id: newId("warr"), name: "" };
    setWarrantyDraft(draft);
    setEditingWarranty(w || { id: draft.id, name: "" });
  }

  async function saveWarranty() {
    if (!property?.id || !warrantyDraft?.name.trim()) return;
    const existing = passport.warranties || [];
    const idx = existing.findIndex((w) => w.id === warrantyDraft.id);
    const next = idx >= 0 ? existing.map((w, i) => (i === idx ? warrantyDraft : w)) : [...existing, warrantyDraft];
    await onSaveHealth(property.id, mergePassportIntoHealth(health, { ...passport, warranties: next }));
    setEditingWarranty(null);
    setWarrantyDraft(null);
  }

  function handleAddInformation(kind: AddInformationKind) {
    setShowAddMenu(false);
    if (kind === "home-details") {
      setSection("home-details");
      openHomeDetailsEdit();
    } else if (kind === "system") {
      setSection("systems");
      void addEquipment("system");
    } else if (kind === "appliance") {
      setSection("appliances");
      void addEquipment("appliance");
    } else if (kind === "warranty") {
      if (!requestFeature("document_vault", "property-passport")) return;
      setSection("warranties");
      openWarrantyEdit();
    } else if (kind === "location") {
      setSection("locations");
      openLocationEdit();
    } else if (kind === "document" || kind === "photo") {
      if (!requestFeature("document_vault", "property-passport")) return;
      setSection("documents");
      setDocCategory(kind === "photo" ? "photo_before" : "warranty");
      fileRef.current?.click();
    }
  }

  async function uploadDocument(file: File) {
    if (!property?.id) return;
    if (!requestFeature("document_vault", "property-passport")) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.readAsDataURL(file);
    });
    const r = await addPropertyDocument(property.id, {
      category: docCategory,
      title: docTitle || file.name,
      fileName: file.name,
      mimeType: file.type,
      dataUrl,
      systemKey: docSystemKey || undefined,
    });
    if (r.ok) {
      setDocTitle("");
      await onRefresh();
    }
  }

  async function runAnalyze(doc: PropertyDocument) {
    if (!property?.id) return;
    if (!requestFeature("property_aware_ai", "property-passport")) return;
    setExtractBusy(true);
    setExtractDoc(doc);
    try {
      const r = await analyzePropertyDocument(property.id, doc.id);
      if (r.ok && r.extraction) setExtractDraft(r.extraction);
    } finally {
      setExtractBusy(false);
    }
  }

  async function applyExtract() {
    if (!property?.id || !extractDoc || !extractDraft) return;
    setExtractBusy(true);
    try {
      await applyPropertyDocumentExtract(property.id, extractDoc.id, extractDraft);
      setExtractDoc(null);
      setExtractDraft(null);
      await onRefresh();
    } finally {
      setExtractBusy(false);
    }
  }

  function renderEquipmentCard(eq: HomeSystemRecord, kind: "system" | "appliance") {
    const has = hasEquipmentData(eq);
    const history = serviceHistoryForEquipment(jobs, property?.id ?? null, eq, health.previousServices);
    return (
      <article key={eq.key} className="rounded-[1.25rem] border border-border/70 bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{eq.name}</p>
            {has ? (
              <>
                {eq.brand ? <p className="mt-1 text-sm">{eq.brand}</p> : null}
                {eq.model ? <p className="text-xs text-muted-foreground">Model: {eq.model}</p> : null}
                {eq.filterSize ? <p className="text-xs text-muted-foreground">Filter: {eq.filterSize}</p> : null}
                {eq.installedYear ? (
                  <p className="mt-1 text-xs text-muted-foreground">Installed: {eq.installedYear}</p>
                ) : null}
                {eq.lastService ? (
                  <p className="text-xs text-muted-foreground">Last service: {eq.lastService}</p>
                ) : null}
                {eq.warrantyUntil ? (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    Warranty: active until {eq.warrantyUntil}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground italic">No information added yet.</p>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {has ? (
            <>
              <button
                type="button"
                onClick={() => setViewEquipment(eq)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
              >
                View Details
              </button>
              <button
                type="button"
                onClick={() => openEquipmentEdit(eq)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
              >
                Edit
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => openEquipmentEdit(eq)}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Plus className="h-3 w-3" /> Add {eq.name}
            </button>
          )}
          {history.length > 0 ? (
            <span className="self-center text-[10px] text-muted-foreground">{history.length} service record(s)</span>
          ) : null}
        </div>
      </article>
    );
  }

  const sectionNav = section !== "overview";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {sectionNav ? (
            <button
              type="button"
              onClick={() => setSection("overview")}
              className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Property Passport
            </button>
          ) : null}
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Property Passport
          </p>
          <h2 className="[font-family:'Barlow_Condensed',sans-serif] text-2xl font-black uppercase tracking-tight sm:text-3xl">
            {section === "overview" ? "Everything we know about this home" : PASSPORT_SECTIONS.find((s) => s.id === section)?.label}
          </h2>
          {property ? (
            <div className="mt-2 text-sm text-muted-foreground whitespace-pre-line">
              {formatPropertyAddress(property)}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowAddMenu(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#FF6B2C] px-3.5 py-2 text-xs font-semibold text-white shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" /> Add Home Information
          </button>
          {property ? (
            <button
              type="button"
              onClick={() => {
                setAddressDraft({
                  line1: property.addressLine1 || "",
                  line2: property.addressLine2 || "",
                  city: property.city || "",
                  state: property.state || "",
                  zip: property.zip || "",
                });
                setEditingPropertyAddress(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-semibold hover:bg-muted"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit Property
            </button>
          ) : null}
        </div>
      </div>

      {section === "overview" && property ? (
        <>
          {memorySuggestions.length > 0 ? (
            <div className="space-y-2 rounded-[1.25rem] border border-primary/30 bg-primary/5 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" /> Suggested updates for Property Passport
              </p>
              {memorySuggestions.map((sug) => {
                const eq = sug.payload?.equipment || {};
                return (
                  <div key={sug.id} className="rounded-xl border border-border/70 bg-card p-3 text-sm">
                    <p className="font-medium">{String(eq.name || sug.payload?.jobTitle || "Equipment update")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[eq.manufacturer, eq.model, eq.serial, eq.filterSize].filter(Boolean).join(" · ") || "Review details before saving."}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                        onClick={() =>
                          void confirmMemorySuggestion(property.id, sug.id).then((r) => {
                            if (r.ok) {
                              setMemorySuggestions((prev) => prev.filter((x) => x.id !== sug.id));
                              void onRefresh();
                            }
                          })
                        }
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
                        onClick={() =>
                          void ignoreMemorySuggestion(property.id, sug.id).then((r) => {
                            if (r.ok) setMemorySuggestions((prev) => prev.filter((x) => x.id !== sug.id));
                          })
                        }
                      >
                        Ignore
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="grid gap-2 rounded-[1.25rem] border border-border/70 bg-muted/20 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {summary.systemsCount > 0 ? <p>{summary.systemsCount} systems recorded</p> : null}
            {summary.appliancesCount > 0 ? <p>{summary.appliancesCount} appliances</p> : null}
            {summary.activeWarranties > 0 ? <p>{summary.activeWarranties} active warranties</p> : null}
            {summary.serviceRecords > 0 ? <p>{summary.serviceRecords} service records</p> : null}
            {summary.documentsCount > 0 ? <p>{summary.documentsCount} photos/documents</p> : null}
            {summary.maintenanceUpcoming > 0 ? (
              <p>{summary.maintenanceUpcoming} maintenance items coming up</p>
            ) : null}
            {!summary.systemsCount &&
            !summary.appliancesCount &&
            !summary.serviceRecords &&
            !summary.documentsCount ? (
              <p className="text-muted-foreground col-span-full">
                Start building your passport — add home details, systems, or upload a document.
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {PASSPORT_SECTIONS.filter((s) => s.id !== "overview").map((s) => (
              <SectionCard
                key={s.id}
                title={s.label}
                description={s.description}
                onClick={() => openSection(s.id)}
                locked={isProPassportSection(s.id) && !isPro}
                count={
                  s.id === "systems"
                    ? summary.systemsCount
                    : s.id === "appliances"
                      ? summary.appliancesCount
                      : s.id === "warranties"
                        ? summary.activeWarranties
                        : s.id === "documents"
                          ? summary.documentsCount
                          : s.id === "service-history"
                            ? summary.serviceRecords
                            : undefined
                }
              />
            ))}
          </div>
        </>
      ) : null}

      {section === "home-details" && (
        <div className="rounded-[1.25rem] border border-border/70 bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Home Details</p>
            <button type="button" onClick={openHomeDetailsEdit} className="text-xs font-semibold text-primary">
              Edit
            </button>
          </div>
          <FieldRow label="Property Type" value={homeDetails.propertyType} onAdd={openHomeDetailsEdit} onEdit={openHomeDetailsEdit} />
          <FieldRow label="Year Built" value={homeDetails.yearBuilt} onAdd={openHomeDetailsEdit} onEdit={openHomeDetailsEdit} />
          <FieldRow label="Square Footage" value={homeDetails.squareFootage ? `${homeDetails.squareFootage} sq ft` : ""} onAdd={openHomeDetailsEdit} onEdit={openHomeDetailsEdit} />
          <FieldRow label="Bedrooms" value={homeDetails.bedrooms} onAdd={openHomeDetailsEdit} onEdit={openHomeDetailsEdit} />
          <FieldRow label="Bathrooms" value={homeDetails.bathrooms} onAdd={openHomeDetailsEdit} onEdit={openHomeDetailsEdit} />
          <FieldRow label="Floors" value={homeDetails.floors} onAdd={openHomeDetailsEdit} onEdit={openHomeDetailsEdit} />
          <FieldRow label="Basement" value={homeDetails.basement} onAdd={openHomeDetailsEdit} onEdit={openHomeDetailsEdit} />
          <FieldRow label="Garage" value={homeDetails.garage} onAdd={openHomeDetailsEdit} onEdit={openHomeDetailsEdit} />
          <FieldRow label="Heating Type" value={homeDetails.heatingType} onAdd={openHomeDetailsEdit} onEdit={openHomeDetailsEdit} />
          <FieldRow label="Cooling Type" value={homeDetails.coolingType} onAdd={openHomeDetailsEdit} onEdit={openHomeDetailsEdit} />
          <FieldRow label="Roof Type" value={homeDetails.roofType} onAdd={openHomeDetailsEdit} onEdit={openHomeDetailsEdit} />
          <FieldRow label="Utility Notes" value={homeDetails.utilityNotes} onAdd={openHomeDetailsEdit} onEdit={openHomeDetailsEdit} />
        </div>
      )}

      {section === "systems" && (
        <div className="space-y-3">
          {systems.map((eq) => renderEquipmentCard(eq, "system"))}
          <button
            type="button"
            onClick={() => void addEquipment("system")}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm font-semibold text-primary hover:bg-muted/30"
          >
            <Plus className="h-4 w-4" /> Add Equipment
          </button>
        </div>
      )}

      {section === "appliances" && (
        <div className="space-y-3">
          {appliances.map((eq) => renderEquipmentCard(eq, "appliance"))}
          <button
            type="button"
            onClick={() => void addEquipment("appliance")}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm font-semibold text-primary hover:bg-muted/30"
          >
            <Plus className="h-4 w-4" /> Add Appliance
          </button>
        </div>
      )}

      {section === "locations" && (
        <div className="space-y-3">
          {(passport.importantLocations || []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No important locations recorded yet.
            </p>
          ) : (
            (passport.importantLocations || []).map((loc) => (
              <article key={loc.id} className="rounded-[1.25rem] border border-border/70 bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{loc.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{loc.description || "No description"}</p>
                  </div>
                  <button type="button" onClick={() => openLocationEdit(loc)} className="text-xs font-semibold text-primary">
                    Edit
                  </button>
                </div>
              </article>
            ))
          )}
          <button
            type="button"
            onClick={() => openLocationEdit()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm font-semibold text-primary"
          >
            <MapPin className="h-4 w-4" /> Add Important Location
          </button>
        </div>
      )}

      {section === "warranties" && !isPro ? (
        <ProLockedShell
          feature="document_vault"
          onUnlock={() => openUpgrade("document_vault", "property-passport")}
        />
      ) : null}

      {section === "warranties" && isPro ? (
        <div className="space-y-3">
          {(passport.warranties || []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No warranties recorded yet.
            </p>
          ) : (
            (passport.warranties || []).map((w) => {
              const st = warrantyStatus(w);
              return (
                <article key={w.id} className="rounded-[1.25rem] border border-border/70 bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{w.name}</p>
                      {w.expirationDate ? (
                        <p className="mt-1 text-sm text-muted-foreground">Expires: {w.expirationDate}</p>
                      ) : null}
                      {w.coverage ? <p className="text-xs text-muted-foreground">Coverage: {w.coverage}</p> : null}
                      <span
                        className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          st === "active"
                            ? "bg-emerald-500/10 text-emerald-700"
                            : st === "expired"
                              ? "bg-red-500/10 text-red-700"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {st}
                      </span>
                    </div>
                    <button type="button" onClick={() => openWarrantyEdit(w)} className="text-xs font-semibold text-primary">
                      Edit
                    </button>
                  </div>
                </article>
              );
            })
          )}
          <button
            type="button"
            onClick={() => openWarrantyEdit()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm font-semibold text-primary"
          >
            <Plus className="h-4 w-4" /> Add Warranty
          </button>
        </div>
      ) : null}

      {section === "documents" && property && !isPro ? (
        <ProLockedShell
          feature="document_vault"
          onUnlock={() => openUpgrade("document_vault", "property-passport")}
        />
      ) : null}

      {section === "documents" && property && isPro ? (
        <div className="space-y-4">
          <div className="rounded-[1.25rem] border border-border/70 bg-card p-4">
            <p className="text-sm font-semibold">Upload document or photo</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-xs">
                Category
                <select
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={docCategory}
                  onChange={(e) => setDocCategory(e.target.value)}
                >
                  <option value="warranty">Warranty</option>
                  <option value="receipt">Receipt</option>
                  <option value="manual">Manual</option>
                  <option value="inspection">Inspection</option>
                  <option value="photo_before">Equipment photo</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                Link to
                <select
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={docSystemKey}
                  onChange={(e) => setDocSystemKey(e.target.value)}
                >
                  <option value="">Entire Property</option>
                  {[...systems, ...appliances].map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadDocument(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white"
            >
              <Camera className="h-4 w-4" /> Choose file
            </button>
          </div>
          <div className="space-y-2">
            {(property.documents || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents or photos yet.</p>
            ) : (
              (property.documents || []).map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{doc.title || doc.fileName || "Document"}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {doc.category}
                      {doc.systemKey ? ` · ${doc.systemKey}` : " · Entire property"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => void runAnalyze(doc)}
                      className="text-xs font-semibold text-primary"
                    >
                      AI scan
                    </button>
                    <button
                      type="button"
                      onClick={() => void deletePropertyDocument(property.id, doc.id).then(() => onRefresh())}
                      className="text-xs font-semibold text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {section === "service-history" && property ? (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Unified property timeline — jobs, recurring visits, documents, and completed care in one place.
          </p>
          <PropertyTimelinePanel propertyId={property.id} onOpenJob={onOpenJob} />
          <HomeownerServiceHistory
            jobs={serviceJobs}
            properties={property ? [property] : properties}
            onOpenTracking={onOpenJob}
            embedded
          />
        </div>
      ) : null}

      {section === "maintenance" && !isPro ? (
        <ProLockedShell
          feature="maintenance_calendar"
          onUnlock={() => openUpgrade("maintenance_calendar", "property-passport")}
        />
      ) : null}

      {section === "maintenance" && isPro ? (
        <div className="rounded-[1.25rem] border border-border/70 bg-card divide-y divide-border">
          {(health.maintenance || []).length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">No maintenance items scheduled yet.</p>
          ) : (
            (health.maintenance || []).map((m) => (
              <div key={`${m.label}-${m.dueDate}`} className="px-5 py-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">{m.dueDate || "Upcoming"}</p>
                <p className="font-semibold">{m.label}</p>
                {m.system ? <p className="text-xs text-muted-foreground">{m.system}</p> : null}
              </div>
            ))
          )}
        </div>
      ) : null}

      {/* Add information menu */}
      {showAddMenu ? (
        <ModalShell onClose={() => setShowAddMenu(false)} title="What would you like to add?">
          <div className="grid gap-2">
            {ADD_INFORMATION_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleAddInformation(opt.id)}
                className="rounded-xl border border-border px-4 py-3 text-left text-sm font-semibold hover:bg-muted"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </ModalShell>
      ) : null}

      {/* Home details edit */}
      {editingHomeDetails ? (
        <ModalShell onClose={() => setEditingHomeDetails(false)} title="Edit Home Details">
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void saveHomeDetails();
            }}
          >
            <SelectField label="Property Type" value={homeDetailsDraft.propertyType || ""} onChange={(v) => setHomeDetailsDraft({ ...homeDetailsDraft, propertyType: v })} options={PROPERTY_TYPE_OPTIONS} />
            {(["yearBuilt", "squareFootage", "bedrooms", "bathrooms", "floors", "basement", "garage", "heatingType", "coolingType", "roofType"] as const).map((field) => (
              <TextField
                key={field}
                label={field.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                value={homeDetailsDraft[field] || ""}
                onChange={(v) => setHomeDetailsDraft({ ...homeDetailsDraft, [field]: v })}
              />
            ))}
            <TextAreaField label="Utility Notes" value={homeDetailsDraft.utilityNotes || ""} onChange={(v) => setHomeDetailsDraft({ ...homeDetailsDraft, utilityNotes: v })} />
            <FormActions busy={busy} onCancel={() => setEditingHomeDetails(false)} />
          </form>
        </ModalShell>
      ) : null}

      {/* Equipment edit */}
      {editingEquipment && equipmentDraft ? (
        <ModalShell onClose={() => setEditingEquipment(null)} title={`Edit ${equipmentDraft.name}`}>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEquipment();
            }}
          >
            <TextField label="Brand / Manufacturer" value={equipmentDraft.brand || ""} onChange={(v) => setEquipmentDraft({ ...equipmentDraft, brand: v })} />
            <TextField label="Model" value={equipmentDraft.model || ""} onChange={(v) => setEquipmentDraft({ ...equipmentDraft, model: v, modelSource: "homeowner", modelConfirmed: true })} />
            <TextField label="Serial Number" value={equipmentDraft.serialNumber || ""} onChange={(v) => setEquipmentDraft({ ...equipmentDraft, serialNumber: v, serialSource: "homeowner", serialConfirmed: true })} />
            <TextField label="Installation Date" value={String(equipmentDraft.installedYear || equipmentDraft.installationDate || "")} onChange={(v) => setEquipmentDraft({ ...equipmentDraft, installedYear: v, installationDate: v })} placeholder="YYYY or YYYY-MM-DD" />
            <TextField label="Filter Size" value={equipmentDraft.filterSize || ""} onChange={(v) => setEquipmentDraft({ ...equipmentDraft, filterSize: v })} />
            <TextField label="Location in Home" value={equipmentDraft.location || ""} onChange={(v) => setEquipmentDraft({ ...equipmentDraft, location: v })} />
            <TextField label="Warranty Until" value={equipmentDraft.warrantyUntil || ""} onChange={(v) => setEquipmentDraft({ ...equipmentDraft, warrantyUntil: v })} />
            <TextAreaField label="Notes" value={equipmentDraft.notes || ""} onChange={(v) => setEquipmentDraft({ ...equipmentDraft, notes: v })} />
            <FormActions busy={busy} onCancel={() => setEditingEquipment(null)} />
          </form>
        </ModalShell>
      ) : null}

      {/* Equipment detail view */}
      {viewEquipment ? (
        <ModalShell onClose={() => setViewEquipment(null)} title={viewEquipment.name}>
          <div className="space-y-4 text-sm">
            <SourcedValue label="Model" value={viewEquipment.model} source={viewEquipment.modelSource} confirmed={viewEquipment.modelConfirmed} />
            <SourcedValue label="Serial" value={viewEquipment.serialNumber} source={viewEquipment.serialSource} confirmed={viewEquipment.serialConfirmed} />
            {viewEquipment.brand ? <p><span className="text-muted-foreground">Brand:</span> {viewEquipment.brand}</p> : null}
            {viewEquipment.filterSize ? <p><span className="text-muted-foreground">Filter:</span> {viewEquipment.filterSize}</p> : null}
            {viewEquipment.location ? <p><span className="text-muted-foreground">Location:</span> {viewEquipment.location}</p> : null}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Service History</p>
              <ul className="mt-2 space-y-2">
                {serviceHistoryForEquipment(jobs, property?.id ?? null, viewEquipment, health.previousServices).map((h) => (
                  <li key={h.id} className="rounded-lg border border-border/60 px-3 py-2">
                    <p className="font-medium">{h.title}</p>
                    <p className="text-xs text-muted-foreground">{h.date} {h.subtitle ? `· ${h.subtitle}` : ""}</p>
                    {h.jobId ? (
                      <button type="button" className="mt-1 text-xs font-semibold text-primary" onClick={() => { setViewEquipment(null); onOpenJob(h.jobId!); }}>
                        View Job
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Documents</p>
              <p className="mt-1 text-muted-foreground">
                {docsForEquipment(property?.documents, viewEquipment.key).length} linked file(s)
              </p>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {/* Location edit */}
      {editingLocation && locationDraft ? (
        <ModalShell onClose={() => setEditingLocation(null)} title={editingLocation.name ? "Edit Location" : "Add Important Location"}>
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void saveLocation(); }}>
            <label className="grid gap-1 text-xs">
              Name
              <select
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={locationDraft.name}
                onChange={(e) => setLocationDraft({ ...locationDraft, name: e.target.value })}
              >
                <option value="">Select or type below</option>
                {LOCATION_PRESETS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <input
                className="mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={locationDraft.name}
                onChange={(e) => setLocationDraft({ ...locationDraft, name: e.target.value })}
                placeholder="Custom name"
              />
            </label>
            <TextAreaField label="Description / Directions" value={locationDraft.description || ""} onChange={(v) => setLocationDraft({ ...locationDraft, description: v })} />
            <FormActions busy={busy} onCancel={() => setEditingLocation(null)} />
          </form>
        </ModalShell>
      ) : null}

      {/* Warranty edit */}
      {editingWarranty && warrantyDraft ? (
        <ModalShell onClose={() => setEditingWarranty(null)} title={editingWarranty.name ? "Edit Warranty" : "Add Warranty"}>
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void saveWarranty(); }}>
            <TextField label="Name" value={warrantyDraft.name} onChange={(v) => setWarrantyDraft({ ...warrantyDraft, name: v })} />
            <TextField label="Provider / Manufacturer" value={warrantyDraft.provider || ""} onChange={(v) => setWarrantyDraft({ ...warrantyDraft, provider: v })} />
            <TextField label="Related Equipment" value={warrantyDraft.equipmentLabel || ""} onChange={(v) => setWarrantyDraft({ ...warrantyDraft, equipmentLabel: v })} />
            <TextField label="Start Date" value={warrantyDraft.startDate || ""} onChange={(v) => setWarrantyDraft({ ...warrantyDraft, startDate: v })} />
            <TextField label="Expiration Date" value={warrantyDraft.expirationDate || ""} onChange={(v) => setWarrantyDraft({ ...warrantyDraft, expirationDate: v })} />
            <TextField label="Coverage" value={warrantyDraft.coverage || ""} onChange={(v) => setWarrantyDraft({ ...warrantyDraft, coverage: v })} />
            <TextAreaField label="Notes" value={warrantyDraft.notes || ""} onChange={(v) => setWarrantyDraft({ ...warrantyDraft, notes: v })} />
            <FormActions busy={busy} onCancel={() => setEditingWarranty(null)} />
          </form>
        </ModalShell>
      ) : null}

      {/* AI extraction */}
      {extractDoc && extractDraft ? (
        <ModalShell onClose={() => { setExtractDoc(null); setExtractDraft(null); }} title="We found the following details">
          <div className="space-y-2 text-sm">
            {extractDraft.manufacturer ? <p><span className="text-muted-foreground">Manufacturer:</span> {extractDraft.manufacturer}</p> : null}
            {extractDraft.model ? <p><span className="text-muted-foreground">Model:</span> {extractDraft.model}</p> : null}
            {extractDraft.serialNumber ? <p><span className="text-muted-foreground">Serial:</span> {extractDraft.serialNumber}</p> : null}
            {extractDraft.installYear ? <p><span className="text-muted-foreground">Install year:</span> {extractDraft.installYear}</p> : null}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Review before adding — existing confirmed information will not be overwritten.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={extractBusy} onClick={() => void applyExtract()} className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
              {extractBusy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null} Add to Property Passport
            </button>
            <button type="button" onClick={() => setExtractDraft({ ...extractDraft })} className="rounded-xl border border-border px-4 py-2 text-xs font-semibold">Edit</button>
            <button type="button" onClick={() => { setExtractDoc(null); setExtractDraft(null); }} className="rounded-xl border border-border px-4 py-2 text-xs font-semibold">Ignore</button>
          </div>
        </ModalShell>
      ) : null}

      {editingPropertyAddress && property ? (
        <ModalShell onClose={() => setEditingPropertyAddress(false)} title="Edit Property Address">
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void onSaveProperty(property.id, {
                addressLine1: addressDraft.line1,
                addressLine2: addressDraft.line2 || null,
                city: addressDraft.city,
                state: addressDraft.state,
                zip: addressDraft.zip,
              }).then((ok) => { if (ok) setEditingPropertyAddress(false); });
            }}
          >
            <TextField label="Address Line 1" value={addressDraft.line1} onChange={(v) => setAddressDraft({ ...addressDraft, line1: v })} />
            <TextField label="Apt / Unit" value={addressDraft.line2} onChange={(v) => setAddressDraft({ ...addressDraft, line2: v })} />
            <TextField label="City" value={addressDraft.city} onChange={(v) => setAddressDraft({ ...addressDraft, city: v })} />
            <TextField label="State" value={addressDraft.state} onChange={(v) => setAddressDraft({ ...addressDraft, state: v })} />
            <TextField label="ZIP" value={addressDraft.zip} onChange={(v) => setAddressDraft({ ...addressDraft, zip: v })} />
            <FormActions busy={busy} onCancel={() => setEditingPropertyAddress(false)} />
          </form>
        </ModalShell>
      ) : null}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[1.5rem] border border-border bg-card p-5 shadow-2xl sm:rounded-[1.5rem]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="grid gap-1 text-xs">
      {label}
      <input className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1 text-xs">
      {label}
      <textarea className="rounded-lg border border-border bg-background px-3 py-2 text-sm" rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <label className="grid gap-1 text-xs">
      {label}
      <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function FormActions({ busy, onCancel }: { busy?: boolean; onCancel: () => void }) {
  return (
    <div className="flex gap-2 pt-2">
      <button type="submit" disabled={busy} className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
        {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null} Save
      </button>
      <button type="button" onClick={onCancel} className="rounded-xl border border-border px-4 py-2 text-xs font-semibold">Cancel</button>
    </div>
  );
}
