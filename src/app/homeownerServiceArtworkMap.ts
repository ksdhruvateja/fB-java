import { HOMEOWNER_SERVICE_PHOTOS } from "./homeownerServicePhotoMap";
const SEMANTIC_PHOTOS: Array<[RegExp, string]> = [
  [/electric|outlet|breaker|circuit|wiring/i, "Electrical"], [/garage/i, "Garage & Garage Doors"], [/water damage|flood/i, "Water Damage"],
  [/drywall|wall repair/i, "Drywall & Wall Repair"], [/smart home|technology/i, "Smart Home & Technology"],
  [/clean|janitorial/i, "Cleaning"], [/landscap|yard|lawn/i, "Landscaping"],
  [/hvac|heating|cooling|air condition|\bac\b|thermostat|air filter/i, "HVAC & Heating/Cooling"],
  [/plumb|drain|pipe|faucet|toilet|water heater|water pressure/i, "Plumbing"],
  [/roof|gutter/i, "Roofing & Gutters"], [/floor/i, "Flooring"],
  [/lock|security/i, "Locks & Security"], [/door|hardware/i, "Doors & Hardware"],
  [/fence|gate/i, "Fences & Gates"], [/snow|de-ic/i, "Snow Removal"],
  [/window|glass/i, "Windows & Glass"], [/siding/i, "Siding"],
  [/paint/i, "Painting"], [/handyman/i, "Handyman"],
  [/appliance|refrigerator|oven/i, "Appliances"], [/carpentr|woodwork/i, "Carpentry"],
  [/concrete|driveway/i, "Concrete & Driveways"], [/light/i, "Lighting"],
  [/pest|termite/i, "Pest Control"], [/bathroom/i, "Bathroom"], [/kitchen/i, "Kitchen"],
];
export function homeownerServiceArtwork(name: string, serviceId?: string | null, categoryName?: string | null) {
  const normalized = name.trim();
  const candidates = [serviceId, categoryName, normalized].filter(Boolean) as string[];
  // Stable offering IDs and exact category labels win over descriptive display names.
  const aliases: Record<string, string> = { hvac: "HVAC & Heating/Cooling", appliance: "Appliances", pest: "Pest Control", roofing: "Roofing & Gutters", recurring_cleaning: "Cleaning", recurring_landscaping: "Landscaping", "Other / Not Sure": "Other" };
  const category = candidates.map(value => Object.prototype.hasOwnProperty.call(HOMEOWNER_SERVICE_PHOTOS, value) ? value
    : Object.entries(HOMEOWNER_SERVICE_PHOTOS).find(([, photo]) => photo.id === value.toLowerCase())?.[0] || aliases[value])
    .find(Boolean) || SEMANTIC_PHOTOS.find(([pattern]) => pattern.test(normalized))?.[1];
  const photo = category ? HOMEOWNER_SERVICE_PHOTOS[category] : undefined;
  const base = photo ? `/brand/service-photos/${photo.id}` : null;
  return { id: photo?.id || null, category: category || null, mapped: Boolean(photo), src: base ? `${base}-480.webp` : null,
    srcSet: base ? `${base}-480.webp 480w, ${base}-960.webp 960w` : undefined, alt: photo?.alt || "" };
}
