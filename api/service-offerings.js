/** Homeowner service catalog defaults. Keep labels aligned with src/app/homeownerCategories.ts. */

export const FREQUENCY_IDS = [
  "weekly",
  "biweekly",
  "monthly",
  "every_2_months",
  "quarterly",
  "every_6_months",
  "annually",
  "seasonal",
  "per_snow_event",
  "custom",
];

const NAMES = [
  "Appliances",
  "Carpentry",
  "Concrete & Driveways",
  "Doors & Hardware",
  "Electrical",
  "Fences & Gates",
  "Flooring",
  "Garage & Garage Doors",
  "Handyman",
  "HVAC & Heating/Cooling",
  "Landscaping",
  "Landscaping & Yard",
  "Lighting",
  "Locks & Security",
  "Painting",
  "Pest Control",
  "Plumbing",
  "Roofing & Gutters",
  "Siding",
  "Snow Removal",
  "Windows & Glass",
  "Bathroom",
  "Kitchen",
  "Water Damage",
  "Drywall & Wall Repair",
  "Cleaning",
  "Smart Home & Technology",
  "Other",
];

const POPULAR = new Set(["HVAC & Heating/Cooling", "Plumbing", "Electrical", "Appliances", "Cleaning", "Landscaping"]);

const DESCRIPTIONS = {
  "HVAC & Heating/Cooling": "Heating, cooling, AC repair and maintenance",
  Plumbing: "Leaks, drains, and fixtures",
  Electrical: "Outlets, lighting, and electrical issues",
  Appliances: "Kitchen and home appliances",
  Cleaning: "Professional home cleaning for routine, deep, and recurring needs.",
  Landscaping: "Outdoor maintenance and lawn care",
  "Pest Control": "Prevention and treatment for common pests",
  "Snow Removal": "Driveways, walkways, and seasonal snow care",
  "Roofing & Gutters": "Roof leaks, gutters, and seasonal checks",
};

const HELPS = {
  Cleaning: ["Standard cleaning", "Deep cleaning", "Recurring cleaning", "Move-in cleaning", "Move-out cleaning", "Kitchen cleaning", "Bathroom cleaning", "Other cleaning needs"],
  Plumbing: ["Leaks", "Clogged drains", "Faucets", "Toilets", "Water pressure", "Water heater issues", "Pipe problems", "Other plumbing problems"],
  "HVAC & Heating/Cooling": ["AC repair", "Heating repair", "HVAC inspection", "HVAC maintenance", "Thermostat", "Air filter", "Other"],
  Electrical: ["Outlets", "Lighting", "Breakers", "Switches", "Other electrical issues"],
  Appliances: ["Refrigerator", "Washer", "Dryer", "Oven", "Dishwasher", "Other appliances"],
};

const SEARCH = {
  Cleaning: ["house cleaner", "maid", "deep clean", "move out"],
  Plumbing: ["leaking faucet", "clogged drain", "toilet", "pipe leak"],
  "HVAC & Heating/Cooling": ["ac not cooling", "no heat", "thermostat", "air conditioner"],
  Electrical: ["outlet", "breaker", "spark", "no power"],
  Appliances: ["fridge", "washer", "oven", "dishwasher"],
};

const NO_DIY = /clean|landscap|pest|snow|concrete|roof|siding/i;

const SUBSCRIPTION = {
  Cleaning: { frequencies: ["weekly", "biweekly", "monthly"], recommended: "biweekly" },
  Landscaping: { frequencies: ["weekly", "biweekly", "monthly", "seasonal"], recommended: "biweekly" },
  "Pest Control": { frequencies: ["monthly", "every_2_months", "quarterly"], recommended: "quarterly" },
  "HVAC & Heating/Cooling": { frequencies: ["quarterly", "every_6_months", "annually"], recommended: "every_6_months" },
  "Snow Removal": { frequencies: ["per_snow_event", "seasonal", "custom"], recommended: "seasonal" },
  Plumbing: { frequencies: ["quarterly", "every_6_months", "annually"], recommended: "annually" },
  "Roofing & Gutters": { frequencies: ["quarterly", "every_6_months", "seasonal"], recommended: "every_6_months" },
};

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function defaultServiceOfferings() {
  return NAMES.map((name, index) => {
    const sub = SUBSCRIPTION[name];
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
      recommendedFrequency: sub?.recommended || "",
      frequencies: sub?.frequencies || [],
      helpsWith: HELPS[name] || [],
      searchTerms: SEARCH[name] || [],
      oneTimeAvailable: true,
      professionalAvailable: true,
      diyAvailable: !NO_DIY.test(name),
      aiAssessmentAvailable: true,
      activationFeeCents: null,
    };
  });
}

export function defaultActivationFee() {
  return {
    enabled: true,
    amountCents: 4900,
    label: "FixBridge One-Time Activation Fee",
    description: "One-time coordination and setup fee for recurring service activation.",
  };
}

export function mergeOfferings(stored) {
  const defaults = defaultServiceOfferings();
  const incoming = Array.isArray(stored) ? stored : [];
  const byId = new Map(incoming.filter((row) => row && typeof row === "object").map((row) => [String(row.id || ""), row]));
  return defaults
    .map((base) => {
      const patch = byId.get(base.id);
      if (!patch) return base;
      const frequencies = Array.isArray(patch.frequencies)
        ? patch.frequencies.filter((f) => FREQUENCY_IDS.includes(f))
        : base.frequencies;
      return {
        ...base,
        ...patch,
        id: base.id,
        name: String(patch.name || base.name).slice(0, 80),
        description: String(patch.description || base.description).slice(0, 180),
        popular: patch.popular != null ? Boolean(patch.popular) : base.popular,
        subscriptionEligible: patch.subscriptionEligible != null ? Boolean(patch.subscriptionEligible) : base.subscriptionEligible,
        active: patch.active !== false,
        homeownerVisible: patch.homeownerVisible !== false,
        sortOrder: Number.isFinite(Number(patch.sortOrder)) ? Number(patch.sortOrder) : base.sortOrder,
        frequencies,
        recommendedFrequency: FREQUENCY_IDS.includes(patch.recommendedFrequency) ? patch.recommendedFrequency : base.recommendedFrequency,
        helpsWith: Array.isArray(patch.helpsWith) ? patch.helpsWith.map(String).slice(0, 12) : base.helpsWith,
        searchTerms: Array.isArray(patch.searchTerms) ? patch.searchTerms.map(String) : base.searchTerms,
        oneTimeAvailable: patch.oneTimeAvailable !== false,
        professionalAvailable: patch.professionalAvailable !== false,
        diyAvailable: patch.diyAvailable != null ? Boolean(patch.diyAvailable) : base.diyAvailable,
        aiAssessmentAvailable: patch.aiAssessmentAvailable !== false,
        activationFeeCents:
          patch.activationFeeCents == null || patch.activationFeeCents === ""
            ? null
            : Math.max(0, Math.round(Number(patch.activationFeeCents) || 0)),
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function mergeActivationFee(stored) {
  const base = defaultActivationFee();
  const src = stored && typeof stored === "object" ? stored : {};
  const amount = Number(src.amountCents);
  return {
    enabled: src.enabled !== false,
    amountCents: Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : base.amountCents,
    label: String(src.label || base.label).slice(0, 80),
    description: String(src.description || base.description).slice(0, 240),
  };
}

export function offeringById(config, id) {
  return mergeOfferings(config?.serviceCatalog?.offerings).find((row) => row.id === String(id || ""));
}

export function activationFeeCentsFor(offering, fee) {
  if (!fee?.enabled) return 0;
  if (offering?.activationFeeCents != null && Number.isFinite(Number(offering.activationFeeCents))) {
    return Math.max(0, Math.round(Number(offering.activationFeeCents)));
  }
  return Math.max(0, Math.round(Number(fee?.amountCents) || 0));
}

export function recurringTypeForOffering(offering) {
  const category = String(offering?.category || offering?.name || "");
  if (/landscap|snow|lawn/i.test(category)) return "recurring_landscaping";
  if (/clean/i.test(category)) return "recurring_cleaning";
  return `recurring_${offering.id}`;
}
