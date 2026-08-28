import type { HomeownerService } from "./homeownerCategories";

/** Step 1 — broad trade pick. AI refines after description + media. */
export const SERVICE_TRADE_OPTIONS = [
  { id: "plumbing", label: "Plumbing", iconHint: "droplet" },
  { id: "electrical", label: "Electrical", iconHint: "zap" },
  { id: "hvac", label: "HVAC", iconHint: "wind" },
  { id: "appliance", label: "Appliance", iconHint: "refrigerator" },
  { id: "handyman", label: "Handyman", iconHint: "hammer" },
  { id: "pest", label: "Pest", iconHint: "bug" },
  { id: "roofing", label: "Roofing", iconHint: "home" },
  { id: "cleaning", label: "Cleaning", iconHint: "cleaning" },
  { id: "landscaping", label: "Landscaping & Outdoor", iconHint: "trees" },
  { id: "other", label: "Other / Not Sure", iconHint: "more" },
] as const;

export type ServiceTradeId = (typeof SERVICE_TRADE_OPTIONS)[number]["id"];

/** Step 2 — where in the home (never mixed with trades). */
export const SERVICE_LOCATION_OPTIONS = [
  "Kitchen",
  "Bathroom",
  "Basement",
  "Garage",
  "Bedroom",
  "Exterior / Yard",
  "Whole Home",
  "Other",
] as const;

export type ServiceLocation = (typeof SERVICE_LOCATION_OPTIONS)[number];

const TRADE_TO_CATEGORY: Record<ServiceTradeId, HomeownerService> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  hvac: "HVAC & Heating/Cooling",
  appliance: "Appliances",
  handyman: "Handyman",
  pest: "Pest Control",
  roofing: "Roofing & Gutters",
  cleaning: "Cleaning",
  landscaping: "Landscaping",
  other: "Other",
};

export function tradeLabel(tradeId: string): string {
  return SERVICE_TRADE_OPTIONS.find((t) => t.id === tradeId)?.label || "Service";
}

export function tradeToCategory(tradeId: string): HomeownerService {
  return TRADE_TO_CATEGORY[tradeId as ServiceTradeId] || "Other";
}

/** Job title: location · trade — never duplicates the same label twice. */
export function serviceRequestTitle(location: string, tradeId: string): string {
  const trade = tradeLabel(tradeId);
  const loc = String(location || "").trim();
  if (!loc) return trade;
  if (loc.toLowerCase() === trade.toLowerCase()) return trade;
  return `${loc} · ${trade}`;
}

export type AdaptiveAnswers = Record<string, string | number | boolean | string[]>;

export type AdaptiveField =
  | { id: string; label: string; type: "select"; options: { value: string; label: string }[] }
  | { id: string; label: string; type: "number"; min?: number; max?: number; placeholder?: string }
  | { id: string; label: string; type: "text"; placeholder?: string }
  | { id: string; label: string; type: "checkbox"; options: { value: string; label: string }[] };

export type AdaptiveFieldSet = {
  family: "cleaning" | "landscaping" | "repair";
  fields: AdaptiveField[];
};

const CLEANING_TYPE_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "deep", label: "Deep" },
  { value: "move_in", label: "Move-in" },
  { value: "move_out", label: "Move-out" },
];

const RECURRENCE_CLEANING = [
  { value: "one_time", label: "One-time" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
];

const LANDSCAPE_SERVICE_OPTIONS = [
  { value: "mowing", label: "Mowing" },
  { value: "cleanup", label: "Cleanup" },
  { value: "trimming", label: "Trimming" },
  { value: "leaf_cleanup", label: "Leaf cleanup" },
  { value: "snow", label: "Snow removal" },
  { value: "pressure_washing", label: "Pressure washing" },
];

const RECURRENCE_LANDSCAPING = [
  { value: "one_time", label: "One-time" },
  { value: "weekly", label: "Weekly" },
  { value: "seasonal", label: "Seasonal" },
  { value: "on_demand", label: "On-demand" },
];

const URGENCY_OPTIONS = [
  { value: "standard", label: "Standard — within a few days" },
  { value: "soon", label: "Soon — next 24–48 hours" },
  { value: "emergency", label: "Emergency — safety risk now" },
];

const SAFETY_SYMPTOMS = [
  { value: "active_leak", label: "Active water leak" },
  { value: "gas_smell", label: "Gas smell" },
  { value: "sparking", label: "Sparking / burning smell" },
  { value: "no_heat_cool", label: "No heat or AC" },
  { value: "structural", label: "Structural / ceiling damage" },
  { value: "none", label: "None of these" },
];

export function adaptiveFieldsForTrade(tradeId: string): AdaptiveFieldSet {
  if (tradeId === "cleaning") {
    return {
      family: "cleaning",
      fields: [
        { id: "cleaning_type", label: "Cleaning type", type: "select", options: CLEANING_TYPE_OPTIONS },
        { id: "bedrooms", label: "Bedrooms", type: "number", min: 0, max: 20, placeholder: "3" },
        { id: "bathrooms", label: "Bathrooms", type: "number", min: 0, max: 20, placeholder: "2" },
        { id: "sqft", label: "Square feet (approx.)", type: "number", min: 100, placeholder: "1500" },
        {
          id: "pets",
          label: "Pets in home",
          type: "select",
          options: [
            { value: "no", label: "No pets" },
            { value: "yes", label: "Yes — pets present" },
          ],
        },
        {
          id: "supplies",
          label: "Cleaning supplies",
          type: "select",
          options: [
            { value: "pro_brings", label: "Pro brings supplies" },
            { value: "use_mine", label: "Use supplies on site" },
          ],
        },
        { id: "extras", label: "Extras (oven, fridge, windows…)", type: "text", placeholder: "Optional" },
        { id: "recurrence", label: "How often", type: "select", options: RECURRENCE_CLEANING },
      ],
    };
  }

  if (tradeId === "landscaping") {
    return {
      family: "landscaping",
      fields: [
        {
          id: "landscape_services",
          label: "What do you need?",
          type: "checkbox",
          options: LANDSCAPE_SERVICE_OPTIONS,
        },
        {
          id: "yard_size",
          label: "Yard size",
          type: "select",
          options: [
            { value: "small", label: "Small" },
            { value: "medium", label: "Medium" },
            { value: "large", label: "Large" },
            { value: "unknown", label: "Not sure" },
          ],
        },
        { id: "recurrence", label: "How often", type: "select", options: RECURRENCE_LANDSCAPING },
      ],
    };
  }

  return {
    family: "repair",
    fields: [
      {
        id: "safety_symptoms",
        label: "Any safety symptoms?",
        type: "checkbox",
        options: SAFETY_SYMPTOMS,
      },
      { id: "urgency", label: "Urgency", type: "select", options: URGENCY_OPTIONS },
    ],
  };
}

/** Append adaptive answers to job description for AI + contractors. */
export function formatAdaptiveAnswersNote(tradeId: string, answers: AdaptiveAnswers): string {
  const { fields } = adaptiveFieldsForTrade(tradeId);
  const lines: string[] = [];
  for (const field of fields) {
    const raw = answers[field.id];
    if (raw == null || raw === "" || (Array.isArray(raw) && raw.length === 0)) continue;
    if (Array.isArray(raw)) {
      const labels = field.type === "checkbox"
        ? field.options.filter((o) => raw.includes(o.value)).map((o) => o.label)
        : raw;
      if (labels.length) lines.push(`${field.label}: ${labels.join(", ")}`);
    } else if (field.type === "select") {
      const hit = field.options.find((o) => o.value === String(raw));
      lines.push(`${field.label}: ${hit?.label || raw}`);
    } else {
      lines.push(`${field.label}: ${raw}`);
    }
  }
  return lines.length ? `\n\nService details:\n${lines.map((l) => `• ${l}`).join("\n")}` : "";
}
