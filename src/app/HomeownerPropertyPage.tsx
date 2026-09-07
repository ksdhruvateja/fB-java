import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Building2,
  CheckCircle2,
  FileText,
  Home,
  ImagePlus,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import {
  addPropertyDocument,
  analyzePropertyDocument,
  applyPropertyDocumentExtract,
  deletePropertyDocument,
  getPropertyDocument,
  updateProperty,
  type HomeSystemRecord,
  type Property,
  type PropertyDocument,
  type PropertyDocumentExtraction,
} from "./managedJobs";
import { isValidUsZip, normalizeZip } from "./zipCode";
import { VerifiedAddressFields, type AddressVerificationMeta } from "./VerifiedAddressInput";
import { normalizeUsStateCode } from "./UsLocationFields";
import { formatAddressLines, isAddressComplete } from "./addressFormat";

const DOC_CATEGORIES: { id: string; label: string }[] = [
  { id: "receipt", label: "Receipt" },
  { id: "warranty", label: "Warranty" },
  { id: "manual", label: "Manual" },
  { id: "invoice", label: "Invoice" },
  { id: "inspection", label: "Inspection report" },
  { id: "contractor", label: "Contractor record" },
  { id: "photo_before", label: "Before photo" },
  { id: "photo_after", label: "After photo" },
  { id: "other", label: "Other" },
];

export const DEFAULT_HOME_SYSTEMS: HomeSystemRecord[] = [
  { key: "hvac", name: "HVAC", brand: "", installedYear: "", warrantyUntil: "", lastService: "", notes: "" },
  { key: "water_heater", name: "Water Heater", brand: "", installedYear: "", warrantyUntil: "", lastService: "", notes: "" },
  { key: "roof", name: "Roof", brand: "", installedYear: "", warrantyUntil: "", lastService: "", notes: "" },
  { key: "refrigerator", name: "Refrigerator", brand: "", installedYear: "", warrantyUntil: "", lastService: "", notes: "" },
  { key: "dishwasher", name: "Dishwasher", brand: "", installedYear: "", warrantyUntil: "", lastService: "", notes: "" },
];

function formatSystemLine(s: HomeSystemRecord): string {
  const bits = [
    s.brand?.trim() || null,
    s.installedYear ? `Installed ${s.installedYear}` : null,
  ].filter(Boolean);
  return bits.join(" · ") || "Add brand & install year";
}

function formatDocDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const MAX_PASSPORT_FILE_BYTES = 3 * 1024 * 1024;

function inferMimeType(file: File): string {
  const type = (file.type || "").toLowerCase();
  if (type && type !== "application/octet-stream") return type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".doc")) return "application/msword";
  if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return type;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function dataUrlToObjectUrl(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  const meta = comma >= 0 ? dataUrl.slice(0, comma) : "";
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const mime = /data:([^;]+)/i.exec(meta)?.[1] || "application/octet-stream";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

export default function HomeownerPropertyPage({
  properties,
  propertiesLoading = false,
  busy,
  onBusy,
  onError,
  onRefresh,
  onCreateProperty,
  onPropertyUpdated,
  onReloadProperty,
}: {
  properties: Property[];
  propertiesLoading?: boolean;
  busy?: boolean;
  onBusy: (v: boolean) => void;
  onError: (msg: string | null) => void;
  onRefresh: () => Promise<void>;
  onCreateProperty?: (
    body: {
      addressLine1: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
      label?: string;
      homeSystems?: HomeSystemRecord[];
    },
    opts?: { makePrimary?: boolean; forReport?: boolean; analyzeHealth?: boolean }
  ) => Promise<{ ok: true; property: Property } | { ok: false; message?: string }>;
  onPropertyUpdated?: (property: Property) => Promise<void> | void;
  onReloadProperty?: (propertyId: number) => Promise<void> | void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(properties[0]?.id ?? null);
  const [editingFacts, setEditingFacts] = useState(false);
  const [editingSystems, setEditingSystems] = useState(false);
  const [showAddHome, setShowAddHome] = useState(false);

  const selected = useMemo(
    () => properties.find((p) => p.id === selectedId) || properties[0] || null,
    [properties, selectedId]
  );

  useEffect(() => {
    if (!selectedId && properties[0]) setSelectedId(properties[0].id);
    if (selectedId && !properties.some((p) => p.id === selectedId) && properties[0]) {
      setSelectedId(properties[0].id);
    }
  }, [properties, selectedId]);

  const [label, setLabel] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [yearBuilt, setYearBuilt] = useState("");
  const [beds, setBeds] = useState("");
  const [baths, setBaths] = useState("");
  const [sqft, setSqft] = useState("");
  const [systems, setSystems] = useState<HomeSystemRecord[]>([]);

  const [newAddress, setNewAddress] = useState("");
  const [newAddressLine2, setNewAddressLine2] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [newZip, setNewZip] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newHomeVerification, setNewHomeVerification] = useState<AddressVerificationMeta>({
    status: "unverified",
    addressVerified: false,
  });
  const [editVerification, setEditVerification] = useState<AddressVerificationMeta>({
    status: "unverified",
    addressVerified: false,
  });

  const [docCategory, setDocCategory] = useState("warranty");
  const [docTitle, setDocTitle] = useState("");
  const [docSystemKey, setDocSystemKey] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [extractDoc, setExtractDoc] = useState<PropertyDocument | null>(null);
  const [extractDraft, setExtractDraft] = useState<PropertyDocumentExtraction | null>(null);
  const [extractBusy, setExtractBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [savingFacts, setSavingFacts] = useState(false);
  const [savingSystems, setSavingSystems] = useState(false);
  const [savingHome, setSavingHome] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [localDocs, setLocalDocs] = useState<PropertyDocument[]>([]);
  const [removedDocIds, setRemovedDocIds] = useState<number[]>([]);

  const ALLOWED_DOC = /\.(pdf|jpe?g|png|doc|docx)$/i;

  useEffect(() => {
    if (!selected) return;
    setLabel(selected.label || "");
    setAddressLine1(selected.addressLine1 || "");
    setAddressLine2(selected.addressLine2 || "");
    setCity(selected.city || "");
    setState(selected.state || "");
    setZip(selected.zip || "");
    setYearBuilt(selected.yearBuilt != null ? String(selected.yearBuilt) : "");
    setBeds(selected.beds != null ? String(selected.beds) : "");
    setBaths(selected.baths != null ? String(selected.baths) : "");
    setSqft(selected.sqft != null ? String(selected.sqft) : "");
    const existing = selected.homeSystems?.length ? selected.homeSystems : DEFAULT_HOME_SYSTEMS;
    const byKey = new Map(existing.map((s) => [s.key || s.name, s]));
    setSystems(
      DEFAULT_HOME_SYSTEMS.map((d) => {
        const hit = byKey.get(d.key) || existing.find((s) => s.name === d.name);
        return hit ? { ...d, ...hit, key: d.key, name: d.name } : { ...d };
      }).concat(
        existing.filter((s) => !DEFAULT_HOME_SYSTEMS.some((d) => d.key === s.key || d.name === s.name))
      )
    );
    setEditingFacts(false);
    setEditingSystems(false);
    setRemovedDocIds([]);
    setPendingFile(null);
    setUploadError(null);
  }, [selected?.id]);

  async function saveFacts() {
    if (!selected) return;
    const structured = {
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2.trim(),
      city: city.trim(),
      state: normalizeUsStateCode(state),
      zip: zip.trim(),
    };
    if (!isAddressComplete(structured) || !isValidUsZip(structured.zip)) {
      onError("Address Line 1, City, State, and a valid ZIP Code are required.");
      return;
    }
    setSavingFacts(true);
    onError(null);
    try {
      const r = await updateProperty(selected.id, {
        label: label.trim() || selected.label || undefined,
        addressLine1: structured.addressLine1,
        addressLine2: structured.addressLine2 || null,
        city: structured.city,
        state: structured.state,
        zip: normalizeZip(structured.zip),
        addressVerified: editVerification.addressVerified,
        postalCodePlus4: editVerification.postalCodePlus4 || null,
        yearBuilt: yearBuilt ? Number(yearBuilt) : null,
        beds: beds ? Number(beds) : null,
        baths: baths ? Number(baths) : null,
        sqft: sqft ? Number(sqft) : null,
        homeSystems: systems,
      });
      if (!r.ok) {
        onError(r.message || "Could not save property.");
        return;
      }
      setEditingFacts(false);
      if (r.property && onPropertyUpdated) {
        await onPropertyUpdated(r.property);
      } else {
        await onRefresh();
      }
    } finally {
      setSavingFacts(false);
    }
  }

  async function saveSystems() {
    if (!selected) return;
    setSavingSystems(true);
    onError(null);
    try {
      const r = await updateProperty(selected.id, { homeSystems: systems });
      if (!r.ok) {
        onError(r.message || "Could not save home systems.");
        return;
      }
      setEditingSystems(false);
      if (r.property && onPropertyUpdated) {
        await onPropertyUpdated(r.property);
      } else {
        await onRefresh();
      }
    } finally {
      setSavingSystems(false);
    }
  }

  async function addHome(e: FormEvent) {
    e.preventDefault();
    const structured = {
      addressLine1: newAddress.trim(),
      addressLine2: newAddressLine2.trim(),
      city: newCity.trim(),
      state: normalizeUsStateCode(newState),
      zip: newZip.trim(),
    };
    if (!isAddressComplete(structured) || !isValidUsZip(structured.zip)) {
      onError("Address Line 1, City, State, and a valid ZIP Code are required.");
      return;
    }
    setSavingHome(true);
    onError(null);
    try {
      if (!onCreateProperty) {
        onError("Property creation is unavailable.");
        return;
      }
      const r = await onCreateProperty(
        {
          addressLine1: structured.addressLine1,
          addressLine2: structured.addressLine2 || undefined,
          city: structured.city,
          state: structured.state,
          zip: normalizeZip(structured.zip),
          addressVerified: newHomeVerification.addressVerified,
          postalCodePlus4: newHomeVerification.postalCodePlus4 || undefined,
          country: "US",
          label: newLabel.trim() || undefined,
          homeSystems: DEFAULT_HOME_SYSTEMS,
        },
        { analyzeHealth: true }
      );
      if (!r.ok) {
        onError(r.message || "Could not add home.");
        return;
      }
      setShowAddHome(false);
      setNewAddress("");
      setNewAddressLine2("");
      setNewCity("");
      setNewState("");
      setNewZip("");
      setNewLabel("");
      setSelectedId(r.property.id);
    } finally {
      setSavingHome(false);
    }
  }

  function chooseFile(file: File | null) {
    setUploadError(null);
    if (!file) {
      setPendingFile(null);
      return;
    }
    const okType = ALLOWED_DOC.test(file.name) || /^(image\/(jpeg|png)|application\/pdf|application\/msword|application\/vnd.openxmlformats-officedocument.wordprocessingml.document)$/i.test(file.type);
    if (!okType) {
      setPendingFile(null);
      setUploadError("Unsupported file type. Use PDF, JPG, JPEG, PNG, DOC, or DOCX.");
      return;
    }
    if (file.size > MAX_PASSPORT_FILE_BYTES) {
      setPendingFile(null);
      setUploadError("This file is too large. Maximum size is 3 MB.");
      return;
    }
    setPendingFile(file);
  }

  async function onUploadDoc(file: File | null = pendingFile) {
    if (!selected || !file || uploadBusy) return;
    setUploadBusy(true);
    setUploadError(null);
    onError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const r = await addPropertyDocument(selected.id, {
        category: docCategory,
        title: docTitle.trim() || file.name,
        fileName: file.name,
        mimeType: inferMimeType(file),
        dataUrl,
        systemKey: docSystemKey || undefined,
      });
      if (!r.ok || !r.document) {
        const msg = r.message || "Upload failed. Please try again.";
        setUploadError(
          /expired|authentication required|sign in/i.test(msg)
            ? "Your session expired. Please sign in again."
            : msg
        );
        return;
      }
      setLocalDocs((prev) => [r.document!, ...prev.filter((d) => d.id !== r.document!.id)]);
      setDocTitle("");
      setPendingFile(null);
    } catch (err) {
      const message = err instanceof Error && /abort/i.test(err.message)
        ? "Upload failed. Please try again."
        : err instanceof Error
          ? err.message
          : "Upload failed. Please try again.";
      setUploadError(message);
    } finally {
      setUploadBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function loadDocumentUrl(doc: PropertyDocument) {
    if (doc.dataUrl) return doc.dataUrl;
    if (!selected) return null;
    const r = await getPropertyDocument(selected.id, doc.id);
    if (!r.ok || !r.document?.dataUrl) {
      onError(r.message || "Could not open file.");
      return null;
    }
    return r.document.dataUrl;
  }

  async function openDocument(doc: PropertyDocument) {
    const dataUrl = await loadDocumentUrl(doc);
    if (!dataUrl) return;
    const objectUrl = dataUrlToObjectUrl(dataUrl);
    const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      onError("Could not open the file preview. Use Download instead.");
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  async function downloadDocument(doc: PropertyDocument) {
    const dataUrl = await loadDocumentUrl(doc);
    if (!dataUrl) return;
    const objectUrl = dataUrlToObjectUrl(dataUrl);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = doc.fileName || doc.title || "document";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  async function removeDoc(doc: PropertyDocument) {
    if (!selected) return;
    const label = doc.title || doc.fileName || "this document";
    if (!window.confirm(`Remove ${label}? This cannot be undone.`)) return;
    setRemovedDocIds((prev) => (prev.includes(doc.id) ? prev : [...prev, doc.id]));
    onError(null);
    try {
      const r = await deletePropertyDocument(selected.id, doc.id);
      if (!r.ok) {
        setRemovedDocIds((prev) => prev.filter((id) => id !== doc.id));
        onError(r.message || "Could not delete document.");
        return;
      }
      setLocalDocs((prev) => prev.filter((d) => d.id !== doc.id));
      if (onReloadProperty) await onReloadProperty(selected.id);
    } catch (err) {
      setRemovedDocIds((prev) => prev.filter((id) => id !== doc.id));
      onError(err instanceof Error ? err.message : "Could not delete document.");
    }
  }

  async function analyzeDoc(doc: PropertyDocument) {
    if (!selected) return;
    setExtractBusy(true);
    onError(null);
    try {
      const r = await analyzePropertyDocument(selected.id, doc.id);
      if (!r.ok || !r.extraction) {
        onError(r.message || "Could not analyze document.");
        return;
      }
      setExtractDoc(doc);
      setExtractDraft({
        ...r.extraction,
        systemKey: r.extraction.systemKey || doc.systemKey || docSystemKey || "",
      });
    } finally {
      setExtractBusy(false);
    }
  }

  async function confirmExtract() {
    if (!selected || !extractDoc || !extractDraft) return;
    setExtractBusy(true);
    onError(null);
    try {
      const r = await applyPropertyDocumentExtract(selected.id, extractDoc.id, extractDraft);
      if (!r.ok) {
        onError(r.message || "Could not save extracted details.");
        return;
      }
      if (r.property && onPropertyUpdated) await onPropertyUpdated(r.property);
      else if (onReloadProperty) await onReloadProperty(selected.id);
      else await onRefresh();
      setExtractDoc(null);
      setExtractDraft(null);
    } finally {
      setExtractBusy(false);
    }
  }

  const docsByCategory = useMemo(() => {
    const hidden = new Set(removedDocIds);
    const fromServer = (selected?.documents || []).filter((d) => !hidden.has(d.id));
    const ids = new Set(fromServer.map((d) => d.id));
    const list = [...localDocs.filter((d) => !ids.has(d.id) && !hidden.has(d.id)), ...fromServer];
    const map = new Map<string, PropertyDocument[]>();
    for (const d of list) {
      const key = d.category || "other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return map;
  }, [selected?.documents, localDocs, removedDocIds]);

  return (
    <section className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
            My Property
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build a Property Passport for each home — systems, warranties, and records in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddHome((v) => !v)}
          className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Add home
        </button>
      </div>

      {showAddHome && (
        <form onSubmit={addHome} className="grid gap-3 rounded-[1.5rem] border border-border bg-card p-5 sm:grid-cols-2">
          <p className="sm:col-span-2 text-sm font-semibold">New home</p>
          <input
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm sm:col-span-2"
            placeholder="Label (e.g. My Home 2)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <div className="sm:col-span-2">
            <VerifiedAddressFields
              idPrefix="new-home"
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
          <div className="sm:col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={savingHome}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {savingHome ? "Saving..." : "Save home"}
            </button>
            <button
              type="button"
              onClick={() => setShowAddHome(false)}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {propertiesLoading && properties.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading your property...</p>
      ) : properties.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-border bg-card px-6 py-12 text-center">
          <Home className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 text-sm font-medium">No homes yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Add your first property to start the Property Passport.</p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            {properties.map((p, idx) => {
              const active = (selected?.id || properties[0]?.id) === p.id;
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
                    My Home {idx + 1}
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-snug">{p.label || p.addressLine1}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {formatAddressLines(p).slice(0, 2).join(" · ") || "Address on file"}
                  </p>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="space-y-5">
              <div className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Property address
                    </p>
                    <h2 className="mt-2 text-xl font-semibold">
                      {selected.label ||
                        `My Home ${Math.max(1, properties.findIndex((p) => p.id === selected.id) + 1)}`}
                    </h2>
                    {!editingFacts ? (
                      <div className="mt-2 text-sm text-muted-foreground">
                        {formatAddressLines(selected).map((line) => (
                          <p key={line}>{line}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={savingFacts}
                    onClick={() => (editingFacts ? void saveFacts() : setEditingFacts(true))}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-60"
                  >
                    {savingFacts ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : editingFacts ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Pencil className="h-3.5 w-3.5" />
                    )}
                    {savingFacts ? "Saving..." : editingFacts ? "Save" : "Edit"}
                  </button>
                </div>

                {editingFacts ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <input
                      className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm sm:col-span-2"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="Home label"
                    />
                    <div className="sm:col-span-2">
                      <VerifiedAddressFields
                        idPrefix="edit-home"
                        addressLine1={addressLine1}
                        addressLine2={addressLine2}
                        city={city}
                        state={state}
                        zip={zip}
                        onAddressLine1Change={setAddressLine1}
                        onAddressLine2Change={setAddressLine2}
                        onCityChange={setCity}
                        onStateChange={setState}
                        onZipChange={setZip}
                        onVerificationChange={setEditVerification}
                        initiallyVerified={selected?.addressVerified === true}
                        disabled={savingFacts}
                        zipRequired
                      />
                    </div>
                    <input
                      className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                      value={yearBuilt}
                      onChange={(e) => setYearBuilt(e.target.value)}
                      placeholder="Built (year)"
                      inputMode="numeric"
                    />
                    <input
                      className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                      value={sqft}
                      onChange={(e) => setSqft(e.target.value)}
                      placeholder="Size (sq ft)"
                      inputMode="numeric"
                    />
                    <input
                      className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                      value={beds}
                      onChange={(e) => setBeds(e.target.value)}
                      placeholder="Bedrooms"
                      inputMode="decimal"
                    />
                    <input
                      className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                      value={baths}
                      onChange={(e) => setBaths(e.target.value)}
                      placeholder="Bathrooms"
                      inputMode="decimal"
                    />
                    <button
                      type="button"
                      onClick={() => setEditingFacts(false)}
                      className="sm:col-span-2 text-left text-xs font-semibold text-muted-foreground hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                    {[
                      { k: "Built", v: selected.yearBuilt != null ? String(selected.yearBuilt) : "—" },
                      {
                        k: "Size",
                        v: selected.sqft != null ? `${Number(selected.sqft).toLocaleString()} sq ft` : "—",
                      },
                      { k: "Bedrooms", v: selected.beds != null ? String(selected.beds) : "—" },
                      { k: "Bathrooms", v: selected.baths != null ? String(selected.baths) : "—" },
                    ].map((row) => (
                      <div
                        key={row.k}
                        className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 px-3.5 py-3 text-sm"
                      >
                        <dt className="text-muted-foreground">{row.k}</dt>
                        <dd className="font-semibold">{row.v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>

              <div className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-primary" />
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Home Systems
                    </h3>
                  </div>
                  <button
                    type="button"
                    disabled={savingSystems}
                    onClick={() => (editingSystems ? void saveSystems() : setEditingSystems(true))}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-60"
                  >
                    {savingSystems ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : editingSystems ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Pencil className="h-3.5 w-3.5" />
                    )}
                    {savingSystems ? "Saving..." : editingSystems ? "Save systems" : "Edit systems"}
                  </button>
                </div>

                <div className="mt-4 divide-y divide-border/70">
                  {systems.map((s, idx) => (
                    <div key={s.key || s.name} className="py-4 first:pt-0 last:pb-0">
                      {editingSystems ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <p className="sm:col-span-2 text-sm font-semibold">{s.name}</p>
                          <input
                            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                            placeholder="Brand"
                            value={s.brand || ""}
                            onChange={(e) => {
                              const next = [...systems];
                              next[idx] = { ...s, brand: e.target.value };
                              setSystems(next);
                            }}
                          />
                          <input
                            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                            placeholder="Installed year"
                            value={s.installedYear != null ? String(s.installedYear) : ""}
                            onChange={(e) => {
                              const next = [...systems];
                              next[idx] = { ...s, installedYear: e.target.value };
                              setSystems(next);
                            }}
                          />
                          <input
                            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                            placeholder="Warranty until"
                            value={s.warrantyUntil || ""}
                            onChange={(e) => {
                              const next = [...systems];
                              next[idx] = { ...s, warrantyUntil: e.target.value };
                              setSystems(next);
                            }}
                          />
                          <input
                            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                            placeholder="Last service"
                            value={s.lastService || ""}
                            onChange={(e) => {
                              const next = [...systems];
                              next[idx] = { ...s, lastService: e.target.value };
                              setSystems(next);
                            }}
                          />
                          <input
                            className="rounded-xl border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
                            placeholder="Follow-up recommendation (from inspection)"
                            value={s.followUpRecommendation || ""}
                            onChange={(e) => {
                              const next = [...systems];
                              next[idx] = { ...s, followUpRecommendation: e.target.value };
                              setSystems(next);
                            }}
                          />
                          <input
                            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                            placeholder="Follow-up due date (YYYY-MM-DD)"
                            value={s.followUpDueDate || ""}
                            onChange={(e) => {
                              const next = [...systems];
                              next[idx] = { ...s, followUpDueDate: e.target.value };
                              setSystems(next);
                            }}
                          />
                          <input
                            className="rounded-xl border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
                            placeholder="Notes"
                            value={s.notes || ""}
                            onChange={(e) => {
                              const next = [...systems];
                              next[idx] = { ...s, notes: e.target.value };
                              setSystems(next);
                            }}
                          />
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm font-semibold">{s.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{formatSystemLine(s)}</p>
                          {s.warrantyUntil && (
                            <p className="mt-0.5 text-sm text-muted-foreground">Warranty until {s.warrantyUntil}</p>
                          )}
                          {s.lastService && (
                            <p className="mt-0.5 text-sm text-muted-foreground">Last service: {s.lastService}</p>
                          )}
                          {s.followUpRecommendation && (
                            <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                              Follow-up: {s.followUpRecommendation}
                              {s.followUpDueDate ? ` · due ${s.followUpDueDate}` : ""}
                            </p>
                          )}
                          {s.notes && <p className="mt-0.5 text-xs text-muted-foreground">{s.notes}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {editingSystems && (
                  <button
                    type="button"
                    onClick={() => {
                      const key = `custom_${Date.now()}`;
                      setSystems([
                        ...systems,
                        {
                          key,
                          name: "New system",
                          brand: "",
                          installedYear: "",
                          warrantyUntil: "",
                          lastService: "",
                          notes: "",
                        },
                      ]);
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    <Plus size={14} /> Add another system
                  </button>
                )}
              </div>

              <div className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm sm:p-6">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-primary" />
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Maintenance passport files
                  </h3>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Attach receipts, warranties, manuals, invoices, inspection reports, contractor records, and
                  before/after photos.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-xs text-muted-foreground">Category</span>
                    <select
                      className="rounded-xl border border-border bg-background px-3 py-2.5"
                      value={docCategory}
                      onChange={(e) => setDocCategory(e.target.value)}
                    >
                      {DOC_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-xs text-muted-foreground">Linked system (optional)</span>
                    <select
                      className="rounded-xl border border-border bg-background px-3 py-2.5"
                      value={docSystemKey}
                      onChange={(e) => setDocSystemKey(e.target.value)}
                    >
                      <option value="">None</option>
                      {systems.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input
                    className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm sm:col-span-2"
                    placeholder="Title (optional)"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="sm:col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-6 text-sm font-semibold hover:border-primary/40 hover:bg-primary/[0.04]"
                  >
                    <ImagePlus className="h-4 w-4" />
                    Choose file
                  </button>
                  {pendingFile ? (
                    <div className="sm:col-span-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-3 text-sm">
                      <p className="break-all font-medium">{pendingFile.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {(pendingFile.type || "File").split("/").pop()?.toUpperCase()} • {(pendingFile.size / (1024 * 1024)).toFixed(1)} MB
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Category: {DOC_CATEGORIES.find((c) => c.id === docCategory)?.label || "Other"}
                        {" · "}
                        Linked to: {systems.find((s) => s.key === docSystemKey)?.name || "None"}
                      </p>
                      <button
                        type="button"
                        disabled={uploadBusy}
                        onClick={() => void onUploadDoc(pendingFile)}
                        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {uploadBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {uploadBusy ? `Uploading ${pendingFile.name}…` : "Upload"}
                      </button>
                    </div>
                  ) : null}
                  {uploadError ? (
                    <div className="sm:col-span-2 flex flex-wrap items-center gap-2 text-xs text-red-700">
                      <span>{uploadError}</span>
                      {pendingFile ? (
                        <button type="button" className="font-semibold underline" onClick={() => void onUploadDoc(pendingFile)}>
                          Retry
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={(e) => {
                      chooseFile(e.target.files?.[0] || null);
                      e.target.value = "";
                    }}
                  />
                </div>

                <div className="mt-5 space-y-4">
                  {DOC_CATEGORIES.map((cat) => {
                    const docs = docsByCategory.get(cat.id) || [];
                    if (!docs.length) return null;
                    return (
                      <div key={cat.id}>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {cat.label}
                        </p>
                        <ul className="mt-2 space-y-2">
                          {docs.map((doc) => (
                            <li
                              key={doc.id}
                              className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5"
                            >
                              <div className="min-w-0 flex items-center gap-2.5">
                                {doc.mimeType?.startsWith("image/") && doc.dataUrl ? (
                                  <img
                                    src={doc.dataUrl}
                                    alt=""
                                    className="h-10 w-10 rounded-lg object-cover border border-border"
                                  />
                                ) : (
                                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-background border border-border">
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                  </span>
                                )}
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => void openDocument(doc)}
                                    className="block max-w-full truncate text-left text-sm font-medium hover:text-primary"
                                  >
                                    {doc.title || doc.fileName || "Document"}
                                  </button>
                                  <p className="text-[11px] text-muted-foreground">
                                    {[
                                      DOC_CATEGORIES.find((c) => c.id === doc.category)?.label,
                                      systems.find((s) => s.key === doc.systemKey)?.name,
                                      formatDocDate(doc.createdAt),
                                    ].filter(Boolean).join(" · ")}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => void openDocument(doc)}
                                  className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void downloadDocument(doc)}
                                  className="rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted"
                                >
                                  Download
                                </button>
                                <button
                                  type="button"
                                  disabled={extractBusy || busy}
                                  onClick={() => void analyzeDoc(doc)}
                                  className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                  aria-label="Analyze document"
                                  title="Extract details with AI"
                                >
                                  {extractBusy && extractDoc?.id === doc.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-4 w-4" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void removeDoc(doc)}
                                  className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                                  aria-label="Delete document"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                  {selected && !selected.documents && !uploadBusy && (
                    <p className="text-sm text-muted-foreground">Loading documents...</p>
                  )}
                  {selected?.documents && (selected.documents || []).filter((d) => !removedDocIds.includes(d.id)).length === 0 && localDocs.length === 0 && !uploadBusy && (
                    <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center">
                      <Building2 className="mx-auto h-6 w-6 text-muted-foreground" />
                      <p className="mt-2 text-sm text-muted-foreground">No files yet — upload your first passport document.</p>
                    </div>
                  )}
                </div>

                {extractDraft && extractDoc ? (
                  <div className="mt-5 rounded-2xl border border-primary/25 bg-primary/5 p-4">
                    <p className="text-sm font-semibold">Confirm extracted details</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Review before FixBridge updates your home systems. Nothing is saved until you confirm.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs">
                        System key
                        <input
                          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                          value={extractDraft.systemKey || ""}
                          onChange={(e) => setExtractDraft({ ...extractDraft, systemKey: e.target.value })}
                        />
                      </label>
                      <label className="grid gap-1 text-xs">
                        Service / install date
                        <input
                          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                          value={extractDraft.date || ""}
                          onChange={(e) => setExtractDraft({ ...extractDraft, date: e.target.value })}
                        />
                      </label>
                      <label className="grid gap-1 text-xs">
                        Warranty until
                        <input
                          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                          value={extractDraft.warrantyUntil || ""}
                          onChange={(e) => setExtractDraft({ ...extractDraft, warrantyUntil: e.target.value })}
                        />
                      </label>
                      <label className="grid gap-1 text-xs">
                        Follow-up due
                        <input
                          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                          value={extractDraft.recommendedFollowUpDate || ""}
                          onChange={(e) =>
                            setExtractDraft({ ...extractDraft, recommendedFollowUpDate: e.target.value })
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-xs sm:col-span-2">
                        Follow-up recommendation
                        <input
                          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                          value={extractDraft.recommendedFollowUp || ""}
                          onChange={(e) =>
                            setExtractDraft({ ...extractDraft, recommendedFollowUp: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    {extractDraft.summary ? (
                      <p className="mt-2 text-xs text-muted-foreground">{extractDraft.summary}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={extractBusy}
                        onClick={() => void confirmExtract()}
                        className="rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white"
                      >
                        Save to home systems
                      </button>
                      <button
                        type="button"
                        disabled={extractBusy}
                        onClick={() => {
                          setExtractDoc(null);
                          setExtractDraft(null);
                        }}
                        className="rounded-xl border border-border px-3.5 py-2 text-xs font-semibold"
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
