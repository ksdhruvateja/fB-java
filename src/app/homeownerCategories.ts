import type { Unicon } from "./contractorIcons";
import UilBath from "@iconscout/react-unicons/icons/uil-bath";
import UilEstate from "@iconscout/react-unicons/icons/uil-estate";
import UilHome from "@iconscout/react-unicons/icons/uil-home";
import UilLayerGroup from "@iconscout/react-unicons/icons/uil-layer-group";
import UilRaindrops from "@iconscout/react-unicons/icons/uil-raindrops";
import UilStore from "@iconscout/react-unicons/icons/uil-store";
import UilWater from "@iconscout/react-unicons/icons/uil-water";

/** Primary chips shown to homeowners when reporting an issue. */
export const HOMEOWNER_AREAS = [
  "Kitchen",
  "Bathroom",
  "Garage",
  "Gutters",
  "Yard & Exterior",
  "Drywall",
  "Water Damage",
  "Garage Doors",
] as const;

export type HomeownerArea = (typeof HOMEOWNER_AREAS)[number];

/** Service dropdown options shown after an area is selected. */
export const HOMEOWNER_SERVICES = [
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
] as const;

export type HomeownerService = (typeof HOMEOWNER_SERVICES)[number];

export const HOMEOWNER_AREA_ICONS: Record<HomeownerArea, Unicon> = {
  Kitchen: UilEstate,
  Bathroom: UilBath,
  Garage: UilStore,
  Gutters: UilRaindrops,
  "Yard & Exterior": UilEstate,
  Drywall: UilLayerGroup,
  "Water Damage": UilWater,
  "Garage Doors": UilHome,
};

/** Default service pre-selected when an area chip is chosen. */
export const HOMEOWNER_AREA_DEFAULT_SERVICE: Record<HomeownerArea, HomeownerService> = {
  Kitchen: "Kitchen",
  Bathroom: "Bathroom",
  Garage: "Garage & Garage Doors",
  Gutters: "Roofing & Gutters",
  "Yard & Exterior": "Landscaping",
  Drywall: "Drywall & Wall Repair",
  "Water Damage": "Water Damage",
  "Garage Doors": "Garage & Garage Doors",
};

/**
 * Services highlighted first in the dropdown for each area.
 * Full list remains available after the related options.
 */
export const HOMEOWNER_AREA_SERVICE_PRIORITY: Record<HomeownerArea, HomeownerService[]> = {
  Kitchen: [
    "Kitchen",
    "Appliances",
    "Plumbing",
    "Electrical",
    "Flooring",
    "Painting",
    "Lighting",
    "Handyman",
    "Smart Home & Technology",
    "Cleaning",
  ],
  Bathroom: [
    "Bathroom",
    "Plumbing",
    "Flooring",
    "Electrical",
    "Painting",
    "Drywall & Wall Repair",
    "Handyman",
    "Cleaning",
  ],
  Garage: [
    "Garage & Garage Doors",
    "Electrical",
    "Flooring",
    "Lighting",
    "Locks & Security",
    "Handyman",
    "Concrete & Driveways",
  ],
  Gutters: ["Roofing & Gutters", "Siding", "Handyman", "Landscaping", "Landscaping & Yard"],
  "Yard & Exterior": [
    "Landscaping",
    "Snow Removal",
    "Landscaping & Yard",
    "Fences & Gates",
    "Concrete & Driveways",
    "Pest Control",
    "Handyman",
  ],
  Drywall: ["Drywall & Wall Repair", "Painting", "Handyman", "Carpentry"],
  "Water Damage": [
    "Water Damage",
    "Plumbing",
    "Drywall & Wall Repair",
    "Flooring",
    "Cleaning",
    "Roofing & Gutters",
  ],
  "Garage Doors": [
    "Garage & Garage Doors",
    "Doors & Hardware",
    "Electrical",
    "Locks & Security",
    "Handyman",
  ],
};

export function servicesForArea(area: HomeownerArea | ""): HomeownerService[] {
  if (!area) return [...HOMEOWNER_SERVICES];
  const priority = HOMEOWNER_AREA_SERVICE_PRIORITY[area] || [];
  const rest = HOMEOWNER_SERVICES.filter((s) => !priority.includes(s));
  return [...priority, ...rest];
}

export function jobTitleForHomeowner(area: string, service: string, subServiceLabel?: string) {
  const a = String(area || "").trim();
  const s = String(service || "").trim();
  if (subServiceLabel) {
    if (a && a.toLowerCase() !== s.toLowerCase()) return `${a} · ${s} · ${subServiceLabel}`;
    return `${s} · ${subServiceLabel}`;
  }
  if (!a) return s || "Service request";
  if (!s || a.toLowerCase() === s.toLowerCase()) return a;
  return `${a} · ${s}`;
}
