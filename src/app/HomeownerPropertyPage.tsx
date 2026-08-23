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
  Trash2,
  Wrench,
} from "lucide-react";
import {
  addPropertyDocument,
  createProperty,
  deletePropertyDocument,
  updateProperty,
  type HomeSystemRecord,
  type Property,
  type PropertyDocument,
} from "./managedJobs";
import { isValidUsZip, normalizeZip } from "./zipCode";

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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function HomeownerPropertyPage({
  properties,
  busy,
  onBusy,
  onError,
  onRefresh,
}: {
  properties: Property[];
  busy?: boolean;
  onBusy: (v: boolean) => void;
  onError: (msg: string | null) => void;
  onRefresh: () => Promise<void>;
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
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [yearBuilt, setYearBuilt] = useState("");
  const [beds, setBeds] = useState("");
  const [baths, setBaths] = useState("");
  const [sqft, setSqft] = useState("");
  const [systems, setSystems] = useState<HomeSystemRecord[]>([]);

  const [newAddress, setNewAddress] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [newZip, setNewZip] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const [docCategory, setDocCategory] = useState("warranty");
  const [docTitle, setDocTitle] = useState("");
  const [docSystemKey, setDocSystemKey] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selected) return;
    setLabel(selected.label || "");
    setAddressLine1(selected.addressLine1 || "");
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
  }, [selected?.id]);

  async function saveFacts() {
    if (!selected) return;
    onBusy(true);
    onError(null);
    try {
      const r = await updateProperty(selected.id, {
        label: label.trim() || selected.label || undefined,
        addressLine1: addressLine1.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
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
      await onRefresh();
    } finally {
      onBusy(false);
    }
  }

  async function saveSystems() {
    if (!selected) return;
    onBusy(true);
    onError(null);
    try {
      const r = await updateProperty(selected.id, { homeSystems: systems });
      if (!r.ok) {
        onError(r.message || "Could not save home systems.");
        return;
      }
      setEditingSystems(false);
      await onRefresh();
    } finally {
      onBusy(false);
    }
  }

  async function addHome(e: FormEvent) {
    e.preventDefault();
    if (!newAddress.trim()) return;
    if (newZip.trim() && !isValidUsZip(newZip)) {
      onError("Enter a valid 5-digit US ZIP code.");
      return;
    }
    onBusy(true);
    onError(null);
    try {
      const r = await createProperty({
        addressLine1: newAddress.trim(),
        city: newCity.trim() || undefined,
        state: newState.trim() || undefined,
        zip: newZip.trim() ? normalizeZip(newZip) : undefined,
        country: "US",
        label: newLabel.trim() || undefined,
        homeSystems: DEFAULT_HOME_SYSTEMS,
      });
      if (!r.ok || !r.property) {
        onError(r.message || "Could not add home.");
        return;
      }
      setShowAddHome(false);
      setNewAddress("");
      setNewCity("");
      setNewState("");
      setNewZip("");
      setNewLabel("");
      await onRefresh();
      setSelectedId(r.property.id);
    } finally {
      onBusy(false);
    }
  }

  async function onUploadDoc(file: File | null) {
    if (!selected || !file) return;
    onBusy(true);
    onError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const r = await addPropertyDocument(selected.id, {
        category: docCategory,
        title: docTitle.trim() || file.name,
        fileName: file.name,
        mimeType: file.type,
        dataUrl,
        systemKey: docSystemKey || undefined,
      });
      if (!r.ok) {
        onError(r.message || "Could not upload document.");
        return;
      }
      setDocTitle("");
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      onBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeDoc(doc: PropertyDocument) {
    if (!selected) return;
    onBusy(true);
    onError(null);
    try {
      const r = await deletePropertyDocument(selected.id, doc.id);
      if (!r.ok) {
        onError(r.message || "Could not delete document.");
        return;
      }
      await onRefresh();
    } finally {
      onBusy(false);
    }
  }

  const docsByCategory = useMemo(() => {
    const list = selected?.documents || [];
    const map = new Map<string, PropertyDocument[]>();
    for (const d of list) {
      const key = d.category || "other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return map;
  }, [selected?.documents]);

  return (
    <section className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
            My Property
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build a digital passport for each home — systems, warranties, and records in one place.
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
          <input
            required
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm sm:col-span-2"
            placeholder="Street address"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
          />
          <input
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            placeholder="City"
            value={newCity}
            onChange={(e) => setNewCity(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              placeholder="State"
              value={newState}
              onChange={(e) => setNewState(e.target.value)}
            />
            <input
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              placeholder="ZIP"
              value={newZip}
              onChange={(e) => setNewZip(e.target.value.replace(/[^\d-]/g, "").slice(0, 10))}
              inputMode="numeric"
              maxLength={10}
              autoComplete="postal-code"
            />
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save home"}
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

      {properties.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-border bg-card px-6 py-12 text-center">
          <Home className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 text-sm font-medium">No homes yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Add your first property to start the maintenance passport.</p>
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
                    {[p.city, p.state].filter(Boolean).join(", ") || "Address on file"}
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
                        <p>{selected.addressLine1}</p>
                        <p>{[selected.city, selected.state, selected.zip].filter(Boolean).join(", ")}</p>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => (editingFacts ? void saveFacts() : setEditingFacts(true))}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
                  >
                    {busy && editingFacts ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : editingFacts ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Pencil className="h-3.5 w-3.5" />
                    )}
                    {editingFacts ? "Save" : "Edit"}
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
                    <input
                      className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm sm:col-span-2"
                      value={addressLine1}
                      onChange={(e) => setAddressLine1(e.target.value)}
                      placeholder="Street"
                    />
                    <input
                      className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="City"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        placeholder="State"
                      />
                      <input
                        className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                        value={zip}
                        onChange={(e) => setZip(e.target.value.replace(/[^\d-]/g, "").slice(0, 10))}
                        placeholder="ZIP"
                        inputMode="numeric"
                        maxLength={10}
                        autoComplete="postal-code"
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
                    onClick={() => (editingSystems ? void saveSystems() : setEditingSystems(true))}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
                  >
                    {busy && editingSystems ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : editingSystems ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Pencil className="h-3.5 w-3.5" />
                    )}
                    {editingSystems ? "Save systems" : "Edit systems"}
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
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                    className="sm:col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-6 text-sm font-semibold hover:border-primary/40 hover:bg-primary/[0.04] disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    Upload file
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,.pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => void onUploadDoc(e.target.files?.[0] || null)}
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
                                {doc.mimeType?.startsWith("image/") ? (
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
                                  <a
                                    href={doc.dataUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block truncate text-sm font-medium hover:text-primary"
                                  >
                                    {doc.title || doc.fileName || "Document"}
                                  </a>
                                  <p className="text-[11px] text-muted-foreground">
                                    {[formatDocDate(doc.createdAt), doc.systemKey].filter(Boolean).join(" · ")}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => void removeDoc(doc)}
                                className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                                aria-label="Delete document"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                  {(selected.documents || []).length === 0 && (
                    <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center">
                      <Building2 className="mx-auto h-6 w-6 text-muted-foreground" />
                      <p className="mt-2 text-sm text-muted-foreground">No files yet — upload your first passport document.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
