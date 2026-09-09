import { HOMEOWNER_SERVICES } from "./homeownerCategories";

export const FREQUENCY_OPTIONS = [
  { id: "weekly", label: "Weekly" },
  { id: "biweekly", label: "Every 2 Weeks" },
  { id: "monthly", label: "Monthly" },
  { id: "every_2_months", label: "Every 2 Months" },
  { id: "quarterly", label: "Quarterly" },
  { id: "every_6_months", label: "Every 6 Months" },
  { id: "annually", label: "Annually" },
  { id: "seasonal", label: "Seasonal" },
  { id: "per_snow_event", label: "Per Snow Event" },
  { id: "custom", label: "Custom" },
] as const;

export type FrequencyId = (typeof FREQUENCY_OPTIONS)[number]["id"];

export type ServicePlace = "indoor" | "outdoor" | "either";
export type ServiceKind = "repair" | "maintenance" | "emergency" | "either";

export type ServiceOffering = {
  id: string;
  name: string;
  category: string;
  description: string;
  popular: boolean;
  subscriptionEligible: boolean;
  active: boolean;
  homeownerVisible: boolean;
  sortOrder: number;
  place: ServicePlace;
  kind: ServiceKind;
  recommendedFrequency: FrequencyId | "";
  frequencies: FrequencyId[];
  helpsWith: string[];
  searchTerms: string[];
  oneTimeAvailable: boolean;
  professionalAvailable: boolean;
  diyAvailable: boolean;
  aiAssessmentAvailable: boolean;
  activationFeeCents: number | null;
};

export type ActivationFeeSettings = {
  enabled: boolean;
  amountCents: number;
  label: string;
  description: string;
};

const DESCRIPTIONS: Record<string, string> = {
  "HVAC & Heating/Cooling": "Heating, cooling, AC repair and maintenance",
  Plumbing: "Leaks, drains, and fixtures",
  Electrical: "Outlets, lighting, and electrical issues",
  Appliances: "Kitchen and home appliances",
  Cleaning: "Home cleaning and recurring upkeep",
  Landscaping: "Outdoor maintenance and lawn care",
  "Pest Control": "Prevention and treatment for common pests",
  "Snow Removal": "Driveways, walkways, and seasonal snow care",
  "Roofing & Gutters": "Roof leaks, gutters, and seasonal checks",
};

const POPULAR = new Set([
  "HVAC & Heating/Cooling",
  "Plumbing",
  "Electrical",
  "Appliances",
  "Cleaning",
  "Landscaping",
]);

const HELPS: Record<string, string[]> = {
  Cleaning: ["Standard cleaning", "Deep cleaning", "Recurring cleaning", "Move-in cleaning", "Move-out cleaning", "Kitchen cleaning", "Bathroom cleaning", "Other cleaning needs"],
  Plumbing: ["Leaks", "Clogged drains", "Faucets", "Toilets", "Water pressure", "Water heater issues", "Pipe problems", "Other plumbing problems"],
  "HVAC & Heating/Cooling": ["AC repair", "Heating repair", "HVAC inspection", "HVAC maintenance", "Thermostat", "Air filter", "Other"],
  Electrical: ["Outlets", "Lighting", "Breakers", "Switches", "Other electrical issues"],
  Appliances: ["Refrigerator", "Washer", "Dryer", "Oven", "Dishwasher", "Other appliances"],
};

const SEARCH: Record<string, string[]> = {
  Cleaning: ["house cleaner", "maid", "deep clean", "move out"],
  Plumbing: ["leaking faucet", "clogged drain", "toilet", "pipe leak"],
  "HVAC & Heating/Cooling": ["ac not cooling", "ac repair", "no heat", "thermostat", "air conditioner"],
  Electrical: ["outlet", "breaker", "spark", "no power"],
  Appliances: ["fridge", "washer", "oven", "dishwasher"],
};

const NO_DIY = /clean|landscap|pest|snow|concrete|roof|siding/i;

const SUBSCRIPTION: Record<string, { frequencies: FrequencyId[]; recommended: FrequencyId; place: ServicePlace; kind: ServiceKind; helps: string[] }> = {
  Cleaning: {
    frequencies: ["weekly", "biweekly", "monthly"],
    recommended: "biweekly",
    place: "indoor",
    kind: "maintenance",
    helps: ["Standard cleaning", "Deep cleaning", "Recurring cleaning"],
  },
  Landscaping: {
    frequencies: ["weekly", "biweekly", "monthly", "seasonal"],
    recommended: "biweekly",
    place: "outdoor",
    kind: "maintenance",
    helps: ["Lawn mowing", "Yard cleanup", "Seasonal cleanup"],
  },
  "Pest Control": {
    frequencies: ["monthly", "every_2_months", "quarterly"],
    recommended: "quarterly",
    place: "either",
    kind: "maintenance",
    helps: ["Prevention", "Interior treatment", "Seasonal follow-up"],
  },
  "HVAC & Heating/Cooling": {
    frequencies: ["quarterly", "every_6_months", "annually"],
    recommended: "every_6_months",
    place: "indoor",
    kind: "maintenance",
    helps: ["AC not cooling", "Heating issues", "Filter replacement", "HVAC inspection"],
  },
  "Snow Removal": {
    frequencies: ["per_snow_event", "seasonal", "custom"],
    recommended: "seasonal",
    place: "outdoor",
    kind: "maintenance",
    helps: ["Driveway clearing", "Walkway clearing", "De-icing"],
  },
  Plumbing: {
    frequencies: ["quarterly", "every_6_months", "annually"],
    recommended: "annually",
    place: "indoor",
    kind: "maintenance",
    helps: ["Drain maintenance", "Leak checks", "Fixture inspection"],
  },
  "Roofing & Gutters": {
    frequencies: ["quarterly", "every_6_months", "seasonal"],
    recommended: "every_6_months",
    place: "outdoor",
    kind: "maintenance",
    helps: ["Gutter cleaning", "Seasonal inspection"],
  },
};

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function defaultServiceOfferings(): ServiceOffering[] {
  return HOMEOWNER_SERVICES.map((name, index) => {
    const sub = SUBSCRIPTION[name];
    const outdoor = /landscap|snow|roof|fence|siding|concrete|yard/i.test(name);
    return {
      id: slug(name),
      name,
      category: name,
      description: DESCRIPTIONS[name] || "Request diagnosis, guidance, or a local professional.",
      popular: POPULAR.has(name),
      subscriptionEligible: Boolean(sub),
      active: true,
      homeownerVisible: true,
      sortOrder: (index + 1) * 10,
      place: sub?.place || (outdoor ? "outdoor" : "indoor"),
      kind: sub?.kind || "repair",
      recommendedFrequency: sub?.recommended || "",
      frequencies: sub?.frequencies || [],
      helpsWith: HELPS[name] || sub?.helps || [],
      searchTerms: SEARCH[name] || [],
      oneTimeAvailable: true,
      professionalAvailable: true,
      diyAvailable: !NO_DIY.test(name),
      aiAssessmentAvailable: true,
      activationFeeCents: null,
    };
  });
}

export function defaultActivationFee(): ActivationFeeSettings {
  return {
    enabled: true,
    amountCents: 4900,
    label: "FixBridge One-Time Activation Fee",
    description: "One-time coordination and setup fee for recurring service activation.",
  };
}

export function frequencyLabel(id: string) {
  return FREQUENCY_OPTIONS.find((f) => f.id === id)?.label || id.replace(/_/g, " ");
}

export function mergeOfferings(stored: unknown): ServiceOffering[] {
  const defaults = defaultServiceOfferings();
  const incoming = Array.isArray(stored) ? stored : [];
  const byId = new Map(incoming.filter((row) => row && typeof row === "object").map((row) => [String((row as { id?: string }).id || ""), row as Partial<ServiceOffering>]));
  const merged = defaults.map((base) => {
    const patch = byId.get(base.id);
    if (!patch) return base;
    const frequencies = Array.isArray(patch.frequencies)
      ? patch.frequencies.filter((f): f is FrequencyId => FREQUENCY_OPTIONS.some((opt) => opt.id === f))
      : base.frequencies;
    return {
      ...base,
      ...patch,
      id: base.id,
      name: String(patch.name || base.name),
      description: String(patch.description || base.description),
      popular: patch.popular != null ? Boolean(patch.popular) : base.popular,
      subscriptionEligible: patch.subscriptionEligible != null ? Boolean(patch.subscriptionEligible) : base.subscriptionEligible,
      active: patch.active !== false,
      homeownerVisible: patch.homeownerVisible !== false,
      sortOrder: Number.isFinite(Number(patch.sortOrder)) ? Number(patch.sortOrder) : base.sortOrder,
      frequencies,
      recommendedFrequency: (patch.recommendedFrequency as FrequencyId) || base.recommendedFrequency,
      helpsWith: Array.isArray(patch.helpsWith) ? patch.helpsWith.map(String).slice(0, 12) : base.helpsWith,
      searchTerms: Array.isArray(patch.searchTerms) ? patch.searchTerms.map(String) : base.searchTerms,
      oneTimeAvailable: patch.oneTimeAvailable !== false,
      professionalAvailable: patch.professionalAvailable !== false,
      diyAvailable: patch.diyAvailable != null ? Boolean(patch.diyAvailable) : base.diyAvailable,
      aiAssessmentAvailable: patch.aiAssessmentAvailable !== false,
      activationFeeCents: patch.activationFeeCents == null || patch.activationFeeCents === "" ? null : Number(patch.activationFeeCents),
    };
  });
  for (const row of incoming) {
    const id = String((row as { id?: string }).id || "");
    if (!id || defaults.some((d) => d.id === id)) continue;
    merged.push({
      ...defaultServiceOfferings()[0],
      ...(row as ServiceOffering),
      id,
      active: (row as { active?: boolean }).active !== false,
      homeownerVisible: (row as { homeownerVisible?: boolean }).homeownerVisible !== false,
    });
  }
  return merged.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function visibleOfferings(list: ServiceOffering[]) {
  return list.filter((s) => s.active && s.homeownerVisible);
}

export function activationFeeFor(offering: ServiceOffering, settings: ActivationFeeSettings) {
  if (!settings.enabled) return 0;
  if (offering.activationFeeCents != null && Number.isFinite(offering.activationFeeCents)) {
    return Math.max(0, Math.round(offering.activationFeeCents));
  }
  return Math.max(0, Math.round(settings.amountCents || 0));
}

export function recurringServiceTypeFor(offering: ServiceOffering) {
  if (/landscap|snow|lawn/i.test(offering.category)) return "recurring_landscaping";
  if (/clean/i.test(offering.category)) return "recurring_cleaning";
  return `recurring_${offering.id}`;
}
