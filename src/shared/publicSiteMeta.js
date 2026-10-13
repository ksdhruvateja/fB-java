/**
 * Public content pages: URL paths, titles and descriptions. Shared by the browser app (routing,
 * document title) and the server (per-page <title>/meta for crawlers, sitemap.xml).
 * Plain JS so server.js can import it without a build step.
 */

/** @typedef {'blog'|'press'|'careers'|'contact'|'how-it-works'|'fixera-assessment'|'find-a-contractor'} PublicContentPage */

export const PUBLIC_CONTENT_PAGES = {
  'how-it-works': {
    path: '/how-it-works',
    title: 'How FixBridge Works',
    description:
      'See how FixBridge works for homeowners: add your property, describe a repair, get a Fixera AI assessment or hire a verified professional, approve quotes, pay and track the job.',
  },
  'fixera-assessment': {
    path: '/fixera-assessment',
    title: 'Fixera AI Repair Assessment',
    description:
      'Fixera reviews photos and details of a home repair, explains likely causes, checks DIY safety, and gives guided steps or hands the job to a professional. Included with HomeCare Pro.',
  },
  'find-a-contractor': {
    path: '/find-a-contractor',
    title: 'Find a Contractor',
    description:
      'Request a professional through FixBridge: describe the job, review the estimate, authorize the visit and approve the final quote before work begins.',
  },
  blog: {
    path: '/blog',
    title: 'Home Maintenance & Repair Blog',
    description:
      'Practical home maintenance, DIY repair and seasonal property care guides from FixBridge, with clear advice on when to call a professional.',
  },
  press: {
    path: '/press',
    title: 'Press & Media',
    description: 'Company overview, mission and media contact information for FixBridge.',
  },
  careers: {
    path: '/careers',
    title: 'Careers',
    description: 'Learn about working at FixBridge. There are currently no open positions.',
  },
  contact: {
    path: '/contact',
    title: 'Contact FixBridge',
    description:
      'Contact FixBridge for support, homeowner assistance, contractor partnerships, business or media inquiries.',
  },
};

export const BLOG_CATEGORIES = [
  'Home Maintenance',
  'DIY Repair',
  'Seasonal Maintenance',
  'Property Care',
  'Industry Insights',
];

/**
 * Blog articles. Body blocks: { p } paragraph, { h } heading, { ul } list, { note } callout.
 * Keep advice general, accurate and safety-first; link readers to a professional where needed.
 */
export const BLOG_POSTS = [
  {
    slug: 'how-often-to-replace-hvac-air-filter',
    title: 'How Often Should You Replace Your HVAC Air Filter?',
    description:
      'Most 1-inch furnace and AC filters need replacing every 1 to 3 months. Here is how to tell when yours is due and how to change it correctly.',
    category: 'Home Maintenance',
    tags: ['hvac', 'air filter', 'furnace', 'air conditioning', 'indoor air'],
    published: '2026-10-13',
    body: [
      { p: 'A clean air filter is one of the simplest ways to protect your heating and cooling system. A clogged filter restricts airflow, makes the system work harder, and lets more dust circulate through your home.' },
      { h: 'General replacement intervals' },
      { ul: [
        'Standard 1-inch filters: about every 1 to 3 months.',
        'Thicker 4- to 5-inch media filters: often every 6 to 12 months, depending on the manufacturer.',
        'Replace more often if you have pets, allergies, smokers in the home, or recent renovation dust.',
      ] },
      { p: 'These are starting points. The filter manufacturer and your HVAC equipment manual take priority.' },
      { h: 'How to check your filter' },
      { p: 'Pull the filter out once a month and hold it up to a light. If light barely passes through, or the surface is grey and matted, replace it.' },
      { h: 'Changing the filter' },
      { ul: [
        'Turn the system off at the thermostat before removing the filter.',
        'Match the exact size printed on the old filter frame (for example 16x25x1).',
        'Install the new filter with the airflow arrow pointing toward the blower or furnace, away from the return grille.',
        'Write the date on the frame so you know when it was changed.',
      ] },
      { note: 'Higher-efficiency filters capture more particles but can restrict airflow in some systems. If you are unsure which rating your equipment supports, check the manual or ask an HVAC professional.' },
      { h: 'When it is more than a filter' },
      { p: 'If the system still struggles after a fresh filter — weak airflow, ice on the indoor coil, short cycling, or unusual noises — have it inspected by a licensed HVAC technician.' },
    ],
  },
  {
    slug: 'seasonal-home-maintenance-checklist',
    title: 'A Seasonal Home Maintenance Checklist',
    description:
      'A practical spring, summer, fall and winter checklist to catch small problems before they become expensive repairs.',
    category: 'Seasonal Maintenance',
    tags: ['checklist', 'gutters', 'roof', 'smoke alarm', 'seasonal'],
    published: '2026-10-13',
    body: [
      { p: 'Most expensive home repairs start small. A short routine each season helps you spot issues early. Adjust the list for your climate and your home.' },
      { h: 'Spring' },
      { ul: [
        'Clean gutters and make sure downspouts carry water away from the foundation.',
        'Look over the roof from the ground for missing or damaged shingles after winter storms.',
        'Schedule air-conditioning service before the cooling season.',
        'Check exterior caulking and weatherstripping around windows and doors.',
        'Test the sump pump, if you have one, by pouring water into the pit.',
      ] },
      { h: 'Summer' },
      { ul: [
        'Inspect decks, railings and steps for loose boards or fasteners.',
        'Clean the dryer vent duct and the exterior vent flap to reduce fire risk.',
        'Trim plants and branches away from the house and the outdoor AC unit.',
      ] },
      { h: 'Fall' },
      { ul: [
        'Clean gutters again after the leaves have fallen.',
        'Have the furnace or heating system serviced before cold weather.',
        'Disconnect garden hoses and shut off outdoor faucets in freezing climates.',
        'Test smoke and carbon monoxide alarms, and replace batteries as the manufacturer recommends.',
      ] },
      { h: 'Winter' },
      { ul: [
        'Watch for ice dams along the roof edge and water stains on ceilings.',
        'Keep furnace, dryer and other exhaust vents clear of snow.',
        'Check for drafts and condensation around windows.',
      ] },
      { note: 'Do not climb onto the roof yourself for inspections. Use binoculars from the ground, and hire a professional for any roof work.' },
    ],
  },
  {
    slug: 'water-pooling-around-faucet-base',
    title: 'Water Pooling Around Your Faucet Base? What to Check',
    description:
      'Water collecting around the base of a faucet usually points to worn O-rings, a worn cartridge or a loose mounting. Here is how to narrow it down safely.',
    category: 'DIY Repair',
    tags: ['plumbing', 'faucet', 'leak', 'cartridge', 'o-ring', 'kitchen'],
    published: '2026-10-13',
    body: [
      { p: 'If water collects around the base of a faucet while it is running, the leak is usually inside the faucet body rather than at the spout.' },
      { h: 'Common causes' },
      { ul: [
        'Worn O-rings on a swivel spout, which let water seep down around the base.',
        'A worn cartridge or valve seals in single-handle faucets.',
        'A loose mounting nut or a failed base gasket or sealant.',
        'On pull-out faucets, a leaking hose connection inside the spout.',
      ] },
      { h: 'Narrowing it down' },
      { ul: [
        'Dry the faucet and countertop completely.',
        'Run water and watch where it first appears: under the handle, at the spout joint, or at the base.',
        'Look under the sink with a flashlight for drips on the supply lines or the pull-out hose.',
      ] },
      { h: 'Before any repair' },
      { ul: [
        'Close both shut-off valves under the sink, then open the faucet to release pressure.',
        'Plug the sink drain so small parts cannot fall in.',
        'Photograph each part as you remove it so you can reassemble it in order.',
        'Take the old cartridge or O-rings to the store to match replacements, or note the faucet brand and model.',
      ] },
      { note: 'If a shut-off valve is stuck, leaks when turned, or the supply lines are corroded, stop and call a plumber. Forcing an old valve can cause a much larger leak.' },
      { p: 'If water has been reaching the cabinet floor for a while, check for soft or swollen wood and mold, and have any damage assessed.' },
    ],
  },
  {
    slug: 'water-heater-basics',
    title: 'Water Heater Basics: Temperature, Flushing and the Relief Valve',
    description:
      'Simple habits that help a tank water heater last longer and operate safely, plus the warning signs that need a professional.',
    category: 'Property Care',
    tags: ['water heater', 'temperature', 'relief valve', 'sediment', 'safety'],
    published: '2026-10-13',
    body: [
      { p: 'A tank water heater is easy to forget until it fails. A few checks help it last longer and run safely.' },
      { h: 'Temperature setting' },
      { p: 'The U.S. Department of Energy suggests a setting of 120°F for most households. It lowers the risk of scalding and saves energy. Some households have specific needs, so check with your manufacturer or a professional if you are unsure.' },
      { h: 'Flushing sediment' },
      { p: 'Minerals settle at the bottom of the tank over time, which can cause rumbling noises and reduce efficiency. Many manufacturers recommend draining a few gallons or flushing the tank periodically. Follow your unit’s manual, and let the water cool first.' },
      { h: 'The temperature and pressure relief valve' },
      { ul: [
        'The relief valve releases water if temperature or pressure gets too high. It is a critical safety device.',
        'Never cap, plug or remove the relief valve or its discharge pipe.',
        'Test it only as the manufacturer describes. A valve that drips or discharges regularly needs a professional.',
      ] },
      { h: 'When to call a professional' },
      { ul: [
        'You smell gas near a gas water heater — leave the home and call your gas utility from outside.',
        'Water is leaking from the tank itself.',
        'The relief valve is discharging, or you see rust-colored water from the hot side only.',
        'The pilot or burner will not stay lit, or you see scorch marks.',
      ] },
    ],
  },
  {
    slug: 'prevent-frozen-pipes',
    title: 'How to Prevent Frozen Pipes This Winter',
    description:
      'Which pipes are most at risk, simple ways to protect them, and what to do if a pipe freezes or bursts.',
    category: 'Seasonal Maintenance',
    tags: ['winter', 'plumbing', 'frozen pipes', 'insulation', 'main shut-off'],
    published: '2026-10-13',
    body: [
      { p: 'Water expands when it freezes, and the pressure can split a pipe. Pipes in unheated spaces — attics, crawl spaces, garages and exterior walls — are most at risk.' },
      { h: 'Before cold weather' },
      { ul: [
        'Find your main water shut-off valve and make sure it turns.',
        'Insulate exposed pipes in unheated areas with foam pipe sleeves.',
        'Disconnect garden hoses and shut off and drain outdoor faucets.',
        'Seal gaps where cold air reaches pipes, such as around sill plates and vents.',
      ] },
      { h: 'During a cold snap' },
      { ul: [
        'Keep the thermostat at a steady temperature day and night. If you travel, do not set it below 55°F.',
        'Open sink cabinet doors on exterior walls so warm air reaches the pipes.',
        'Let a faucet on an exterior wall drip slightly during extreme cold.',
      ] },
      { h: 'If a pipe freezes' },
      { ul: [
        'Open the faucet so melting water can flow.',
        'Warm the pipe gently with a hair dryer or heating pad, working from the faucet toward the frozen section.',
        'Never use an open flame or torch.',
        'If you cannot reach or thaw the section, call a plumber.',
      ] },
      { note: 'If a pipe bursts, close the main water shut-off immediately, keep away from electrical outlets and devices near the water, and call a plumber.' },
    ],
  },
  {
    slug: 'diy-or-call-a-professional',
    title: 'DIY or Call a Professional? A Practical Guide',
    description:
      'How to judge whether a home repair is a reasonable DIY job or one that needs a licensed professional.',
    category: 'DIY Repair',
    tags: ['diy', 'safety', 'electrical', 'gas', 'permits', 'professional'],
    published: '2026-10-13',
    body: [
      { p: 'Many small repairs are well within reach of a careful homeowner. Others carry real risk to you or your home. The type of work matters less than the hazards involved and your experience.' },
      { h: 'Often reasonable to DIY' },
      { ul: [
        'Replacing HVAC filters and smoke alarm batteries.',
        'Re-caulking a tub, sink or window.',
        'Replacing a toilet flapper or a faucet cartridge.',
        'Patching small holes in drywall.',
      ] },
      { h: 'Call a professional' },
      { ul: [
        'Any smell of gas — leave and call your gas utility from outside.',
        'Electrical panel work, sparking, burning smells or hot outlets.',
        'Structural cracks, sagging ceilings or floors.',
        'Roof work or anything that requires working at height.',
        'Sewage backups.',
        'Suspected asbestos or lead paint, which is common in homes built before 1978.',
        'Air-conditioning refrigerant, which requires EPA certification to handle.',
      ] },
      { h: 'Permits and codes' },
      { p: 'Some work requires a permit or a licensed trade under local rules. Requirements vary by city and state, so check with your local building department before larger projects.' },
      { note: 'Stop any repair if conditions are different from what you expected, you do not have the right tools, or you feel unsure. Stopping early is always cheaper than repairing a mistake.' },
    ],
  },
  {
    slug: 'what-ai-home-repair-assessment-can-and-cannot-do',
    title: 'What AI Home Repair Assessment Can — and Cannot — Do',
    description:
      'How photo-based AI assessment helps homeowners understand a repair, and the limits every homeowner should know.',
    category: 'Industry Insights',
    tags: ['ai', 'fixera', 'assessment', 'photos', 'safety'],
    published: '2026-10-13',
    body: [
      { p: 'AI tools can now look at a photo of a leaking faucet or a stained ceiling and describe what they see. Used well, they help homeowners understand a problem before deciding what to do. They also have real limits.' },
      { h: 'What it can help with' },
      { ul: [
        'Describing visible signs in your photos and the likely causes.',
        'Asking follow-up questions when details are missing or unclear.',
        'Explaining the tools, parts and steps a repair usually involves.',
        'Flagging hazards and recommending a professional when the risk is too high.',
      ] },
      { h: 'What it cannot do' },
      { ul: [
        'See inside walls, under floors or behind panels.',
        'Measure voltage or gas, or detect odors.',
        'Confirm code compliance or replace a licensed inspection.',
        'Guarantee that a diagnosis is correct.',
      ] },
      { h: 'How Fixera approaches this' },
      { p: 'Fixera, the assistant built into FixBridge, gives informational assessments from your photos and description, checks each repair for its actual risk, and asks for clearer photos when it cannot see enough. When a repair needs a professional, the same details move into a FixBridge service request so you do not start over. Fixera AI assessment is included with HomeCare Pro.' },
      { note: 'Treat any AI assessment as a starting point. If what you find differs from the assessment, stop and get professional help.' },
    ],
  },
];

/** Every public URL for the sitemap. */
export function publicSitemapPaths() {
  return [
    '/',
    '/about',
    ...Object.values(PUBLIC_CONTENT_PAGES).map((p) => p.path),
    ...BLOG_POSTS.map((post) => `/blog/${post.slug}`),
  ];
}

/** Title and description for a public path, or null when the path is not a content page. */
export function publicMetaForPath(pathname) {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';
  const blogMatch = path.match(/^\/blog\/([a-z0-9-]+)$/);
  if (blogMatch) {
    const post = BLOG_POSTS.find((p) => p.slug === blogMatch[1]);
    return post ? { title: post.title, description: post.description, path, type: 'article' } : null;
  }
  const page = Object.values(PUBLIC_CONTENT_PAGES).find((p) => p.path === path);
  return page ? { title: page.title, description: page.description, path, type: 'website' } : null;
}
