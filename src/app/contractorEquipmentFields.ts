import type { ManagedJob } from "./managedJobs";

export type EquipmentFieldDef = {
  key: string;
  label: string;
  placeholder?: string;
};

export type EquipmentDraft = Record<string, string>;

function tradeFromJob(job: ManagedJob | null) {
  const cat = String(job?.category || job?.title || "").toLowerCase();
  if (/hvac|furnace|ac\b|air condition|heat pump/.test(cat)) return "hvac";
  if (/water.?heater/.test(cat)) return "water_heater";
  if (/appliance|refrigerat|dishwasher|washer|dryer|oven|range/.test(cat)) return "appliance";
  if (/roof|gutter/.test(cat)) return "roof";
  return "general";
}

export function equipmentFieldsForJob(job: ManagedJob | null): EquipmentFieldDef[] {
  const trade = tradeFromJob(job);
  if (trade === "hvac") {
    return [
      { key: "manufacturer", label: "Manufacturer" },
      { key: "model", label: "Model" },
      { key: "serial", label: "Serial Number" },
      { key: "filterSize", label: "Filter Size" },
      { key: "installationYear", label: "Approx. Installation Year", placeholder: "YYYY" },
      { key: "equipmentType", label: "Equipment Type" },
      { key: "notes", label: "Notes" },
    ];
  }
  if (trade === "water_heater") {
    return [
      { key: "manufacturer", label: "Manufacturer" },
      { key: "model", label: "Model" },
      { key: "serial", label: "Serial Number" },
      { key: "capacity", label: "Capacity" },
      { key: "fuelType", label: "Fuel / Type" },
      { key: "installationYear", label: "Approx. Installation Year", placeholder: "YYYY" },
    ];
  }
  if (trade === "appliance") {
    return [
      { key: "applianceType", label: "Appliance Type" },
      { key: "manufacturer", label: "Manufacturer" },
      { key: "model", label: "Model" },
      { key: "serial", label: "Serial Number" },
    ];
  }
  if (trade === "roof") {
    return [
      { key: "roofMaterial", label: "Roof Type / Material" },
      { key: "installationYear", label: "Approx. Age / Year", placeholder: "YYYY or age" },
      { key: "notes", label: "Observed condition notes" },
    ];
  }
  return [
    { key: "manufacturer", label: "Manufacturer" },
    { key: "model", label: "Model" },
    { key: "serial", label: "Serial Number" },
    { key: "notes", label: "System notes" },
  ];
}

export function equipmentDraftHasData(draft: EquipmentDraft) {
  return Object.values(draft).some((v) => String(v || "").trim());
}

export function buildStructuredEquipmentPayload(job: ManagedJob | null, draft: EquipmentDraft) {
  if (!equipmentDraftHasData(draft)) return null;
  return {
    trade: tradeFromJob(job),
    ...Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, String(v).trim() || undefined])),
  };
}
