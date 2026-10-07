import { defaultServiceOfferings } from '../api/service-offerings.js';
export const SITE_ORIGIN = 'https://fixbridge.us';
export const SOLUTION_PAGES = [{
  page: 'home-repair',
  path: '/home-repair',
  label: 'Home repair',
  title: 'Home Repair Requests & Professional Coordination | FixBridge',
  description: 'Explore plumbing, electrical, interior and exterior repair requests. Learn what to record, when to stop, and how FixBridge coordinates the next step.',
  intro: 'A repair starts with an observable problem, not a guessed diagnosis. FixBridge helps you record the issue, connect it to a property and choose professional help or an eligible AI assessment.',
  focus: 'Repairs to the home and its systems',
  ids: ['plumbing', 'electrical', 'carpentry', 'flooring', 'painting', 'roofing_gutters', 'siding', 'windows_glass', 'bathroom', 'kitchen', 'water_damage', 'drywall_wall_repair'],
  sections: [['Record the symptoms before requesting work', 'Describe where the problem occurs, when it started and whether it is getting worse. Add a wide view and a close-up from a safe position. Note any recent work and avoid treating a photo as proof of a hidden cause. A leak, stain or loss of power may have several explanations.'], ['Choose a repair category, then review the scope', 'Select the closest service in your signed-in Services workspace. Kitchen and bathroom requests describe the room; plumbing, electrical and other trade categories describe the work. A professional may need to inspect before confirming scope, parts or pricing.'], ['Keep high-risk work with a professional', 'Gas smells, sparking, exposed live wiring, structural movement and water near electricity need immediate safety attention. Do not use this website as emergency response. For immediate danger, move to safety and contact local emergency services or the relevant utility.']]
}, {
  page: 'appliance-repair',
  path: '/appliance-repair',
  label: 'Appliance repair',
  title: 'Appliance Repair: Photos, Symptoms & Service Requests | FixBridge',
  description: 'Prepare a refrigerator, washer, dryer, oven or dishwasher service request with symptoms and equipment details. Understand AI limits and professional next steps.',
  intro: 'Appliance issues are easier to explain when the symptoms and equipment identity travel together. FixBridge can keep your appliance request with the selected property and its recorded repair history.',
  focus: 'Kitchen and laundry appliances',
  ids: ['appliances'],
  sections: [['Useful details for an appliance request', 'Record the appliance type, the displayed error code, unusual noise, temperature or cycle behavior, and when the issue began. Include brand and model only when you can read them reliably. Photograph the model label only if it is safely accessible; do not move a heavy appliance or open a panel to obtain it.'], ['Model identity matters for parts', 'Similar-looking appliances may need different parts. An AI assessment is advisory and may ask for more evidence. A photograph cannot confirm every internal failure, electrical fault, refrigerant problem or replacement part. Final diagnosis and part compatibility may require a professional inspection.'], ['Keep the next visit connected to the history', 'Select an existing appliance in My Property when appropriate. Prior reported work can provide context, but a previous successful repair does not prove the current cause. Keep invoices and homeowner-reviewed equipment details with the property.']]
}, {
  page: 'home-maintenance',
  path: '/home-maintenance',
  label: 'Home maintenance',
  title: 'Home Maintenance Planning & Service Coordination | FixBridge',
  description: 'Plan heating and cooling upkeep, cleaning and pest-control requests with property records and maintenance reminders. Review plan eligibility and service availability.',
  intro: 'Maintenance is planned upkeep rather than diagnosis of a new fault. FixBridge brings service requests, maintenance records and property information into one homeowner workspace.',
  focus: 'Planned indoor upkeep',
  ids: ['hvac_heating_cooling', 'cleaning', 'pest_control'],
  sections: [['Plan around the equipment and the season', 'Use manufacturer instructions and advice from a qualified professional to decide appropriate intervals. Record installation details and the last reported service when known. A reminder is a planning aid; it does not establish that a system is safe or that maintenance has been performed.'], ['Check eligible recurring options', 'Some services offer recurring coordination with frequency and activation options in the signed-in catalog. Choices depend on the service and current configuration. Review the displayed schedule, terms and any charges before confirming. HomeCare features require the eligible active plan shown in your account.'], ['Separate routine upkeep from an urgent problem', 'If equipment stops working, shows damage or creates a safety concern, report the symptoms as a repair request instead of waiting for a planned visit. Cleaning and pest work should be scoped to the actual property need and professional advice.']]
}, {
  page: 'property-care',
  path: '/property-care',
  label: 'Property care',
  title: 'Property Care, Outdoor Services & Home Records | FixBridge',
  description: 'Explore yard, snow, fence and driveway service requests and connect outdoor work to property history. Learn how Property Passport and reviewed records support care.',
  intro: 'Property care connects outdoor work with the home it belongs to. FixBridge keeps property selection, service requests and reported outcomes together so later decisions can use the relevant record.',
  focus: 'Outdoor and seasonal property needs',
  ids: ['concrete_driveways', 'fences_gates', 'landscaping', 'landscaping_yard', 'snow_removal'],
  sections: [['Describe the area and access needs', 'Record the affected yard, driveway, walkway, fence or gate and provide safe photos. Explain access restrictions and what you want completed. Outdoor work depends on conditions, scope and professional availability; a catalog listing is not a promise of local capacity.'], ['Landscaping labels share one care path', 'Landscaping and Landscaping & Yard are both existing catalog options. They are grouped here because lawn, yard and seasonal upkeep overlap. Keeping one useful guide avoids separate pages that repeat the same information. Choose the appropriate option in Services when making the request.'], ['Connect work to Property Passport', 'Keep reported repairs, equipment details and homeowner-reviewed records with the selected property. Document vault files are not automatically read into a diagnosis: current assessment context uses metadata and details explicitly reviewed or entered by the homeowner. These records assist planning and do not certify property condition.']]
}, {
  page: 'broken-home-items',
  path: '/broken-home-items',
  label: 'Broken home items',
  title: 'Broken Home Items: Identify the Right Service Request | FixBridge',
  description: 'Find a starting point for doors, garage doors, lighting, locks, smart-home devices and handyman needs. Record safe observations without assuming a diagnosis.',
  intro: 'Not every broken item fits a familiar trade. Start with what you can observe, then use the closest catalog category. This guide helps route smaller fixtures, access hardware and home technology requests.',
  focus: 'Fixtures, access and technology',
  ids: ['doors_hardware', 'garage_garage_doors', 'handyman', 'lighting', 'locks_security', 'smart_home_technology', 'other'],
  sections: [['Describe behavior instead of guessing the fix', 'Explain whether the item sticks, will not respond, has visible damage or behaves intermittently. Give its location, relevant equipment identity and safe photos. Do not share access codes, passwords or security credentials in a public description or image.'], ['Use the closest category', 'Doors & Hardware and Locks & Security distinguish general fittings from access hardware. Lighting can overlap Electrical when wiring is involved. Use Other when the need does not fit the named categories; the request still needs a clear description and review before scope is accepted.'], ['Know the limit of a photo', 'A photo may show damage without showing the cause. Garage-door springs, live circuits and security-system changes can involve hazards or specialist work. Do not dismantle equipment to get a better picture. Fixera may ask for more details or direct you toward professional help.']]
}];
export const CATALOG = defaultServiceOfferings();
export const PUBLIC_PAGES = [{
  page: 'home',
  path: '/',
  title: 'FixBridge | Home Repair & Property Care',
  description: 'Organize home repair requests, property records and professional service coordination with FixBridge. Eligible HomeCare plans provide access to Fixera AI assessments.'
}, {
  page: 'contractors',
  path: '/contractors',
  title: 'Contractor Service Coordination | FixBridge',
  description: 'Learn how contractors use FixBridge to review service requests, submit proposals and track work. Participation and service availability depend on account approval.'
}, {
  page: 'about',
  path: '/about',
  title: 'About FixBridge & Fixera | Home Repair and Property Care',
  description: 'Learn what FixBridge does, how Fixera supports eligible repair assessments, and explore all catalog services through five practical repair and property-care guides.'
}, {
  page: 'go-pro',
  path: '/go-pro',
  title: 'HomeCare Plans & Eligible Features | FixBridge',
  description: 'Review FixBridge HomeCare options for eligible AI assessments, property records and ongoing home management. Confirm current features, prices and terms before purchase.'
}, ...SOLUTION_PAGES];
export const PRIVATE_PATHS = {
  'homeowner-login': '/homeowner-login',
  'contractor-login': '/contractor-login',
  'admin-login': '/admin-login',
  partner: '/partner',
  'homeowner-dashboard': '/homeowner-dashboard',
  'contractor-dashboard': '/contractor-dashboard',
  admin: '/admin'
};
export function publicPageForPath(path) {
  return PUBLIC_PAGES.find(p => p.path === (path.replace(/\/+$/, '') || '/'));
}
export function pagePath(page) {
  return PUBLIC_PAGES.find(p => p.page === page)?.path || PRIVATE_PATHS[page] || '/';
}
export function pageMeta(page) {
  return PUBLIC_PAGES.find(p => p.page === page) || {
    title: 'Account | FixBridge',
    description: 'Sign in to your FixBridge account.',
    path: PRIVATE_PATHS[page] || '/',
    private: true
  };
}
export function structuredData(page) {
  const meta = pageMeta(page);
  if (meta.private) return null;
  const url = SITE_ORIGIN + meta.path;
  return {
    '@context': 'https://schema.org',
    '@graph': [{
      '@type': 'Organization',
      '@id': SITE_ORIGIN + '/#organization',
      name: 'FixBridge',
      url: SITE_ORIGIN + '/',
      logo: SITE_ORIGIN + '/fixbridge-logo.png',
      description: 'Home repair requests, property records and professional service coordination.'
    }, {
      '@type': page === 'about' ? 'AboutPage' : 'WebPage',
      '@id': url + '#webpage',
      url,
      name: meta.title,
      description: meta.description,
      inLanguage: 'en',
      about: {
        '@id': SITE_ORIGIN + '/#organization'
      }
    }, ...(SOLUTION_PAGES.some(p => p.page === page) ? [{
      '@type': 'BreadcrumbList',
      itemListElement: [{
        '@type': 'ListItem',
        position: 1,
        name: 'FixBridge',
        item: SITE_ORIGIN + '/'
      }, {
        '@type': 'ListItem',
        position: 2,
        name: 'Services & Solutions',
        item: SITE_ORIGIN + '/about#services-solutions'
      }, {
        '@type': 'ListItem',
        position: 3,
        name: meta.label,
        item: url
      }]
    }] : [])]
  };
}
