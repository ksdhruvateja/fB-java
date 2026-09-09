import type { HomeSystemRecord, ManagedJob, Property, PropertyDocument } from "./managedJobs";
import type { PropertyHealthProfile } from "./homeownerPropertyHealth";
import { serviceToSystem } from "./homeownerPropertyHealth";
import { formatAddressLines } from "./addressFormat";

export type InfoSource =
  | "homeowner"
  | "contractor"
  | "admin"
  | "service_history"
  | "ai_photo"
  | "ai_document";

export type PassportHomeDetails = {
  propertyType?: string;
  yearBuilt?: string;
  squareFootage?: string;
  bedrooms?: string;
  bathrooms?: string;
  floors?: string;
  basement?: string;
  garage?: string;
  heatingType?: string;
  coolingType?: string;
  roofType?: string;
  utilityNotes?: string;
  otherNotes?: string;
};

export type ImportantLocation = {
  id: string;
  name: string;
  description?: string;
  photoDocId?: number | null;
  notes?: string;
};

export type PassportWarranty = {
  id: string;
  name: string;
  equipmentKey?: string;
  equipmentLabel?: string;
  provider?: string;
  startDate?: string;
  expirationDate?: string;
  warrantyType?: string;
  coverage?: string;
  notes?: string;
  documentId?: number | null;
};

export type PropertyPassportData = {
  homeDetails?: PassportHomeDetails;
  importantLocations?: ImportantLocation[];
  warranties?: PassportWarranty[];
};

export type PropertyPassportSection =
  | "overview"
  | "home-details"
  | "systems"
  | "appliances"
  | "locations"
  | "warranties"
  | "documents"
  | "service-history"
  | "maintenance";

export const PASSPORT_SECTIONS: { id: PropertyPassportSection; label: string; description: string }[] = [
  { id: "overview", label: "Overview", description: "Summary of everything FixBridge knows" },
  { id: "home-details", label: "Home Details", description: "Property type, size, utilities" },
  { id: "systems", label: "Systems & Equipment", description: "HVAC, plumbing, roof, and more" },
  { id: "appliances", label: "Appliances", description: "Kitchen and laundry appliances" },
  { id: "locations", label: "Important Locations", description: "Shutoffs, panels, filters" },
  { id: "warranties", label: "Warranties", description: "Active coverage and expiration" },
  { id: "documents", label: "Documents & Photos", description: "Manuals, receipts, labels" },
  { id: "service-history", label: "Service History", description: "Repairs and completed jobs" },
  { id: "maintenance", label: "Maintenance", description: "Upcoming and scheduled care" },
];

/** Passport sections that require HomeCare Pro. */
export const PRO_PASSPORT_SECTIONS = new Set<PropertyPassportSection>([
  "warranties",
  "documents",
  "maintenance",
]);

export function isProPassportSection(section: PropertyPassportSection): boolean {
  return PRO_PASSPORT_SECTIONS.has(section);
}

export const SYSTEM_EQUIPMENT_TYPES: { key: string; label: string }[] = [
  { key: "hvac", label: "HVAC" },
  { key: "water_heater", label: "Water Heater" },
  { key: "electrical_panel", label: "Electrical Panel" },
  { key: "plumbing", label: "Plumbing" },
  { key: "roof", label: "Roof" },
  { key: "sump_pump", label: "Sump Pump" },
  { key: "water_softener", label: "Water Softener" },
  { key: "generator", label: "Generator" },
  { key: "solar", label: "Solar" },
  { key: "sprinkler", label: "Sprinkler / Irrigation" },
  { key: "other_system", label: "Other" },
];

export const APPLIANCE_TYPES: { key: string; label: string }[] = [
  { key: "refrigerator", label: "Refrigerator" },
  { key: "dishwasher", label: "Dishwasher" },
  { key: "washer", label: "Washer" },
  { key: "dryer", label: "Dryer" },
  { key: "oven", label: "Oven" },
  { key: "range", label: "Range" },
  { key: "microwave", label: "Microwave" },
  { key: "garbage_disposal", label: "Garbage Disposal" },
  { key: "freezer", label: "Freezer" },
  { key: "other_appliance", label: "Other" },
];

export const LOCATION_PRESETS = [
  "Main Water Shutoff",
  "Gas Shutoff",
  "Electrical Panel",
  "HVAC Filter",
  "Water Heater",
  "Sump Pump",
  "Sprinkler Controller",
  "Internet Router",
] as const;

export const PROPERTY_TYPE_OPTIONS = [
  "Single Family Home",
  "Townhouse",
  "Condo",
  "Multi-Family",
  "Apartment",
  "Other",
] as const;

export function newId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizePassportData(health?: PropertyHealthProfile | null): PropertyPassportData {
  const raw = (health as PropertyHealthProfile & { passport?: PropertyPassportData })?.passport;
  if (!raw || typeof raw !== "object") return {};
  return {
    homeDetails: raw.homeDetails || {},
    importantLocations: Array.isArray(raw.importantLocations) ? raw.importantLocations : [],
    warranties: Array.isArray(raw.warranties) ? raw.warranties : [],
  };
}

export function mergePassportIntoHealth(
  health: PropertyHealthProfile,
  passport: PropertyPassportData
): PropertyHealthProfile & { passport: PropertyPassportData } {
  return { ...health, passport };
}

export function isApplianceRecord(s: HomeSystemRecord): boolean {
  return s.category === "appliance" || APPLIANCE_TYPES.some((a) => a.key === s.key);
}

export function isSystemRecord(s: HomeSystemRecord): boolean {
  return !isApplianceRecord(s);
}

export function defaultSystemRecord(type: { key: string; label: string }): HomeSystemRecord {
  return {
    key: type.key,
    name: type.label,
    category: "system",
    brand: "",
    model: "",
    installedYear: "",
    warrantyUntil: "",
    lastService: "",
    notes: "",
  };
}

export function defaultApplianceRecord(type: { key: string; label: string }): HomeSystemRecord {
  return {
    key: type.key,
    name: type.label,
    category: "appliance",
    brand: "",
    model: "",
    installedYear: "",
    warrantyUntil: "",
    lastService: "",
    notes: "",
  };
}

export function mergeEquipmentLists(
  homeSystems: HomeSystemRecord[] | undefined,
  category: "system" | "appliance"
): HomeSystemRecord[] {
  const defaults = category === "system" ? SYSTEM_EQUIPMENT_TYPES : APPLIANCE_TYPES;
  const existing = (homeSystems || []).filter((s) =>
    category === "system" ? isSystemRecord(s) : isApplianceRecord(s)
  );
  const byKey = new Map(existing.map((s) => [s.key || s.name, s]));
  const merged = defaults.map((d) => {
    const hit = byKey.get(d.key) || existing.find((s) => s.name === d.label);
    const base = category === "system" ? defaultSystemRecord(d) : defaultApplianceRecord(d);
    return hit ? { ...base, ...hit, key: d.key, name: d.label, category } : base;
  });
  const extras = existing.filter(
    (s) => !defaults.some((d) => d.key === s.key || d.label === s.name)
  );
  return [...merged, ...extras.map((s) => ({ ...s, category }))];
}

export function allEquipment(homeSystems?: HomeSystemRecord[]): HomeSystemRecord[] {
  return [...mergeEquipmentLists(homeSystems, "system"), ...mergeEquipmentLists(homeSystems, "appliance")];
}

export function hasEquipmentData(s: HomeSystemRecord): boolean {
  return Boolean(
    s.brand?.trim() ||
      s.model?.trim() ||
      s.serialNumber?.trim() ||
      s.installedYear ||
      s.warrantyUntil?.trim() ||
      s.lastService?.trim() ||
      s.filterSize?.trim() ||
      s.location?.trim() ||
      s.notes?.trim()
  );
}

export function formatPropertyAddress(property: Property | null): string {
  if (!property) return "";
  const lines = formatAddressLines(property);
  return lines.join("\n");
}

export function homeDetailsFromProperty(
  property: Property | null,
  passport: PropertyPassportData
): PassportHomeDetails {
  const d = passport.homeDetails || {};
  return {
    propertyType: d.propertyType || property?.propertyType || "",
    yearBuilt: d.yearBuilt || (property?.yearBuilt != null ? String(property.yearBuilt) : ""),
    squareFootage: d.squareFootage || (property?.sqft != null ? String(property.sqft) : ""),
    bedrooms: d.bedrooms || (property?.beds != null ? String(property.beds) : ""),
    bathrooms: d.bathrooms || (property?.baths != null ? String(property.baths) : ""),
    floors: d.floors || "",
    basement: d.basement || "",
    garage: d.garage || "",
    heatingType: d.heatingType || "",
    coolingType: d.coolingType || "",
    roofType: d.roofType || "",
    utilityNotes: d.utilityNotes || "",
    otherNotes: d.otherNotes || property?.accessNotes || "",
  };
}

export type PassportSummary = {
  systemsCount: number;
  appliancesCount: number;
  activeWarranties: number;
  serviceRecords: number;
  documentsCount: number;
  maintenanceUpcoming: number;
};

const COMPLETED_STATUSES = new Set([
  "work_completed",
  "customer_review_pending",
  "admin_review_pending",
  "payout_pending",
  "paid_out",
  "closed",
]);

export function propertyJobs(jobs: ManagedJob[], propertyId: number | null): ManagedJob[] {
  if (!propertyId) return jobs;
  return jobs.filter((j) => !j.propertyId || Number(j.propertyId) === propertyId);
}

export function completedServiceJobs(jobs: ManagedJob[], propertyId: number | null): ManagedJob[] {
  return propertyJobs(jobs, propertyId)
    .filter((j) => COMPLETED_STATUSES.has(String(j.status)))
    .sort((a, b) => {
      const da = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const db = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return db - da;
    });
}

export function serviceHistoryForEquipment(
  jobs: ManagedJob[],
  propertyId: number | null,
  equipment: HomeSystemRecord,
  previousServices?: PropertyHealthProfile["previousServices"]
): Array<{ id: string; date: string; title: string; subtitle?: string; jobId?: number; immutable?: boolean }> {
  const rows: Array<{ id: string; date: string; title: string; subtitle?: string; jobId?: number; immutable?: boolean }> =
    [];
  const keyHay = `${equipment.key} ${equipment.name}`.toLowerCase();

  for (const j of completedServiceJobs(jobs, propertyId)) {
    const sys = serviceToSystem(j.category, j.title);
    const catHay = `${j.category || ""} ${j.title || ""}`.toLowerCase();
    const matches =
      catHay.includes(equipment.key.replace(/_/g, " ")) ||
      catHay.includes(equipment.name.toLowerCase()) ||
      (sys && keyHay.includes(sys.toLowerCase()));
    if (!matches) continue;
    const report = j.completionReport as Record<string, unknown> | null | undefined;
    const date = String(report?.completedAt || j.updatedAt || j.createdAt || "").slice(0, 10);
    rows.push({
      id: `job-${j.id}`,
      date,
      title: j.title || j.category || "Service",
      subtitle: report?.summary ? String(report.summary).slice(0, 120) : undefined,
      jobId: j.id,
      immutable: true,
    });
  }

  for (const s of previousServices || []) {
    const mapped = String(s.system || "").toLowerCase();
    if (
      mapped.includes(equipment.key) ||
      mapped.includes(equipment.name.toLowerCase()) ||
      String(s.title || "").toLowerCase().includes(equipment.name.toLowerCase())
    ) {
      rows.push({
        id: s.id,
        date: s.date || "",
        title: s.title,
        subtitle: [s.company, s.cost ? `$${s.cost}` : null].filter(Boolean).join(" · ") || s.notes,
        immutable: !String(s.id).startsWith("job-"),
      });
    }
  }

  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function buildPassportSummary(
  property: Property | null,
  health: PropertyHealthProfile,
  jobs: ManagedJob[]
): PassportSummary {
  const systems = mergeEquipmentLists(property?.homeSystems, "system").filter(hasEquipmentData);
  const appliances = mergeEquipmentLists(property?.homeSystems, "appliance").filter(hasEquipmentData);
  const passport = normalizePassportData(health);
  const now = Date.now();
  const activeWarranties = (passport.warranties || []).filter((w) => {
    if (!w.expirationDate) return true;
    const t = new Date(w.expirationDate).getTime();
    return !Number.isNaN(t) && t >= now;
  }).length;
  const serviceRecords = completedServiceJobs(jobs, property?.id ?? null).length;
  const documentsCount = property?.documents?.length || 0;
  const maintenanceUpcoming =
    (health.maintenance || []).length +
    (health.previousServices || []).filter(() => false).length;

  return {
    systemsCount: systems.length,
    appliancesCount: appliances.length,
    activeWarranties,
    serviceRecords,
    documentsCount,
    maintenanceUpcoming: (health.maintenance || []).length,
  };
}

export function warrantyStatus(w: PassportWarranty): "active" | "expired" | "unknown" {
  if (!w.expirationDate) return "unknown";
  const t = new Date(w.expirationDate).getTime();
  if (Number.isNaN(t)) return "unknown";
  return t >= Date.now() ? "active" : "expired";
}

export function sourceLabel(source?: InfoSource): string {
  switch (source) {
    case "homeowner":
      return "Homeowner";
    case "contractor":
      return "Contractor";
    case "admin":
      return "FixBridge Admin";
    case "service_history":
      return "Service History";
    case "ai_photo":
      return "AI Photo Extraction";
    case "ai_document":
      return "AI Document Extraction";
    default:
      return "";
  }
}

export function docsForEquipment(docs: PropertyDocument[] | undefined, equipmentKey: string) {
  return (docs || []).filter((d) => d.systemKey === equipmentKey);
}

export type AddInformationKind =
  | "home-details"
  | "system"
  | "appliance"
  | "warranty"
  | "location"
  | "document"
  | "photo";

export const ADD_INFORMATION_OPTIONS: { id: AddInformationKind; label: string }[] = [
  { id: "home-details", label: "Home Details" },
  { id: "system", label: "System / Equipment" },
  { id: "appliance", label: "Appliance" },
  { id: "warranty", label: "Warranty" },
  { id: "location", label: "Important Location" },
  { id: "document", label: "Document" },
  { id: "photo", label: "Photo" },
];

/** Compact property context for AI coaches and assistants. */
export function buildPassportAiContext(
  property: Property | null,
  health: PropertyHealthProfile
): string {
  if (!property) return "No property selected.";

  const passport = normalizePassportData(health);
  const details = homeDetailsFromProperty(property, passport);
  const systems = mergeEquipmentLists(property.homeSystems, "system").filter(hasEquipmentData);
  const appliances = mergeEquipmentLists(property.homeSystems, "appliance").filter(hasEquipmentData);
  const lines: string[] = [
    `Property: ${property.label?.trim() || property.addressLine1 || `Home #${property.id}`}`,
    `Address: ${formatPropertyAddress(property).replace(/\n/g, ", ")}`,
  ];

  const factBits = [
    details.propertyType ? `Type: ${details.propertyType}` : null,
    details.yearBuilt ? `Built: ${details.yearBuilt}` : null,
    details.squareFootage ? `Sq ft: ${details.squareFootage}` : null,
    details.bedrooms ? `Beds: ${details.bedrooms}` : null,
    details.bathrooms ? `Baths: ${details.bathrooms}` : null,
    details.heatingType ? `Heat: ${details.heatingType}` : null,
    details.coolingType ? `Cool: ${details.coolingType}` : null,
    details.roofType ? `Roof: ${details.roofType}` : null,
  ].filter(Boolean);
  if (factBits.length) lines.push(factBits.join(" · "));

  if (systems.length) {
    lines.push(
      "Systems: " +
        systems
          .map((s) => [s.name, s.brand, s.installedYear ? `installed ${s.installedYear}` : null].filter(Boolean).join(" "))
          .join("; ")
    );
  }
  if (appliances.length) {
    lines.push(
      "Appliances: " +
        appliances
          .map((s) => [s.name, s.brand, s.installedYear ? `installed ${s.installedYear}` : null].filter(Boolean).join(" "))
          .join("; ")
    );
  }

  const maintenance = (health.maintenance || []).slice(0, 6);
  if (maintenance.length) {
    lines.push(
      "Upcoming maintenance: " + maintenance.map((m) => `${m.label}${m.dueDate ? ` (due ${m.dueDate})` : ""}`).join("; ")
    );
  }

  const warranties = (passport.warranties || []).filter((w) => warrantyStatus(w) === "active").slice(0, 5);
  if (warranties.length) {
    lines.push("Active warranties: " + warranties.map((w) => w.name).join("; "));
  }

  const systemHealth = (health.systems || []).filter((s) => s.status !== "good").slice(0, 5);
  if (systemHealth.length) {
    lines.push(
      "Health flags: " + systemHealth.map((s) => `${s.system}: ${s.status} — ${s.nextAction}`).join("; ")
    );
  }

  return lines.join("\n");
}
