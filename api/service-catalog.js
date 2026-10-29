/**
 * Backend service taxonomy — keep in sync with src/app/serviceCatalog.ts
 */

export const SNOW_REMOVAL_SUB_SERVICES = [
  { id: 'residential_snow_removal', label: 'Residential snow removal' },
  { id: 'driveway_snow_removal', label: 'Driveway snow removal' },
  { id: 'sidewalk_walkway_clearing', label: 'Sidewalk / walkway clearing' },
  { id: 'snow_shoveling', label: 'Snow shoveling' },
  { id: 'snow_plowing', label: 'Snow plowing' },
  { id: 'deicing_salting', label: 'De-icing / salting' },
  { id: 'ice_management', label: 'Ice management' },
  { id: 'commercial_snow_removal', label: 'Commercial snow removal' },
];

export const LANDSCAPING_SUB_SERVICES = [
  { id: 'lawn_mowing', label: 'Lawn mowing' },
  { id: 'lawn_maintenance', label: 'Lawn maintenance' },
  { id: 'yard_cleanup', label: 'Yard cleanup' },
  { id: 'leaf_removal', label: 'Leaf removal' },
  { id: 'hedge_bush_trimming', label: 'Hedge / bush trimming' },
  { id: 'mulching', label: 'Mulching' },
  { id: 'garden_maintenance', label: 'Garden maintenance' },
  { id: 'seasonal_cleanup', label: 'Seasonal cleanup' },
  { id: 'lawn_edging', label: 'Lawn edging' },
  { id: 'general_landscaping', label: 'General landscaping' },
  { id: 'landscape_maintenance', label: 'Small landscape maintenance' },
];

export const CLEANING_SUB_SERVICES = [
  { id: 'general_home_cleaning', label: 'General home cleaning' },
  { id: 'deep_cleaning', label: 'Deep cleaning' },
  { id: 'move_in_cleaning', label: 'Move-in cleaning' },
  { id: 'move_out_cleaning', label: 'Move-out cleaning' },
  { id: 'kitchen_cleaning', label: 'Kitchen cleaning' },
  { id: 'bathroom_cleaning', label: 'Bathroom cleaning' },
  { id: 'apartment_cleaning', label: 'Apartment cleaning' },
  { id: 'post_renovation_cleanup', label: 'Post-renovation cleanup' },
  { id: 'recurring_cleaning', label: 'Recurring cleaning' },
  { id: 'one_time_cleaning', label: 'One-time cleaning' },
];

export const TRADE_MATCH_TERMS = {
  Plumbing: ['plumbing', 'plumber', 'pipe', 'drain'],
  Electrical: ['electrical', 'electrician', 'wiring', 'panel'],
  HVAC: ['hvac', 'heating', 'cooling', 'air conditioning', 'ventilation'],
  'HVAC & Heating/Cooling': ['hvac', 'heating', 'cooling', 'air conditioning', 'ventilation'],
  Painting: ['painting', 'painter', 'paint'],
  Roofing: ['roofing', 'roofer', 'roof', 'gutter'],
  'Roofing & Gutters': ['roofing', 'roofer', 'roof', 'gutter'],
  Flooring: ['flooring', 'floor', 'tile', 'hardwood', 'laminate'],
  Carpentry: ['carpentry', 'carpenter', 'framing', 'woodwork'],
  'Snow Removal': ['snow', 'snow removal', 'plow', 'plowing', 'shovel', 'de-ice', 'deice', 'salting', 'ice management'],
  Snow: ['snow', 'snow removal', 'plow', 'plowing', 'shovel', 'de-ice', 'salting'],
  Landscaping: ['landscape', 'landscaping', 'lawn', 'yard', 'mulch', 'hedge', 'garden', 'leaf', 'mowing', 'trimming'],
  'Landscaping & Yard': ['landscape', 'landscaping', 'lawn', 'yard', 'mulch', 'hedge', 'garden', 'leaf', 'mowing'],
  Cleaning: ['cleaning', 'clean', 'janitorial', 'maid', 'housekeeping', 'deep clean', 'move-out', 'move-in'],
  Janitorial: ['cleaning', 'clean', 'janitorial', 'maid', 'housekeeping'],
  Appliances: ['appliance', 'appliances'],
  'Concrete & Driveways': ['concrete', 'asphalt', 'driveway'],
  'Doors & Hardware': ['door', 'hardware'],
  'Fences & Gates': ['fence', 'gate'],
  'Garage & Garage Doors': ['garage', 'door'],
  Handyman: ['handyman', 'general', 'maintenance'],
  Lighting: ['lighting', 'light', 'electrical'],
  'Locks & Security': ['lock', 'security'],
  'Pest Control': ['pest', 'exterminat'],
  Siding: ['siding'],
  'Windows & Glass': ['window', 'glass'],
  Bathroom: ['bathroom', 'plumbing', 'bath'],
  Kitchen: ['kitchen', 'appliance', 'plumbing'],
  'Water Damage': ['water damage', 'flood', 'restoration', 'mold'],
  'Drywall & Wall Repair': ['drywall', 'wall', 'plaster'],
  'Smart Home & Technology': ['smart home', 'technology', 'tech', 'low voltage'],
  Other: ['contractor', 'handyman', 'general'],
  Others: ['contractor', 'handyman', 'general'],
};

export function normalizeServiceSlug(category = '') {
  const c = String(category).toLowerCase().trim();
  if (c.includes('snow') || c.includes('plow') || c.includes('de-ic') || c.includes('deic') || c.includes('salting')) {
    return 'snow_removal';
  }
  if (c.includes('landscape') || c.includes('lawn') || c.includes('yard') || c.includes('mulch') || c.includes('hedge')) {
    return 'landscaping';
  }
  if (c.includes('clean') || c.includes('janitor') || c.includes('maid')) {
    return 'cleaning';
  }
  if (c.includes('plumb')) return 'plumbing';
  if (c.includes('electr')) return 'electrical';
  if (c.includes('hvac') || c.includes('heat') || c.includes('cool')) return 'hvac';
  if (c.includes('paint')) return 'painting';
  if (c.includes('roof') || c.includes('gutter')) return 'roofing';
  if (c.includes('floor')) return 'flooring';
  if (c.includes('carp') || c.includes('wood')) return 'carpentry';
  return 'others';
}

export function formatServiceLabel(category = '') {
  const slug = normalizeServiceSlug(category);
  const map = {
    plumbing: 'Plumbing',
    electrical: 'Electrical',
    hvac: 'HVAC',
    painting: 'Painting',
    roofing: 'Roofing',
    flooring: 'Flooring',
    carpentry: 'Carpentry',
    snow_removal: 'Snow Removal',
    landscaping: 'Landscaping',
    cleaning: 'Cleaning',
    others: 'Other',
  };
  if (map[slug] && slug !== 'others') return map[slug];
  const raw = String(category || '').trim();
  return raw || 'Other';
}

export function contractorTradesMatchCategory(jobCategory, contractorTrade) {
  const category = String(jobCategory || '').trim();
  if (!category || category === 'Others' || category === 'Other') return true;
  const trade = String(contractorTrade || '').toLowerCase().trim();
  if (!trade) return false;

  const terms = TRADE_MATCH_TERMS[category];
  if (terms?.some((term) => trade.includes(term))) return true;

  const slug = normalizeServiceSlug(category);
  const slugTerms = {
    plumbing: ['plumb'],
    electrical: ['electr'],
    hvac: ['hvac', 'heat', 'cool'],
    painting: ['paint'],
    roofing: ['roof', 'gutter'],
    flooring: ['floor'],
    carpentry: ['carp', 'wood'],
    snow_removal: ['snow', 'plow', 'shovel', 'de-ice', 'deic', 'salting', 'ice'],
    landscaping: ['landscape', 'lawn', 'yard', 'mulch', 'hedge', 'garden', 'mow', 'leaf'],
    cleaning: ['clean', 'janitor', 'maid', 'housekeep'],
    others: [],
  };
  const slugHits = slugTerms[slug] || [];
  if (slugHits.some((term) => trade.includes(term))) return true;

  const words = category
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !['with', 'and', 'from', 'type'].includes(w));
  return words.some((w) => trade.includes(w));
}
