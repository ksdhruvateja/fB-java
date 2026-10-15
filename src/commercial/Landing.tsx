import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, ChevronRight, Menu, MapPin, Moon, Sun, Truck, X } from "lucide-react";
import { BrandLogo } from "../app/BrandLogo";
import { api } from "./api";
import { Link } from "./router";
import { Button, Field, Input, Select, Textarea, cx } from "./ui";
import { useDark } from "./portal/Shell";

const IMG = {
  hero: "/media/commercial/hero-technician.jpg",
  field: "/media/commercial/field-visit.jpg",
  plans: "/media/commercial/proposal-plans.jpg",
  facility: "/media/commercial/facility.jpg",
  crew: "/media/commercial/crew.jpg",
  office: "/media/commercial/office-laptop.jpg",
};

const WORKFLOW = [
  ["Dispatch email", "Paste or upload the work order. The original is kept exactly as received."],
  ["Reviewed job record", "WO#, site, NTE, priority and due time are pulled out. Anything missing or contradictory is flagged."],
  ["Acceptance & ETA", "A received dispatch isn’t an accepted job until you accept it with an ETA."],
  ["Site visit", "On my way, check in, check out — plus the customer’s own check-in, even when it fails."],
  ["Authorized work", "Findings, labor and materials go to the office. Extra work waits for approval."],
  ["Completion package", "Notes, after photos and check-in records are checked before the job closes."],
  ["Invoice submission", "Checked against the WO, the authorized amount and duplicates before it goes out."],
  ["Payment tracking", "Sent, bounced, acknowledged, disputed, paid — with evidence for each payment."],
];

const PLANS = [
  { name: "Network", price: "Free", note: "Join the FixBridge contractor network.", points: ["Contractor profile in the network", "No monthly fee"] },
  {
    name: "Commercial Essentials", price: "$99", per: "/mo.", note: "Includes 3 users.", featured: true,
    points: ["Dispatch intake and review queue", "Visits, check-in and check-out", "Proposals, approvals and NTE tracking", "Completion packages and invoice checks", "Exceptions and payment tracking"],
  },
  { name: "Commercial Team", price: "$199", per: "/mo.", note: "Includes 10 users.", points: ["Everything in Essentials", "Room for office staff and a field crew", "Configurable financial permissions"] },
];

const FAQ = [
  ["Will FixBridge send me commercial jobs?", "Joining the network is free. The commercial tools are for managing the work orders you already receive from your own customers. We don’t promise job volume or faster payment."],
  ["Do my customers have to use FixBridge?", "No. Your facility managers keep sending dispatches the way they do today. You paste or upload the email, and invoices go out through the submission method each customer already accepts."],
  ["Does FixBridge collect my payments or take a cut?", "No. Customers pay you directly. You record payments in FixBridge with the reference or remittance as evidence. There’s no percentage of invoices and no per-job charge."],
  ["Can technicians see prices?", "Only if you allow it. Owners and office staff see everything; technicians see the jobs assigned to them, and financial access is a per-person setting."],
  ["Can dispatch emails be forwarded automatically?", "In the pilot you paste or upload dispatch emails. Automatic forwarding is planned for a later release."],
  ["Is this separate from my FixBridge homeowner or contractor login?", "Yes. FixBridge Commercial has its own accounts and sign-in, and its data is kept separate from the homeowner and contractor marketplace."],
];

const TRADES = ["Plumbing", "HVAC", "Refrigeration", "Electrical", "Roofing", "Doors & Locks", "General Maintenance", "Painting", "Flooring", "Landscaping"];

interface Offer {
  founding: { limit: number; remaining: number; monthly: number };
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

function Pill({ children, onClick, href, tone = "primary", className }: { children: ReactNode; onClick?: () => void; href?: string; tone?: "primary" | "light" | "dark"; className?: string }) {
  const cls = cx(
    "inline-flex items-center justify-center whitespace-nowrap rounded-full px-6 py-3 text-[17px] font-normal transition active:scale-[0.98]",
    tone === "primary" && "bg-primary text-white hover:brightness-110",
    tone === "light" && "bg-white text-[#1d1d1f] hover:bg-white/90",
    tone === "dark" && "bg-[#1d1d1f] text-white hover:bg-black dark:bg-white dark:text-[#1d1d1f]",
    className
  );
  return href ? <a href={href} className={cls}>{children}</a> : <button type="button" onClick={onClick} className={cls}>{children}</button>;
}

function More({ children, onClick, href, light }: { children: ReactNode; onClick?: () => void; href?: string; light?: boolean }) {
  const cls = cx("inline-flex items-center gap-0.5 text-[17px] hover:underline", light ? "text-[#2997ff]" : "text-primary");
  const body = <>{children}<ChevronRight size={18} strokeWidth={2} aria-hidden /></>;
  return href ? <a href={href} className={cls}>{body}</a> : <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

function Headline({ children, className, as: Tag = "h2" }: { children: ReactNode; className?: string; as?: "h1" | "h2" }) {
  return <Tag className={cx("font-semibold tracking-[-0.03em]", className)}>{children}</Tag>;
}

export default function Landing() {
  const [offer, setOffer] = useState<Offer | null>(null);
  useEffect(() => {
    document.title = "Commercial — Work Order Management for Contractors · FixBridge";
    api.public<Offer>("GET", "/public/offer").then(setOffer).catch(() => setOffer(null));
  }, []);
  const remaining = offer?.founding.remaining;

  return (
    <div className="bg-white text-[#1d1d1f] dark:bg-black dark:text-[#f5f5f7]">
      <GlobalNav />

      {/* Hero */}
      <section className="pt-[120px] text-center sm:pt-[140px]">
        <div className="mx-auto max-w-5xl px-5">
          <p className="text-[21px] font-semibold text-primary">FixBridge Commercial</p>
          <Headline as="h1" className="mt-2 text-[44px] leading-[1.05] sm:text-[64px] lg:text-[80px]">Every work order.<br />One clear record.</Headline>
          <p className="mx-auto mt-5 max-w-2xl text-[19px] leading-snug text-[#6e6e73] sm:text-[24px] dark:text-[#a1a1a6]">
            Free to join the FixBridge contractor network. Optional commercial tools help you manage the jobs you already have.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <Pill onClick={() => scrollTo("apply")}>Apply for the pilot</Pill>
            <More onClick={() => scrollTo("workflow")}>See how it works</More>
          </div>
        </div>
        <div className="mx-auto mt-14 max-w-[1400px] px-3 sm:px-5">
          <div className="relative overflow-hidden rounded-[28px] sm:rounded-[36px]">
            <img src={IMG.hero} alt="Technician working on an electrical panel" className="h-[420px] w-full object-cover object-[50%_30%] sm:h-[560px] lg:h-[640px]" />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            <TodayCard className="absolute bottom-5 right-5 hidden md:block lg:bottom-10 lg:right-10" />
            <p className="absolute bottom-5 left-6 max-w-sm text-left text-[15px] font-medium text-white/90 sm:bottom-8 sm:left-10 sm:text-[17px]">
              No percentage of invoices. No per-job fees. Nothing charged to your facility customers.
            </p>
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="scroll-mt-16 bg-[#f5f5f7] py-24 dark:bg-[#0b0b0c] sm:py-32">
        <div className="mx-auto max-w-[1180px] px-5">
          <div className="max-w-3xl">
            <Headline className="text-[40px] leading-[1.08] sm:text-[56px]">From dispatch email<br className="hidden sm:block" /> to paid invoice.</Headline>
            <p className="mt-4 text-[19px] text-[#6e6e73] sm:text-[21px] dark:text-[#a1a1a6]">Eight steps. Every one saved on the job, so the office, the technician and the invoice work from the same facts.</p>
          </div>
          <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WORKFLOW.map(([title, body], i) => (
              <li key={title} className="flex flex-col rounded-[24px] bg-white p-7 dark:bg-[#1c1c1e]">
                <span className="text-[15px] font-semibold text-primary">Step {i + 1}</span>
                <h3 className="mt-3 text-[21px] font-semibold leading-tight tracking-[-0.02em]">{title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[#6e6e73] dark:text-[#a1a1a6]">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Feature tiles */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-[1180px] px-5">
          <Headline className="max-w-3xl text-[40px] leading-[1.08] sm:text-[56px]">Built for the office.<br />Ready for the truck.</Headline>
          <div className="mt-14 grid gap-4 lg:grid-cols-2">
            <PhotoTile img={IMG.field} eyebrow="Site visits" title="Big buttons. Even with gloves on." body="On my way, Check in and Check out on one screen. Record the customer’s IVR or portal check-in — and what happened when it didn’t work." />
            <PhotoTile img={IMG.facility} eyebrow="Dispatch intake" title="Paste the email. Get a job." body="WO#, site, NTE and due time are read from the dispatch. A repeat email updates the same job instead of creating a duplicate." />
            <DarkTile eyebrow="Offline" title="No signal in the basement? Keep working." body="Field actions are saved on the phone and sent with their original time when signal returns — never recorded twice." icon={<Truck size={40} strokeWidth={1.5} aria-hidden />} />
            <LightTile eyebrow="Authorizations" title="Every approval on record." body="Original NTE, requested increase, approved amount, who approved and their reply. Unclear replies go to a person, not to “approved”." />
            <PhotoTile img={IMG.office} eyebrow="Invoices" title="Checked before it’s sent." body="Recipient, WO#, approved amount, completion evidence and service dates — then sent once. Bounced invoices are flagged and assigned." />
            <PhotoTile img={IMG.crew} eyebrow="Your team" title="Everyone sees what they need." body="Owner and office see everything. Technicians see their assigned jobs. You decide who sees prices." />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-16 bg-[#f5f5f7] py-24 dark:bg-[#0b0b0c] sm:py-32">
        <div className="mx-auto max-w-[1180px] px-5">
          <div className="text-center">
            <Headline className="text-[40px] leading-[1.08] sm:text-[56px]">Pay for the tools.<br />Not for the work.</Headline>
            <p className="mx-auto mt-4 max-w-2xl text-[19px] text-[#6e6e73] sm:text-[21px] dark:text-[#a1a1a6]">
              No percentage of invoices, no per-job charges, nothing charged to your facility customers — and no requirement to collect payments through FixBridge.
            </p>
          </div>
          <div className="mt-14 grid gap-4 lg:grid-cols-3">
            {PLANS.map((p) => (
              <div key={p.name} className={cx("flex flex-col rounded-[28px] bg-white p-8 dark:bg-[#1c1c1e]", p.featured && "ring-2 ring-primary")}>
                {p.featured ? <p className="mb-2 text-[13px] font-semibold text-primary">Most teams</p> : <p className="mb-2 text-[13px] font-semibold text-transparent" aria-hidden>.</p>}
                <h3 className="text-[24px] font-semibold tracking-tight">{p.name}</h3>
                <p className="mt-1 text-[15px] text-[#6e6e73] dark:text-[#a1a1a6]">{p.note}</p>
                <p className="mt-6"><span className="text-[48px] font-semibold tracking-[-0.03em]">{p.price}</span>{p.per ? <span className="text-[17px] text-[#6e6e73]">{p.per}</span> : null}</p>
                <ul className="mt-6 flex-1 space-y-3 border-t border-black/10 pt-6 text-[15px] dark:border-white/10">
                  {p.points.map((pt) => <li key={pt}>{pt}</li>)}
                </ul>
                <Pill className="mt-8 w-full" tone={p.featured ? "primary" : "dark"} onClick={() => scrollTo("apply")}>Apply</Pill>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-[13px] text-[#6e6e73] dark:text-[#a1a1a6]">Additional users $15 per user per month. No setup fee. Cancel monthly.</p>
        </div>
      </section>

      {/* Founding offer */}
      <section id="founding" className="scroll-mt-16 bg-black py-24 text-[#f5f5f7] sm:py-32">
        <div className="mx-auto max-w-[1180px] px-5 text-center">
          <p className="text-[21px] font-semibold text-primary">Founding contractors</p>
          <Headline className="mt-2 text-[40px] leading-[1.08] sm:text-[64px]">For the first 10 companies.</Headline>
          {remaining != null && remaining > 0 ? (
            <p className="mt-10">
              <span className="bg-gradient-to-b from-[#ff8a5c] to-primary bg-clip-text text-[96px] font-semibold leading-none tracking-[-0.04em] text-transparent sm:text-[140px]">{remaining}</span>
              <span className="mt-2 block text-[19px] text-[#a1a1a6]">of {offer!.founding.limit} founding spots open</span>
            </p>
          ) : remaining === 0 ? (
            <p className="mx-auto mt-8 max-w-xl text-[21px] text-[#a1a1a6]">All founding spots have been taken. You can still apply for the pilot at standard pricing.</p>
          ) : null}
          <div className="mx-auto mt-14 grid max-w-5xl gap-px overflow-hidden rounded-[28px] bg-white/10 text-left sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["30 days free", "The clock starts only after your intake is set up and a real job has been processed."],
              ["Then $49/mo.", "For the 12 months after the free period."],
              ["Then $99/mo.", "With advance notice before it changes."],
              ["No setup fee", "Cancel monthly."],
            ].map(([t, b]) => (
              <div key={t} className="bg-[#1c1c1e] p-7">
                <p className="text-[24px] font-semibold tracking-tight">{t}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-[#a1a1a6]">{b}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <Pill onClick={() => scrollTo("apply")}>Apply now</Pill>
            <More light href="/commercial/login">Company sign in</More>
          </div>
          <p className="mt-5 text-[13px] text-[#86868b]">Applying is free. No payment details are collected during the pilot.</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-16 py-24 sm:py-32">
        <div className="mx-auto max-w-[880px] px-5">
          <Headline className="text-[40px] leading-[1.08] sm:text-[56px]">Questions? Answers.</Headline>
          <div className="mt-10 divide-y divide-black/10 border-y border-black/10 dark:divide-white/10 dark:border-white/10">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[19px] font-semibold tracking-tight sm:text-[21px]">
                  {q}
                  <span className="text-[28px] font-light leading-none text-[#86868b] transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-[#6e6e73] dark:text-[#a1a1a6]">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Apply */}
      <section id="apply" className="scroll-mt-16 bg-[#f5f5f7] py-24 dark:bg-[#0b0b0c] sm:py-32">
        <div className="mx-auto grid max-w-[1180px] gap-12 px-5 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <Headline className="text-[40px] leading-[1.08] sm:text-[56px]">Apply for the pilot.</Headline>
            <p className="mt-4 text-[19px] text-[#6e6e73] dark:text-[#a1a1a6]">Tell us about your company and how your work orders arrive. We review every application and reply by email.</p>
            <div className="mt-8 overflow-hidden rounded-[28px]">
              <img src={IMG.plans} alt="Contractor reviewing plans" className="h-64 w-full object-cover lg:h-80" loading="lazy" />
            </div>
          </div>
          <div className="rounded-[28px] bg-white p-6 sm:p-10 dark:bg-[#1c1c1e]">
            <PilotForm />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function PhotoTile({ img, eyebrow, title, body }: { img: string; eyebrow: string; title: string; body: string }) {
  return (
    <article className="group relative flex min-h-[460px] flex-col overflow-hidden rounded-[28px] bg-black text-white sm:min-h-[540px]">
      <img src={img} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/45 to-black/5" />
      <div className="relative p-8 sm:p-10">
        <p className="text-[15px] font-semibold text-[#ff8a5c]">{eyebrow}</p>
        <h3 className="mt-2 max-w-md text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[36px]">{title}</h3>
        <p className="mt-3 max-w-md text-[17px] leading-relaxed text-white/80">{body}</p>
      </div>
    </article>
  );
}

function DarkTile({ eyebrow, title, body, icon }: { eyebrow: string; title: string; body: string; icon: ReactNode }) {
  return (
    <article className="flex min-h-[460px] flex-col justify-between rounded-[28px] bg-[#1d1d1f] p-8 text-white sm:min-h-[540px] sm:p-10">
      <div>
        <p className="text-[15px] font-semibold text-[#ff8a5c]">{eyebrow}</p>
        <h3 className="mt-2 max-w-md text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[36px]">{title}</h3>
        <p className="mt-3 max-w-md text-[17px] leading-relaxed text-white/70">{body}</p>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-primary">{icon}</span>
        <div className="rounded-2xl bg-white/10 px-4 py-3 text-[13px] text-white/80 backdrop-blur">
          <p className="font-semibold text-white">2 updates saved on this phone</p>
          <p>Sending when you’re back online</p>
        </div>
      </div>
    </article>
  );
}

function LightTile({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <article className="flex min-h-[460px] flex-col justify-between rounded-[28px] bg-[#f5f5f7] p-8 sm:min-h-[540px] sm:p-10 dark:bg-[#1c1c1e]">
      <div>
        <p className="text-[15px] font-semibold text-primary">{eyebrow}</p>
        <h3 className="mt-2 max-w-md text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[36px]">{title}</h3>
        <p className="mt-3 max-w-md text-[17px] leading-relaxed text-[#6e6e73] dark:text-[#a1a1a6]">{body}</p>
      </div>
      <div className="mt-8 rounded-2xl bg-white p-5 text-[14px] shadow-sm dark:bg-black/40" aria-label="Example approval record">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#86868b]">Example</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {[["Original NTE", "$650"], ["Requested", "$1,180"], ["Approved", "$1,180"]].map(([k, v]) => (
            <div key={k}><p className="text-[12px] text-[#86868b]">{k}</p><p className="text-[21px] font-semibold tracking-tight">{v}</p></div>
          ))}
        </div>
        <p className="mt-4 border-t border-black/5 pt-3 text-[13px] italic text-[#6e6e73] dark:border-white/10">“Approved to proceed at $1,180.” — facility manager, by email</p>
      </div>
    </article>
  );
}

function TodayCard({ className }: { className?: string }) {
  const rows: [string, string, string][] = [
    ["#ff3b30", "Needs review", "NTE unclear · WO 5512"],
    ["#ff9f0a", "Due today", "Store #218 · 5:00 PM CT"],
    ["#34c759", "On site", "Customer check-in confirmed"],
  ];
  return (
    <div className={cx("w-[320px] rounded-[24px] bg-white/85 p-5 text-left text-[#1d1d1f] shadow-2xl backdrop-blur-xl", className)} aria-label="Example of the Today screen">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-[#86868b]">Example · Today</p>
      <p className="mt-1 text-[19px] font-semibold tracking-tight">What needs my attention?</p>
      <ul className="mt-3 space-y-2">
        {rows.map(([color, t, sub]) => (
          <li key={t} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
            <span className="min-w-0"><span className="block text-[14px] font-semibold">{t}</span><span className="block truncate text-[12px] text-[#6e6e73]">{sub}</span></span>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[14px] font-medium">
        <span className="rounded-full bg-[#1d1d1f] py-2.5 text-center text-white">On my way</span>
        <span className="rounded-full bg-primary py-2.5 text-center text-white">Check in</span>
      </div>
    </div>
  );
}

/** One translucent navigation bar: brand, page sections, sign in and Apply. */
function GlobalNav() {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useDark();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    // The site scrolls inside #root, so listen in the capture phase to catch any scroller.
    const onScroll = () => setScrolled(Math.max(window.scrollY, document.getElementById("root")?.scrollTop || 0) > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", onScroll, { capture: true });
  }, []);
  const links: [string, string][] = [["Overview", "workflow"], ["Pricing", "pricing"], ["Founding offer", "founding"], ["FAQ", "faq"]];
  const go = (id: string) => { setOpen(false); scrollTo(id); };
  return (
    <header className={cx(
      "fixed inset-x-0 top-0 z-50 border-b backdrop-blur-xl backdrop-saturate-150 transition-colors",
      open ? "border-black/10 bg-white dark:border-white/10 dark:bg-black" : scrolled ? "border-black/10 bg-white/80 dark:border-white/10 dark:bg-black/75" : "border-transparent bg-white/60 dark:bg-black/40"
    )}>
      <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-6 px-5">
        <a href="/commercial" className="flex shrink-0 items-center gap-2.5" aria-label="FixBridge Commercial home">
          <BrandLogo variant="nav" tone="onLight" className="!w-[7.25rem] dark:hidden" />
          <BrandLogo variant="nav" tone="color" className="hidden !w-[7.25rem] dark:block" />
          <span className="whitespace-nowrap border-l border-black/15 pl-2.5 text-[15px] font-semibold tracking-tight text-[#1d1d1f] dark:border-white/20 dark:text-white">Commercial</span>
        </a>
        <nav className="hidden flex-1 items-center justify-center gap-7 text-[13px] text-[#1d1d1f]/80 md:flex dark:text-white/80" aria-label="Sections">
          {links.map(([label, id]) => (
            <button key={id} type="button" onClick={() => go(id)} className="transition-colors hover:text-[#1d1d1f] dark:hover:text-white">{label}</button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4 text-[13px] text-[#1d1d1f]/80 md:ml-0 dark:text-white/80">
          <button type="button" onClick={() => setDark(!dark)} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} className="hidden hover:text-[#1d1d1f] sm:block dark:hover:text-white">
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <Link to="/commercial/login" className="hidden whitespace-nowrap hover:text-[#1d1d1f] sm:inline dark:hover:text-white">Sign in</Link>
          <button type="button" onClick={() => go("apply")} className="whitespace-nowrap rounded-full bg-primary px-4 py-1.5 text-[13px] text-white hover:brightness-110">Apply</button>
          <button type="button" className="md:hidden" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open ? (
        <div className="px-6 pb-6 md:hidden">
          {links.map(([label, id]) => (
            <button key={id} type="button" onClick={() => go(id)} className="block w-full border-b border-black/5 py-3.5 text-left text-[19px] font-semibold tracking-tight dark:border-white/10">{label}</button>
          ))}
          <Link to="/commercial/login" className="block border-b border-black/5 py-3.5 text-[19px] font-semibold tracking-tight dark:border-white/10">Company sign in</Link>
          <a href="/" className="block border-b border-black/5 py-3.5 text-[19px] font-semibold tracking-tight dark:border-white/10">FixBridge home</a>
          <button type="button" onClick={() => setDark(!dark)} className="mt-3 flex items-center gap-2 text-[15px] text-[#6e6e73]">{dark ? <Sun size={16} /> : <Moon size={16} />}{dark ? "Light mode" : "Dark mode"}</button>
        </div>
      ) : null}
    </header>
  );
}

function Footer() {
  return (
    <footer className="bg-[#f5f5f7] text-[12px] text-[#6e6e73] dark:bg-[#0b0b0c] dark:text-[#86868b]">
      <div className="mx-auto max-w-[1024px] px-5 py-8">
        <p className="border-b border-black/10 pb-4 leading-relaxed dark:border-white/10">
          Pilot sign-up only — no payment details are collected and nothing is charged through FixBridge during the pilot. Joining the network is free; FixBridge does not promise job volume or payment timing. Photos: Unsplash.
        </p>
        <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5"><MapPin size={12} aria-hidden />Copyright © {new Date().getFullYear()} FixBridge. All rights reserved.</p>
          <nav className="flex flex-wrap gap-x-4 gap-y-1">
            <a href="/" className="hover:underline">FixBridge home</a>
            <Link to="/commercial/login" className="hover:underline">Company sign in</Link>
            <a href="/contact" className="hover:underline">Contact</a>
            <a href="/legal/privacy" className="hover:underline">Privacy Policy</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}

const EMPTY = {
  company_name: "", contact_name: "", email: "", phone: "", trades: [] as string[], service_area: "", team_size: "",
  dispatch_sources: "", monthly_dispatch_volume: "", current_tools: "", plan_interest: "essentials", message: "", consent: false,
};

function PilotForm() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api.public("POST", "/pilot-applications", form);
      setDone(true);
    } catch (err: any) {
      setErrors(err?.body?.errors || {});
      setMessage(err?.message || "Could not send your application.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="py-10 text-center" role="status">
        <CheckCircle2 className="mx-auto h-12 w-12 text-[#34c759]" strokeWidth={1.5} />
        <p className="mt-4 text-[28px] font-semibold tracking-tight">Application received.</p>
        <p className="mx-auto mt-2 max-w-sm text-[17px] text-muted-foreground">We will review it and reply to {form.email} with next steps. No payment is taken during the pilot.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="Company name" error={errors.company_name}><Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} autoComplete="organization" required /></Field>
      <Field label="Your name" error={errors.contact_name}><Input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} autoComplete="name" required /></Field>
      <Field label="Work email" error={errors.email}><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" required /></Field>
      <Field label="Phone" error={errors.phone}><Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" /></Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-[13px] font-medium text-muted-foreground">Trades you cover</legend>
        <div className="flex flex-wrap gap-2">
          {TRADES.map((t) => {
            const on = form.trades.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => set("trades", on ? form.trades.filter((x) => x !== t) : [...form.trades, t])}
                className={cx("rounded-full px-4 py-2 text-[14px] transition", on ? "bg-primary text-white" : "bg-secondary text-foreground hover:brightness-95")}
              >
                {t}
              </button>
            );
          })}
        </div>
        {errors.trades ? <p className="mt-1 text-xs font-medium text-red-600">{errors.trades}</p> : null}
      </fieldset>
      <Field label="Service area" hint="Cities, counties or states"><Input value={form.service_area} onChange={(e) => set("service_area", e.target.value)} /></Field>
      <Field label="Team size">
        <Select value={form.team_size} onChange={(e) => set("team_size", e.target.value)}>
          <option value="">Choose…</option>
          <option>Just me</option>
          <option>2–3</option>
          <option>4–10</option>
          <option>11–25</option>
          <option>More than 25</option>
        </Select>
      </Field>
      <Field label="Where do your work orders come from?" hint="e.g. facility management companies, retailers, property managers, portals" className="sm:col-span-2">
        <Input value={form.dispatch_sources} onChange={(e) => set("dispatch_sources", e.target.value)} />
      </Field>
      <Field label="Work orders per month">
        <Select value={form.monthly_dispatch_volume} onChange={(e) => set("monthly_dispatch_volume", e.target.value)}>
          <option value="">Choose…</option>
          <option>Fewer than 10</option>
          <option>10–50</option>
          <option>51–150</option>
          <option>More than 150</option>
        </Select>
      </Field>
      <Field label="Plan you are interested in">
        <Select value={form.plan_interest} onChange={(e) => set("plan_interest", e.target.value)}>
          <option value="essentials">Commercial Essentials ($99/mo, 3 users)</option>
          <option value="team">Commercial Team ($199/mo, 10 users)</option>
          <option value="network">Network only (free)</option>
        </Select>
      </Field>
      <Field label="What do you use today?" hint="Spreadsheets, email folders, other software" className="sm:col-span-2">
        <Input value={form.current_tools} onChange={(e) => set("current_tools", e.target.value)} />
      </Field>
      <Field label="Anything else?" className="sm:col-span-2"><Textarea value={form.message} onChange={(e) => set("message", e.target.value)} /></Field>
      <label className="flex items-start gap-3 text-sm sm:col-span-2">
        <input type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--primary)]" />
        <span>
          FixBridge may contact me by email or phone about the commercial pilot. See the <a href="/legal/privacy" className="underline">privacy policy</a>.
          {errors.consent ? <span className="block text-xs font-medium text-red-600">{errors.consent}</span> : null}
        </span>
      </label>
      {message ? <p className="text-sm font-medium text-red-600 sm:col-span-2" role="alert">{message}</p> : null}
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" busy={busy} className="w-full sm:w-auto">Send application</Button>
        <p className="mt-3 text-[13px] text-muted-foreground">Pilot sign-up only — no payment details are collected.</p>
      </div>
    </form>
  );
}
