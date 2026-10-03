// Explicit coverage for the homeowner catalog. Only visually vetted assets belong here.
const ARTWORK: Record<string, string | null> = {
  Appliances: null, Carpentry: null, "Concrete & Driveways": null,
  "Doors & Hardware": "doors.png", Electrical: null,
  "Fences & Gates": "fences.png", Flooring: "flooring.png",
  "Garage & Garage Doors": "garage.png", Handyman: "handyman.png",
  "HVAC & Heating/Cooling": "hvac.png", Landscaping: "landscaping.png",
  "Landscaping & Yard": "landscaping.png", Lighting: null,
  "Locks & Security": "locks.png", Painting: "painting.png", "Pest Control": null,
  Plumbing: "plumbing.png", "Roofing & Gutters": "roofing.png", Siding: "siding.png",
  "Snow Removal": "snow.png", "Windows & Glass": "windows.png",
  Bathroom: null, Kitchen: null, "Water Damage": "water-damage.png",
  "Drywall & Wall Repair": "drywall.png", Cleaning: "cleaning.png",
  "Smart Home & Technology": "smart-home.png", Other: null,
};

const SEMANTIC_ARTWORK: Array<[RegExp, string]> = [
  [/garage/i, "garage.png"], [/water damage|flood/i, "water-damage.png"],
  [/drywall|wall repair/i, "drywall.png"], [/smart home|technology/i, "smart-home.png"],
  [/clean|janitorial/i, "cleaning.png"], [/landscap|yard|lawn/i, "landscaping.png"],
  [/hvac|heating|cooling|air condition|\bac\b|thermostat|air filter/i, "hvac.png"],
  [/plumb|drain|pipe|faucet|toilet|water heater|water pressure/i, "plumbing.png"],
  [/roof|gutter/i, "roofing.png"], [/floor/i, "flooring.png"],
  [/door|hardware/i, "doors.png"], [/fence|gate/i, "fences.png"],
  [/lock|security/i, "locks.png"], [/snow|de-ic/i, "snow.png"],
  [/window|glass/i, "windows.png"], [/siding/i, "siding.png"],
  [/paint/i, "painting.png"], [/handyman/i, "handyman.png"],
];

export function homeownerServiceArtwork(name: string) {
  const normalized = name.trim();
  if (Object.prototype.hasOwnProperty.call(ARTWORK, normalized)) {
    return { mapped: true, src: ARTWORK[normalized] ? `/brand/services/${ARTWORK[normalized]}` : null };
  }
  const semantic = SEMANTIC_ARTWORK.find(([pattern]) => pattern.test(normalized));
  return { mapped: Boolean(semantic), src: semantic ? `/brand/services/${semantic[1]}` : null };
}
