import { ArrowRight } from "lucide-react";
import { CATALOG, SOLUTION_PAGES } from "../../shared/public-seo.js";
const NOTES: Record<string, string> = {
  appliances: 'Refrigerators, washers, dryers, ovens and dishwashers: record symptoms and safely accessible model details.',
  carpentry: 'Describe the woodwork or fitting, visible damage and location before scope is confirmed.',
  concrete_driveways: 'Show cracks, uneven surfaces or the work area. Structural or drainage causes may need inspection.',
  doors_hardware: 'Explain sticking, alignment issues or damaged fittings without dismantling the door.',
  electrical: 'Record outages or visible concerns safely. Do not touch exposed wiring or energized components.',
  fences_gates: 'Describe damaged sections, gate operation, access and the affected boundary.',
  flooring: 'Record the material, affected area and visible lifting, wear or damage.',
  garage_garage_doors: 'Explain door movement or visible damage. Springs and lifting mechanisms need specialist handling.',
  handyman: 'Describe the small repair or fitting task so appropriate scope and limits can be reviewed.',
  hvac_heating_cooling: 'Record heating or cooling behavior, equipment details and previous service; avoid opening sealed systems.',
  landscaping: 'Describe lawn, garden or seasonal upkeep needs and the area to be maintained.',
  landscaping_yard: 'An existing companion category for yard care, grouped with Landscaping rather than a duplicate guide.',
  lighting: 'Describe the fixture and symptoms. Wiring or power issues may require electrical work.',
  locks_security: 'Describe access hardware concerns without sharing keys, access codes or passwords.',
  painting: 'Record the room or surface, condition and intended finish; preparation affects scope.',
  pest_control: 'Describe visible signs and affected spaces; treatment and safe product selection need professional review.',
  plumbing: 'Describe leaks, drain issues, fixture behavior or pressure changes, with safe photos.',
  roofing_gutters: 'Photograph visible concerns from ground level. Do not climb to inspect a roof or gutter.',
  siding: 'Record visible exterior damage, location and the affected material if known.',
  snow_removal: 'Explain driveway, walkway or clearing needs; timing depends on weather and available capacity.',
  windows_glass: 'Describe damaged glass, movement or seals. Keep clear of loose or broken glass.',
  bathroom: 'Use the room category when the task spans fixtures, finishes or several trades.',
  kitchen: 'Describe the kitchen area and desired work; appliances and trade repairs have separate categories.',
  water_damage: 'Record affected surfaces and whether moisture is ongoing. Hidden damage may require inspection.',
  drywall_wall_repair: 'Show the affected wall, crack, hole or finish issue; avoid assuming a structural cause.',
  cleaning: 'Specify one-time, deep, move-in, move-out or ongoing cleaning needs and the spaces involved.',
  smart_home_technology: 'Describe device behavior and safely accessible model details; keep credentials out of the request.',
  other: 'For a need outside named categories, provide a clear description for review before acceptance.'
};
export function ServicesSolutions() {
  return <section id="services-solutions" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24"><p className="text-xs font-semibold uppercase tracking-widest text-primary">Services & Solutions</p><h2 className="mt-3 text-3xl font-semibold sm:text-4xl">Find the right path for your home</h2><p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">The catalog is organized into five practical guides. All 28 existing service categories appear below. A listing describes a request type, not guaranteed local contractor availability. Current options and eligibility are confirmed in your signed-in Services workspace.</p><ol className="mt-8 grid gap-5 lg:grid-cols-2">{SOLUTION_PAGES.map((group, index) => <li key={group.page} className="rounded-2xl border border-border bg-card p-6"><p className="text-xs font-semibold text-primary">0{index + 1} · {group.focus}</p><h3 className="mt-2 text-xl font-semibold"><a className="inline-flex items-center gap-2 hover:text-primary" href={group.path}>{group.label}<ArrowRight size={18} /></a></h3><ul className="mt-4 grid gap-2 sm:grid-cols-2">{group.ids.map(id => {
            const service = CATALOG.find(s => s.id === id);
            return <li key={id}><a className="text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-primary" href={group.path + '#' + id}>{service?.name}</a></li>;
          })}</ul></li>)}</ol><div className="mt-8 rounded-xl border border-border p-5"><h3 className="font-semibold">From need to next step</h3><ol className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground"><li>1. Choose the property and service</li><li aria-hidden="true">→</li><li>2. Describe the issue and add safe photos</li><li aria-hidden="true">→</li><li>3. Request professional help or an eligible AI assessment</li><li aria-hidden="true">→</li><li>4. Review the next step and keep the reported outcome</li></ol></div></section>;
}
export default function SolutionPage({
  page
}: {
  page: string;
}) {
  const content = SOLUTION_PAGES.find(p => p.page === page);
  if (!content) return null;
  return <article><header className="border-b border-border bg-card px-5 pb-14 pt-28 sm:px-8 sm:pb-20 sm:pt-36"><div className="mx-auto max-w-5xl"><a href="/about#services-solutions" className="text-sm text-muted-foreground underline underline-offset-4">About FixBridge / Services & Solutions</a><p className="mt-8 text-xs font-semibold uppercase tracking-widest text-primary">{content.focus}</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">{content.label} with FixBridge</h1><p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground">{content.intro}</p></div></header><div className="mx-auto max-w-5xl px-5 py-14 sm:px-8"><section><h2 className="text-2xl font-semibold">Service categories in this guide</h2><div className="mt-6 grid gap-4 sm:grid-cols-2">{content.ids.map(id => {
            const service = CATALOG.find(s => s.id === id);
            return <section id={id} key={id} className="scroll-mt-24 rounded-xl border border-border bg-card p-5"><h3 className="font-semibold">{service?.name}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{NOTES[id]}</p></section>;
          })}</div></section><div className="mt-12 space-y-10">{content.sections.map(([title, body]) => <section key={title}><h2 className="text-2xl font-semibold">{title}</h2><p className="mt-3 leading-relaxed text-muted-foreground">{body}</p></section>)}</div><section className="mt-12 rounded-2xl border border-border bg-card p-6"><h2 className="text-2xl font-semibold">Choose how to continue</h2><p className="mt-3 leading-relaxed text-muted-foreground">Sign in and select the relevant property in Services. You can request professional help or choose Fixera assessment when your account has an eligible active HomeCare plan. AI is advisory, can be incomplete or incorrect, and does not replace an on-site inspection. Review current features, fees and terms before confirming any paid action.</p><div className="mt-5 flex flex-wrap gap-4"><a href="/homeowner-login" className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white">Open homeowner Services</a><a href="/go-pro" className="rounded-lg border border-border px-5 py-3 text-sm font-semibold">Review HomeCare plans</a></div></section><nav aria-label="Related service guides" className="mt-12"><h2 className="text-xl font-semibold">Related guides</h2><ul className="mt-4 flex flex-wrap gap-4">{SOLUTION_PAGES.filter(p => p.page !== page).map(p => <li key={p.page}><a className="text-primary underline underline-offset-4" href={p.path}>{p.label}</a></li>)}</ul></nav></div></article>;
}
