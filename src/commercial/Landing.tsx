import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight, BarChart3, Building2, CheckCircle2, ChevronDown, ClipboardCheck, FileText, Inbox, LayoutDashboard, MapPin,
  Menu, MoreVertical, Play, Plus, Receipt, Search, Settings, ShieldCheck, Users, Wrench, X,
} from "lucide-react";
import { BrandLogo } from "../app/BrandLogo";
import { api } from "./api";
import { Link } from "./router";
import { Button, Field, Input, Select, Textarea, cx } from "./ui";

const IMG = {
  hero: "/media/commercial/hero-building.jpg",
  tech: "/media/commercial/hero-technician.jpg",
  office: "/media/commercial/industry-office.jpg",
  restaurant: "/media/commercial/industry-restaurant.jpg",
  warehouse: "/media/commercial/facility.jpg",
  multisite: "/media/commercial/industry-multisite.jpg",
  plans: "/media/commercial/proposal-plans.jpg",
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

const SCRIPT = "[font-family:'Caveat',cursive]";
const EYEBROW = "text-[11px] font-medium uppercase tracking-[0.32em]";
const H = "font-bold tracking-[-0.035em]";

function Eyebrow({ children, light, line = "after" }: { children: ReactNode; light?: boolean; line?: "after" | "before" | "none" }) {
  const bar = <span aria-hidden className="inline-block h-px w-8 bg-primary" />;
  return (
    <p className={cx("flex items-center gap-3", EYEBROW, light ? "text-white/60" : "text-[#5f6368]")}>
      {line === "before" ? bar : null}
      <span>{children}</span>
      {line === "after" ? bar : null}
    </p>
  );
}

function OrangeButton({ children, onClick, className }: { children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cx("group inline-flex items-center justify-center gap-3 rounded-md bg-primary px-6 py-3.5 text-[15px] font-semibold text-white transition hover:brightness-110", className)}>
      {children}<ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
    </button>
  );
}

export default function Landing() {
  const [offer, setOffer] = useState<Offer | null>(null);
  useEffect(() => {
    document.title = "Commercial — Work Order Management for Contractors · FixBridge";
    api.public<Offer>("GET", "/public/offer").then(setOffer).catch(() => setOffer(null));
  }, []);
  const remaining = offer?.founding.remaining;

  return (
    <div className="bg-white text-[#14161a]">
      <SiteHeader />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white pt-[72px]">
        <div className="absolute inset-y-0 right-0 hidden w-[56%] lg:block" aria-hidden>
          <img src={IMG.hero} alt="" className="h-full w-full object-cover" style={{ maskImage: "linear-gradient(to right, transparent 0%, black 38%)", WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 38%)" }} />
          <div className="absolute inset-0 bg-gradient-to-bl from-black/55 via-black/10 to-transparent" />
        </div>
        <p className={cx("absolute right-12 top-28 z-10 hidden rotate-[-8deg] text-right text-[34px] leading-[0.95] text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.5)] xl:block", SCRIPT)} aria-hidden>
          Spaces that<br />keep business<br />moving.
          <span className="mt-3 ml-auto block h-[3px] w-14 rounded-full bg-primary" />
        </p>
        <div className="relative mx-auto grid max-w-[1240px] gap-10 px-5 pb-16 pt-14 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:pb-24 lg:pt-20">
          <div className="max-w-[600px]">
            <Eyebrow line="none">For commercial service contractors</Eyebrow>
            <h1 className={cx("mt-5 text-[40px] leading-[1.02] sm:text-[54px] xl:text-[60px]", H)}>
              <span className="sm:whitespace-nowrap">Commercial work.</span><br /><span className="text-primary sm:whitespace-nowrap">Beautifully managed.</span>
            </h1>
            <p className="mt-6 max-w-[460px] text-[17px] leading-relaxed text-[#5f6368] sm:text-[18px]">
              Paste in the dispatch email, send your tech, record the customer’s check-in, get the NTE increase approved and send an invoice that won’t bounce back. All on one job record.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <OrangeButton onClick={() => scrollTo("apply")}>Apply for the Pilot</OrangeButton>
              <button type="button" onClick={() => scrollTo("platform")} className="inline-flex items-center justify-center gap-3 rounded-md border border-[#14161a]/20 bg-white px-6 py-3.5 text-[15px] font-semibold transition hover:border-[#14161a]/50">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#14161a]"><Play size={10} fill="currentColor" className="ml-0.5" /></span>
                See How It Works
              </button>
            </div>
            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-black/10">
              {[
                [Building2, "Multi-Site", "Every customer and site"],
                [ShieldCheck, "Field-Ready", "Check-in to check-out"],
                [FileText, "Full Record", "From dispatch to payment"],
              ].map(([Icon, t, b]: any, i) => (
                <div key={t} className={cx("flex items-center gap-3", i > 0 && "sm:pl-5")}>
                  <Icon size={26} strokeWidth={1.5} className="shrink-0 text-[#14161a]" aria-hidden />
                  <div><p className="text-[13px] font-semibold">{t}</p><p className="text-[12px] text-[#6b7078]">{b}</p></div>
                </div>
              ))}
            </div>
            <p className="mt-12 hidden text-[13px] text-[#6b7078] sm:block">Pilot open now · first 10 companies get founding pricing</p>
          </div>
          <div className="relative min-h-[420px] lg:min-h-0">
            <img src={IMG.hero} alt="Modern commercial office building" className="absolute inset-0 h-full w-full rounded-2xl object-cover lg:hidden" />
            <WorkOrderCard className="relative z-10 ml-auto mt-6 lg:absolute lg:bottom-0 lg:right-0 lg:mt-0" />
          </div>
        </div>
      </section>

      {/* Cinematic hand-off from the white hero into the dark platform section. */}
      <div aria-hidden className="relative h-40 bg-gradient-to-b from-white via-[#3a3b40] to-[#121316]">
      </div>

      {/* ── Platform (dark) ───────────────────────────────────── */}
      <section id="platform" className="relative scroll-mt-16 overflow-hidden bg-[#121316] text-white">
        
        <p className={cx("absolute right-10 top-12 hidden rotate-[-8deg] text-right text-[30px] leading-[1] text-white/80 xl:block", SCRIPT)} aria-hidden>
          Organize<br />Maintain<br />Grow<span className="mt-3 ml-auto block h-[3px] w-12 rounded-full bg-primary" />
        </p>
        <div className="relative mx-auto grid max-w-[1240px] items-center gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:py-28">
          <div>
                        <h2 className={cx("text-[38px] leading-[1.03] sm:text-[50px]", H)}>Every work order.<br />One clear view.</h2>
            <p className="mt-6 max-w-[440px] text-[17px] leading-relaxed text-white/70">
              Every dispatch you accept, every visit, every approval and every invoice — across all your customers and sites, in one list.
            </p>
            <OrangeButton className="mt-8" onClick={() => scrollTo("workflow")}>Explore the Platform</OrangeButton>
            <ul className="mt-10 space-y-3 border-t border-white/10 pt-6 text-[14px] text-white/70">
              <li><span className="font-semibold text-white">Paste or upload .eml dispatches.</span> The original email stays on the job.</li>
              <li><span className="font-semibold text-white">Works with no signal.</span> Check-ins made in a basement sync later with the right time.</li>
              <li><span className="font-semibold text-white">No cut of your invoices.</span> Flat monthly price, customers pay you directly.</li>
            </ul>
          </div>
          <TiltIn><Laptop /></TiltIn>
        </div>
      </section>

      <BuildingSystems />

      {/* Back to light, under a soft orange glow. */}
      <div aria-hidden className="relative h-40 bg-gradient-to-b from-[#121316] via-[#3a3b40] to-white">
      </div>

      <Bento />

      {/* ── Property types ────────────────────────────────────── */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-[1240px] gap-6 px-5 pb-10 pt-20 sm:px-8 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <div>
                        <h2 className={cx("text-[34px] leading-[1.05] sm:text-[44px]", H)}>Different properties.<br />Same clear process.</h2>
          </div>
          <p className="max-w-md text-[16px] leading-relaxed text-[#5f6368]">
            From offices to restaurants, warehouses to multi-site portfolios — run the work orders your customers send the same way, every time.
          </p>
          <button type="button" onClick={() => scrollTo("workflow")} className="inline-flex items-center gap-3 self-start rounded-md bg-[#14161a] px-5 py-3 text-[14px] font-semibold text-white hover:bg-black lg:self-end">
            See the Workflow <ArrowRight size={16} aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [IMG.office, "Office Buildings", "Keep every tenant request on record."],
            [IMG.restaurant, "Restaurants & Retail", "Fast, documented service calls."],
            [IMG.warehouse, "Warehouses", "Dock doors to rooftop units."],
            [IMG.multisite, "Multi-Site Portfolios", "Every location, one place."],
          ].map(([img, t, b]) => (
            <button key={t} type="button" onClick={() => scrollTo("workflow")} className="group relative block h-[300px] overflow-hidden text-left sm:h-[340px]">
              <img src={img} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" />
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-6">
                <div>
                  <h3 className="text-[20px] font-semibold tracking-tight text-white">{t}</h3>
                  <p className="mt-1 text-[14px] text-white/80">{b}</p>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/50 text-white transition group-hover:bg-white group-hover:text-[#14161a]"><ArrowRight size={16} aria-hidden /></span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── Orange band ───────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-primary text-white">
        <div className="relative mx-auto grid max-w-[1240px] gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
          <div>
                        <h2 className={cx("text-[40px] leading-[1.02] sm:text-[54px]", H)}>Built for the places business happens.</h2>
          </div>
          <div>
            <p className="max-w-sm text-[17px] leading-relaxed text-white/90">Join the pilot and run your commercial work orders from dispatch to payment in one place. Free to apply.</p>
            <button type="button" onClick={() => scrollTo("apply")} className="mt-6 inline-flex items-center gap-3 rounded-md bg-white px-6 py-3.5 text-[15px] font-semibold text-primary hover:bg-white/90">
              Apply for the Pilot <ArrowRight size={17} aria-hidden />
            </button>
          </div>
          <ol className="hidden space-y-2 text-[14px] font-medium text-white/90 lg:block">
            {["Dispatch", "Visit", "Approve", "Invoice"].map((w, i) => <li key={w}><span className="mr-2 text-white/60">{i + 1}.</span>{w}</li>)}
          </ol>
        </div>
      </section>

      {/* ── Workflow ─────────────────────────────────────────── */}
      <section id="workflow" className="scroll-mt-16 bg-[#f6f6f4]">
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
            <div>
              <h2 className={cx("text-[34px] leading-[1.05] sm:text-[44px]", H)}>From dispatch email to paid invoice.</h2>
            </div>
            <p className="max-w-md text-[16px] leading-relaxed text-[#5f6368]">Each step is saved on the job, so whoever picks it up next — office or field — sees what happened.</p>
          </div>
          <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-black/10 bg-black/10 sm:grid-cols-2 lg:grid-cols-4">
            {WORKFLOW.map(([title, body], i) => (
              <li key={title} className="bg-white p-7">
                <span className="text-[34px] font-bold leading-none tracking-tight text-primary">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-4 text-[18px] font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[#5f6368]">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────── */}
      <section id="pricing" className="scroll-mt-16 bg-white">
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
            <div>
              <h2 className={cx("text-[34px] leading-[1.05] sm:text-[44px]", H)}>Flat monthly pricing.</h2>
            </div>
            <p className="max-w-md text-[16px] leading-relaxed text-[#5f6368]">No percentage of invoices, no per-job charges, nothing charged to your facility customers — and no requirement to collect payments through FixBridge.</p>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {PLANS.map((p) => (
              <div key={p.name} className={cx("flex flex-col rounded-xl border p-8", p.featured ? "border-primary" : "border-black/10")}>
                <p className={cx(EYEBROW, "text-[10px]", p.featured ? "text-primary" : "text-[#6b7078]")}>{p.featured ? "Most teams" : "Plan"}</p>
                <h3 className="mt-3 text-[22px] font-semibold tracking-tight">{p.name}</h3>
                <p className="mt-1 text-[14px] text-[#6b7078]">{p.note}</p>
                <p className="mt-6"><span className="text-[48px] font-bold tracking-[-0.04em]">{p.price}</span>{p.per ? <span className="text-[16px] text-[#6b7078]">{p.per}</span> : null}</p>
                <ul className="mt-6 flex-1 space-y-3 border-t border-black/10 pt-6 text-[14px]">
                  {p.points.map((pt) => <li key={pt} className="flex gap-2.5"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-primary" aria-hidden />{pt}</li>)}
                </ul>
                <button type="button" onClick={() => scrollTo("apply")} className={cx("mt-8 inline-flex items-center justify-center gap-2 rounded-md px-5 py-3 text-[14px] font-semibold transition", p.featured ? "bg-primary text-white hover:brightness-110" : "bg-[#14161a] text-white hover:bg-black")}>
                  Apply <ArrowRight size={15} aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-6 text-[13px] text-[#6b7078]">Additional users $15 per user per month. No setup fee. Cancel monthly.</p>
        </div>
      </section>

      {/* ── Founding offer ───────────────────────────────────── */}
      <section id="founding" className="scroll-mt-16 bg-[#121316] text-white">
        <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:py-28">
          <div>
            <h2 className={cx("text-[34px] leading-[1.08] sm:text-[44px]", H)}>Founding pricing for the first 10 companies.</h2>
            {remaining != null && remaining > 0 ? (
              <p className="mt-8 flex items-baseline gap-3"><span className="text-[72px] font-bold leading-none tracking-[-0.04em] text-primary">{remaining}</span><span className="text-[16px] text-white/70">of {offer!.founding.limit} founding spots open</span></p>
            ) : remaining === 0 ? (
              <p className="mt-8 max-w-md text-[17px] text-white/70">All founding spots have been taken. You can still apply for the pilot at standard pricing.</p>
            ) : null}
            <OrangeButton className="mt-8" onClick={() => scrollTo("apply")}>Apply Now</OrangeButton>
            <p className="mt-4 text-[13px] text-white/50">Applying is free. No payment details are collected during the pilot.</p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2">
            {[
              ["30 days free", "The clock starts only after your intake is set up and a real job has been processed."],
              ["Then $49/mo", "For the 12 months after the free period."],
              ["Then $99/mo", "With advance notice before it changes."],
              ["No setup fee", "Cancel monthly."],
            ].map(([t, b]) => (
              <div key={t} className="bg-[#17181c] p-7">
                <p className="text-[22px] font-semibold tracking-tight">{t}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-white/60">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section id="faq" className="scroll-mt-16 bg-white">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
          <div>
            <h2 className={cx("text-[34px] leading-[1.05] sm:text-[44px]", H)}>Common questions</h2>
          </div>
          <div className="divide-y divide-black/10 border-y border-black/10">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[17px] font-semibold tracking-tight">
                  {q}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/15 text-primary transition-transform group-open:rotate-45" aria-hidden><Plus size={15} /></span>
                </summary>
                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[#5f6368]">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Apply ────────────────────────────────────────────── */}
      <section id="apply" className="scroll-mt-16 bg-[#f6f6f4]">
        <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.3fr] lg:py-28">
          <div>
            <h2 className={cx("text-[34px] leading-[1.05] sm:text-[44px]", H)}>Apply for the pilot</h2>
            <p className="mt-5 max-w-sm text-[16px] leading-relaxed text-[#5f6368]">Tell us about your company and how your work orders arrive. We review every application and reply by email.</p>
            <img src={IMG.plans} alt="Contractor reviewing plans" loading="lazy" className="mt-8 hidden h-72 w-full rounded-xl object-cover lg:block" />
          </div>
          <div className="rounded-xl border border-black/10 bg-white p-6 shadow-[0_30px_60px_-40px_rgba(0,0,0,0.35)] sm:p-10">
            <PilotForm />
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function WorkOrderCard({ className }: { className?: string }) {
  const steps: [string, string, "done" | "now" | "todo"][] = [
    ["Request received", "Today, 9:14 AM", "done"],
    ["Accepted · ETA set", "Today, 10:32 AM", "done"],
    ["On site", "In progress", "now"],
    ["Customer check-in", "", "todo"],
    ["Complete", "", "todo"],
  ];
  return (
    <div className={cx("w-full max-w-[460px] rounded-2xl bg-white p-6 text-[#14161a] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.45)] ring-1 ring-black/5", className)} aria-label="Example work order">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white"><Wrench size={18} aria-hidden /></span>
        <p className="text-[16px] font-semibold">Work Order</p>
        <span className="ml-auto text-[12px] text-[#6b7078]">#WO-1042 · Example</span>
        <MoreVertical size={16} className="text-[#6b7078]" aria-hidden />
      </div>
      <p className="mt-4 text-[17px] font-semibold tracking-tight">Electrical panel tripping</p>
      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[#6b7078]"><MapPin size={13} className="text-primary" aria-hidden />Riverside Plaza · Springfield, IL</p>
      <div className="mt-5 grid grid-cols-[1fr_auto] gap-5">
        <ol className="relative space-y-4">
          <span aria-hidden className="absolute bottom-3 left-[11px] top-3 w-px bg-black/10" />
          {steps.map(([t, sub, state]) => (
            <li key={t} className="relative flex items-start gap-3">
              <span className={cx("relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                state === "done" && "bg-primary text-white", state === "now" && "border-[3px] border-primary bg-white", state === "todo" && "border-2 border-black/15 bg-white")}>
                {state === "done" ? <CheckCircle2 size={14} aria-hidden /> : null}
              </span>
              <span className="text-[13px] leading-tight"><span className="block font-medium">{t}</span>{sub ? <span className={cx("block text-[12px]", state === "now" ? "text-primary" : "text-[#6b7078]")}>{sub}</span> : null}</span>
            </li>
          ))}
        </ol>
        <div className="w-[150px]">
          <img src={IMG.tech} alt="" className="h-[96px] w-full rounded-lg object-cover object-[50%_35%]" />
          <dl className="mt-3 space-y-2 text-[12px]">
            <div className="flex items-center justify-between"><dt className="text-[#6b7078]">Priority</dt><dd className="rounded bg-primary/10 px-2 py-0.5 font-medium text-primary">High</dd></div>
            <div className="flex items-center justify-between"><dt className="text-[#6b7078]">Property</dt><dd className="font-medium">Office</dd></div>
          </dl>
          <button type="button" onClick={() => scrollTo("workflow")} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#14161a] py-2.5 text-[13px] font-semibold text-white hover:bg-black">
            View Details <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

function Laptop() {
  const rows: [string, string, string, string, string, string][] = [
    ["WO-1042", "Lakeside Office", "HVAC", "High", "In progress", "Today"],
    ["WO-1041", "Midtown Retail", "Electrical", "Medium", "Scheduled", "Oct 15"],
    ["WO-1040", "Riverside Plaza", "Plumbing", "High", "Needs review", "Today"],
    ["WO-1039", "Central Warehouse", "Door repair", "Medium", "In progress", "Oct 16"],
    ["WO-1038", "West End Office", "General", "Low", "Completed", "Oct 14"],
  ];
  const tone = (v: string) =>
    ({ High: "bg-[#ffe9e2] text-[#d9481c]", Medium: "bg-[#fff3d6] text-[#a76a00]", Low: "bg-[#e6f6ea] text-[#1f7a3a]", "In progress": "bg-[#e6efff] text-[#2456c7]", Scheduled: "bg-[#eef0f3] text-[#4a5160]", "Needs review": "bg-[#ffe9e2] text-[#d9481c]", Completed: "bg-[#e6f6ea] text-[#1f7a3a]" } as Record<string, string>)[v] || "";
  return (
    <div className="relative mx-auto w-full max-w-[680px]" aria-label="Example of the FixBridge Commercial dashboard">
      <div className="rounded-t-[18px] border border-white/10 bg-[#1b1c20] p-2.5 pb-3 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)]">
        <div className="flex overflow-hidden rounded-[10px] bg-white text-[#14161a]">
          <aside className="hidden w-[30%] shrink-0 bg-[#16171b] p-3 text-white sm:block">
            <BrandLogo variant="nav" tone="color" className="!w-[5.75rem]" />
            <ul className="mt-4 space-y-0.5 text-[10px]">
              {[[LayoutDashboard, "Dashboard"], [Inbox, "Work orders"], [Building2, "Customers & sites"], [MapPin, "Visits"], [ClipboardCheck, "Approvals"], [Receipt, "Invoices"], [Users, "Team"], [Settings, "Settings"]].map(([Icon, l]: any, i) => (
                <li key={l} className={cx("flex items-center gap-2 rounded-md px-2 py-1.5", i === 0 ? "bg-primary text-white" : "text-white/70")}><Icon size={11} aria-hidden />{l}</li>
              ))}
            </ul>
          </aside>
          <div className="min-w-0 flex-1 p-3 sm:p-4">
            <div className="grid grid-cols-4 gap-2">
              {[["24", "Total work orders"], ["6", "Needs review"], ["8", "In progress"], ["12", "Completed"]].map(([n, l], i) => (
                <div key={l} className="rounded-lg border border-black/5 p-2">
                  <p className={cx("text-[15px] font-bold leading-none", i === 1 ? "text-primary" : "")}>{n}</p>
                  <p className="mt-1 truncate text-[8px] text-[#6b7078]">{l}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[12px] font-semibold">Work Orders</p>
              <span className="rounded-md bg-primary px-2 py-1 text-[8px] font-semibold text-white">+ New dispatch</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 rounded-md border border-black/10 px-2 py-1 text-[8px] text-[#9aa0a8]"><Search size={9} aria-hidden />Search work orders, sites or customers…</div>
            <div className="mt-2 flex gap-1.5 text-[8px]">
              {["All (24)", "Open (6)", "In progress (8)", "Scheduled (4)", "Completed (12)"].map((t, i) => <span key={t} className={cx("rounded-md px-1.5 py-0.5", i === 0 ? "bg-[#ffe9e2] text-[#d9481c]" : "text-[#6b7078]")}>{t}</span>)}
            </div>
            <table className="mt-2 w-full text-left text-[8px]">
              <thead className="text-[#9aa0a8]"><tr><th className="py-1 font-medium">ID</th><th className="font-medium">Site</th><th className="hidden font-medium sm:table-cell">Trade</th><th className="font-medium">Priority</th><th className="font-medium">Status</th><th className="font-medium">ETA</th></tr></thead>
              <tbody className="divide-y divide-black/5">
                {rows.map((r) => (
                  <tr key={r[0]}>
                    <td className="py-1.5 text-[#6b7078]">{r[0]}</td><td>{r[1]}</td><td className="hidden sm:table-cell">{r[2]}</td>
                    <td><span className={cx("rounded px-1 py-0.5", tone(r[3]))}>{r[3]}</span></td>
                    <td><span className={cx("whitespace-nowrap rounded px-1 py-0.5", tone(r[4]))}>{r[4]}</span></td>
                    <td className="text-[#6b7078]">{r[5]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="relative mx-[-6%] h-4 rounded-b-[14px] bg-gradient-to-b from-[#3a3c42] to-[#1d1e22]">
        <div className="absolute left-1/2 top-0 h-1.5 w-24 -translate-x-1/2 rounded-b-md bg-[#2a2b30]" />
      </div>
      <p className="mt-4 text-center text-[11px] text-white/40">Example data</p>
    </div>
  );
}

// ── Motion helpers ───────────────────────────────────────────────────────────
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    setReduced(Boolean(mq?.matches));
    const on = () => setReduced(Boolean(mq?.matches));
    mq?.addEventListener?.("change", on);
    return () => mq?.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** Calls fn on every scroll of the page (the site scrolls inside #root) and on resize. */
function useScrollTick(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => ref.current());
    };
    tick();
    window.addEventListener("scroll", tick, { passive: true, capture: true });
    window.addEventListener("resize", tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", tick, { capture: true });
      window.removeEventListener("resize", tick);
    };
  }, []);
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Starts tilted in perspective and settles flat as it scrolls into view. */
function TiltIn({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [p, setP] = useState(1);
  useScrollTick(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    setP(clamp01((vh - r.top) / (vh * 0.75)));
  });
  const t = reduced ? 1 : p;
  return (
    <div style={{ perspective: "1600px" }}>
      <div
        ref={ref}
        style={{
          transform: `rotateX(${(1 - t) * 22}deg) rotateY(${(1 - t) * -14}deg) translateY(${(1 - t) * 40}px) scale(${0.92 + t * 0.08})`,
          transformOrigin: "50% 100%",
          opacity: 0.35 + t * 0.65,
          transition: reduced ? undefined : "transform 120ms linear, opacity 120ms linear",
        }}
      >
        {children}
        <div aria-hidden className="mx-auto -mt-2 h-10 w-[85%] rounded-[50%] bg-black/70 blur-2xl" style={{ opacity: 0.4 + t * 0.4 }} />
      </div>
    </div>
  );
}

// ── Building systems: scroll reveal + interactive ───────────────────────────
type SystemKey = "hvac" | "electrical" | "plumbing" | "maintenance";
const SYSTEMS: { key: SystemKey; label: string; services: string[]; wo: { id: string; title: string; site: string; priority: string; nte: string; status: string; checkin: string } }[] = [
  { key: "hvac", label: "HVAC", services: ["Rooftop units", "No heat / no cool calls", "Preventive maintenance"],
    wo: { id: "WO-1042", title: "Rooftop unit not cooling", site: "Lakeside Office · Floor 3", priority: "High", nte: "$650", status: "On site", checkin: "IVR confirmed 10:41 AM" } },
  { key: "electrical", label: "Electrical", services: ["Panels & breakers", "Lighting", "Emergency power"],
    wo: { id: "WO-1043", title: "Breaker panel tripping", site: "Riverside Plaza · Electrical room", priority: "High", nte: "$500", status: "Accepted · ETA 2:00 PM", checkin: "Portal check-in required" } },
  { key: "plumbing", label: "Plumbing", services: ["Restrooms", "Water heaters", "Drains & leaks"],
    wo: { id: "WO-1044", title: "Toilet leaking at base", site: "Brightway Grocers #218", priority: "Urgent", nte: "$650", status: "Awaiting approval", checkin: "IVR confirmed 9:12 AM" } },
  { key: "maintenance", label: "Maintenance", services: ["Doors & locks", "Ceilings & floors", "General repairs"],
    wo: { id: "WO-1045", title: "Rear door closer broken", site: "Central Warehouse · Dock 2", priority: "Medium", nte: "$350", status: "Completed · invoice ready", checkin: "No check-in required" } },
];

function BuildingSystems() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [progress, setProgress] = useState(0);
  const [picked, setPicked] = useState<{ key: SystemKey; at: number } | null>(null);
  useScrollTick(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setProgress(clamp01(-r.top / Math.max(1, r.height - window.innerHeight)));
  });
  const scrollStage = Math.min(3, Math.floor(progress * 4.2));
  // A click wins until the visitor scrolls on to another stage.
  const active: SystemKey = picked && picked.at === scrollStage ? picked.key : SYSTEMS[scrollStage].key;
  const sys = SYSTEMS.find((x) => x.key === active)!;
  const reveal = reduced ? 1 : clamp01(progress * 6);

  return (
    <section ref={ref} className="relative bg-[#121316] text-white lg:h-[340vh]">
      <div className="lg:sticky lg:top-[72px] lg:flex lg:h-[calc(100svh-72px)] lg:items-center">
        
        <div className="relative mx-auto grid w-full max-w-[1240px] gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-0">
          <div>
                        <h2 className={cx("text-[34px] leading-[1.05] sm:text-[46px]", H)}>Every system in the building.</h2>
            <p className="mt-5 max-w-md text-[16px] leading-relaxed text-white/65">Scroll through the building — or pick a system — to see the kind of work orders FixBridge Commercial keeps on record.</p>
            <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Building systems">
              {SYSTEMS.map((x, i) => (
                <button key={x.key} type="button" role="tab" aria-selected={active === x.key}
                  onClick={() => setPicked({ key: x.key, at: scrollStage })}
                  className={cx("rounded-full border px-4 py-2 text-[14px] font-medium transition",
                    active === x.key ? "border-primary bg-primary text-white" : "border-white/20 text-white/70 hover:border-white/50 hover:text-white")}>
                  <span className="mr-2 text-[11px] text-white/50">0{i + 1}</span>{x.label}
                </button>
              ))}
            </div>
            <div key={sys.key} className="mt-8 grid gap-5 sm:grid-cols-[0.8fr_1.2fr] [animation:fbc-fade_400ms_ease]">
              <div>
                <p className={cx(EYEBROW, "text-[10px] text-white/50")}>Services</p>
                <ul className="mt-3 space-y-2 text-[15px]">
                  {sys.services.map((sv) => <li key={sv} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" />{sv}</li>)}
                </ul>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur" aria-label="Example work order">
                <div className="flex items-center justify-between text-[12px] text-white/50"><span>{sys.wo.id} · Example</span><span className="rounded bg-primary/20 px-2 py-0.5 text-primary">{sys.wo.priority}</span></div>
                <p className="mt-2 text-[17px] font-semibold tracking-tight">{sys.wo.title}</p>
                <p className="mt-1 flex items-center gap-1.5 text-[13px] text-white/60"><MapPin size={12} className="text-primary" />{sys.wo.site}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-[12px]">
                  <div><dt className="text-white/45">NTE</dt><dd className="mt-0.5 font-medium">{sys.wo.nte}</dd></div>
                  <div><dt className="text-white/45">Status</dt><dd className="mt-0.5 font-medium">{sys.wo.status}</dd></div>
                  <div className="col-span-2"><dt className="text-white/45">Customer check-in</dt><dd className="mt-0.5 font-medium">{sys.wo.checkin}</dd></div>
                </dl>
              </div>
            </div>
          </div>
          <div style={{ opacity: 0.3 + reveal * 0.7, transform: `translateY(${(1 - reveal) * 30}px) scale(${0.94 + reveal * 0.06})`, transition: "opacity 200ms, transform 200ms" }}>
            <BuildingSvg active={active} onPick={(k) => setPicked({ key: k, at: scrollStage })} />
          </div>
        </div>
        {!reduced ? (
          <div aria-hidden className="absolute bottom-6 left-1/2 hidden h-1 w-40 -translate-x-1/2 overflow-hidden rounded-full bg-white/10 lg:block">
            <div className="h-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function BuildingSvg({ active, onPick }: { active: SystemKey; onPick: (k: SystemKey) => void }) {
  const on = (k: SystemKey) => active === k;
  const sys = (k: SystemKey) => ({
    className: "cursor-pointer transition-all duration-500",
    style: { opacity: on(k) ? 1 : 0.28, filter: on(k) ? "drop-shadow(0 0 10px rgba(255,77,28,0.85))" : "none" },
    onClick: () => onPick(k),
    role: "button",
    tabIndex: 0,
    "aria-label": SYSTEMS.find((x) => x.key === k)!.label,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(k); } },
  });
  const stroke = (k: SystemKey) => (on(k) ? "#FF4D1C" : "#8b8f98");
  const windows = [];
  for (let f = 0; f < 3; f++) for (let c = 0; c < 5; c++) {
    windows.push(<rect key={`${f}-${c}`} x={150 + c * 62} y={150 + f * 110} width={40} height={52} rx={3} fill={f === 1 && c === 3 ? "#ffb98f" : "#2a2d34"} opacity={0.9} />);
  }
  return (
    <svg viewBox="0 0 600 540" className="mx-auto w-full max-w-[620px]" role="img" aria-label="Cutaway of a commercial building with its systems">
      <defs>
        <linearGradient id="fbc-wall" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#24262c" /><stop offset="1" stopColor="#1a1b20" /></linearGradient>
        <linearGradient id="fbc-ground" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FF4D1C" stopOpacity="0.25" /><stop offset="1" stopColor="#FF4D1C" stopOpacity="0" /></linearGradient>
      </defs>
      <rect x="40" y="480" width="520" height="40" fill="url(#fbc-ground)" />
      <line x1="40" x2="560" y1="480" y2="480" stroke="#3a3d45" />
      <rect x="120" y="120" width="360" height="360" fill="url(#fbc-wall)" stroke="#3a3d45" />
      <line x1="120" x2="480" y1="230" y2="230" stroke="#33363d" />
      <line x1="120" x2="480" y1="340" y2="340" stroke="#33363d" />
      {windows}
      <rect x="110" y="112" width="380" height="10" fill="#2f3239" />

      {/* HVAC: rooftop unit and duct run */}
      <g {...sys("hvac")}>
        <rect x="160" y="70" width="110" height="42" rx="4" fill="#1b1c20" stroke={stroke("hvac")} strokeWidth="2.5" />
        <circle cx="190" cy="91" r="12" fill="none" stroke={stroke("hvac")} strokeWidth="2" />
        <circle cx="236" cy="91" r="12" fill="none" stroke={stroke("hvac")} strokeWidth="2" />
        <path d="M215 112 V 136 H 455 M 300 136 V 226 M 420 136 V 226" fill="none" stroke={stroke("hvac")} strokeWidth="5" strokeLinecap="round" opacity="0.9" />
        <text x="285" y="64" fill={stroke("hvac")} fontSize="13" fontWeight="600">HVAC</text>
      </g>

      {/* Electrical: panel, conduit and fixtures */}
      <g {...sys("electrical")}>
        <rect x="136" y="392" width="40" height="64" rx="3" fill="#1b1c20" stroke={stroke("electrical")} strokeWidth="2.5" />
        <path d="M146 404 h20 M146 414 h20 M146 424 h20 M146 434 h20" stroke={stroke("electrical")} strokeWidth="2" />
        <path d="M156 392 V 246 M156 356 H 240 M156 246 H 240" fill="none" stroke={stroke("electrical")} strokeWidth="2.5" strokeDasharray="5 4" />
        <circle cx="250" cy="246" r="6" fill={stroke("electrical")} /><circle cx="250" cy="356" r="6" fill={stroke("electrical")} />
        <text x="96" y="474" fill={stroke("electrical")} fontSize="13" fontWeight="600">Electrical</text>
      </g>

      {/* Plumbing: riser, fixtures and water heater */}
      <g {...sys("plumbing")}>
        <path d="M462 150 V 470" stroke={stroke("plumbing")} strokeWidth="6" strokeLinecap="round" />
        <path d="M462 210 H 440 M462 320 H 440 M462 430 H 440" stroke={stroke("plumbing")} strokeWidth="4" strokeLinecap="round" />
        <rect x="420" y="196" width="18" height="26" rx="4" fill="none" stroke={stroke("plumbing")} strokeWidth="2.5" />
        <rect x="420" y="306" width="18" height="26" rx="4" fill="none" stroke={stroke("plumbing")} strokeWidth="2.5" />
        <rect x="496" y="412" width="30" height="62" rx="12" fill="#1b1c20" stroke={stroke("plumbing")} strokeWidth="2.5" />
        <path d="M480 430 H 496" stroke={stroke("plumbing")} strokeWidth="4" />
        <text x="496" y="404" fill={stroke("plumbing")} fontSize="13" fontWeight="600">Plumbing</text>
      </g>

      {/* Maintenance: entrance doors and ceiling */}
      <g {...sys("maintenance")}>
        <rect x="266" y="394" width="68" height="86" fill="#1b1c20" stroke={stroke("maintenance")} strokeWidth="2.5" />
        <line x1="300" x2="300" y1="394" y2="480" stroke={stroke("maintenance")} strokeWidth="2" />
        <circle cx="293" cy="440" r="2.5" fill={stroke("maintenance")} /><circle cx="307" cy="440" r="2.5" fill={stroke("maintenance")} />
        <path d="M200 380 h180" stroke={stroke("maintenance")} strokeWidth="2" strokeDasharray="10 6" />
        <text x="252" y="510" fill={stroke("maintenance")} fontSize="13" fontWeight="600">Maintenance</text>
      </g>
    </svg>
  );
}

// ── Bento capabilities ──────────────────────────────────────────────────────
function Bento() {
  const card = "group relative overflow-hidden rounded-2xl border border-black/10 bg-white p-7 transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(0,0,0,0.35)]";
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-[1240px] px-5 pb-24 pt-6 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
          <div>
            <h2 className={cx("text-[34px] leading-[1.05] sm:text-[44px]", H)}>What’s on every job.</h2>
          </div>
          <p className="max-w-md text-[16px] leading-relaxed text-[#5f6368]">The parts of a commercial job that usually live in inboxes, texts and spreadsheets.</p>
        </div>
        <div className="mt-12 grid auto-rows-[minmax(220px,auto)] gap-4 md:grid-cols-6">
          {/* Work orders */}
          <article className={cx(card, "md:col-span-4 md:row-span-2 bg-[#121316] text-white border-white/5")}>
            <p className="text-[13px] font-semibold text-primary">Work orders</p>
            <h3 className="mt-3 max-w-sm text-[26px] font-semibold leading-tight tracking-tight">Paste the dispatch. Get a reviewed job.</h3>
            <p className="mt-3 max-w-md text-[15px] text-white/65">WO#, site, NTE, priority and due time are read from the email. Missing or conflicting details go to review — and repeat emails update the same job.</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2" aria-label="Example extracted fields">
              {[["WO#", "4471823"], ["Site", "Brightway Grocers #218"], ["NTE", "$650.00"], ["Due", "Oct 16 · 5:00 PM CT"], ["Priority", "P2 · Urgent"], ["Check-in", "IVR on arrival"]].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-[14px]">
                  <span className="text-white/50">{k}</span><span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 flex items-center gap-2 text-[13px] text-[#ffb98f]"><span className="h-2 w-2 rounded-full bg-primary" />Address flagged for review: missing ZIP</p>
          </article>
          {/* Contractor coordination */}
          <article className={cx(card, "md:col-span-2")}>
            <p className="text-[13px] font-semibold text-primary">Coordination</p>
            <h3 className="mt-3 text-[20px] font-semibold tracking-tight">Office and field, in sync.</h3>
            <ul className="mt-5 space-y-2.5 text-[13px]" aria-label="Example technicians">
              {[["Terry · Technician", "On site", "bg-[#e6f6ea] text-[#1f7a3a]"], ["Sam · Technician", "On the way", "bg-[#e6efff] text-[#2456c7]"], ["Alex · Office", "Reviewing", "bg-[#fff3d6] text-[#a76a00]"]].map(([n, st, c]) => (
                <li key={n} className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f1f1ef] text-[11px] font-semibold">{n[0]}</span>{n}</span><span className={cx("rounded px-2 py-0.5 text-[11px]", c)}>{st}</span></li>
              ))}
            </ul>
          </article>
          {/* Approvals */}
          <article className={cx(card, "md:col-span-2")}>
            <p className="text-[13px] font-semibold text-primary">Approvals</p>
            <h3 className="mt-3 text-[20px] font-semibold tracking-tight">Every yes, on record.</h3>
            <div className="mt-5 flex items-end gap-3" aria-label="Example NTE increase">
              {[["NTE", 38], ["Requested", 70], ["Approved", 70]].map(([l, h], i) => (
                <div key={l as string} className="flex flex-1 flex-col items-center gap-2">
                  <div className={cx("w-full rounded-md transition-all duration-700 group-hover:opacity-100", i === 2 ? "bg-primary" : "bg-[#e9e9e6]")} style={{ height: `${h}px` }} />
                  <span className="text-[11px] text-[#6b7078]">{l}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12px] italic text-[#6b7078]">“Approved to proceed at $1,180.” — by email</p>
          </article>
          {/* Payments */}
          <article className={cx(card, "md:col-span-3")}>
            <p className="text-[13px] font-semibold text-primary">Payments</p>
            <h3 className="mt-3 text-[20px] font-semibold tracking-tight">Know where every invoice stands.</h3>
            <div className="mt-6 flex items-center gap-1.5 text-[11px]" aria-label="Invoice statuses">
              {["Draft", "Sent", "Acknowledged", "Paid"].map((st, i) => (
                <div key={st} className="flex flex-1 flex-col gap-2">
                  <div className={cx("h-1.5 rounded-full", i < 3 ? "bg-primary" : "bg-[#e9e9e6]")} />
                  <span className={i < 3 ? "font-medium" : "text-[#6b7078]"}>{st}</span>
                </div>
              ))}
            </div>
            <p className="mt-5 flex items-center gap-2 text-[13px] text-[#6b7078]"><Receipt size={14} className="text-primary" />Bounced or disputed invoices are flagged and assigned.</p>
          </article>
          {/* Property records */}
          <article className={cx(card, "md:col-span-3")}>
            <p className="text-[13px] font-semibold text-primary">Property records</p>
            <h3 className="mt-3 text-[20px] font-semibold tracking-tight">Every site, every visit, kept.</h3>
            <ul className="mt-5 space-y-2 text-[13px]" aria-label="Example site history">
              {[["Oct 14", "Visit 1 · Diagnosis only", "Brightway #218"], ["Oct 15", "Proposal approved · $1,180", "Brightway #218"], ["Oct 16", "Visit 2 · Completed · 4 photos", "Brightway #218"]].map(([d, t, site]) => (
                <li key={t} className="flex items-center gap-3"><span className="w-12 shrink-0 text-[#6b7078]">{d}</span><span className="h-2 w-2 shrink-0 rounded-full bg-primary" /><span className="font-medium">{t}</span><span className="ml-auto hidden text-[#6b7078] sm:inline">{site}</span></li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}

const RESOURCES: [string, string][] = [
  ["Fixera Assessment", "/fixera-assessment"], ["Find a Contractor", "/find-a-contractor"], ["Blog", "/blog"],
  ["Press", "/press"], ["Careers", "/careers"], ["Contact", "/contact"],
];

/** Single site header, matching the commercial design: nav across FixBridge, sign in and Get Started. */
function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [resources, setResources] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onScroll = () => setScrolled(Math.max(window.scrollY, document.getElementById("root")?.scrollTop || 0) > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    const onDoc = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setResources(false); };
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("mousedown", onDoc);
    };
  }, []);
  const links: [string, string, boolean?][] = [
    ["Home", "/"], ["Homeowners", "/?view=homeowners"], ["Contractors", "/?view=contractors"], ["Commercial", "/commercial", true], ["How It Works", "/how-it-works"],
  ];
  return (
    <header className={cx("fixed inset-x-0 top-0 z-50 bg-white/95 backdrop-blur transition-shadow", (scrolled || open) && "shadow-[0_1px_0_rgba(0,0,0,0.08)]")}>
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center gap-8 px-5 sm:px-8">
        <a href="/commercial" aria-label="FixBridge Commercial home" className="shrink-0">
          <BrandLogo variant="nav" tone="onLight" className="!w-[9.5rem] sm:!w-[10.5rem]" />
        </a>
        <nav className="hidden flex-1 items-center justify-center gap-7 text-[14px] text-[#2a2d33] lg:flex" aria-label="Main">
          {links.map(([label, href, active]) => (
            <a key={label} href={href} aria-current={active ? "page" : undefined}
              className={cx("relative py-2 transition-colors hover:text-primary", active && "text-primary after:absolute after:inset-x-0 after:-bottom-[2px] after:h-[2px] after:bg-primary")}>
              {label}
            </a>
          ))}
          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setResources(!resources)} aria-expanded={resources} className="flex items-center gap-1 py-2 transition-colors hover:text-primary">
              Resources <ChevronDown size={14} className={cx("transition-transform", resources && "rotate-180")} aria-hidden />
            </button>
            {resources ? (
              <div className="absolute left-1/2 top-full mt-2 w-56 -translate-x-1/2 rounded-xl border border-black/10 bg-white p-2 shadow-xl">
                {RESOURCES.map(([l, h]) => <a key={h} href={h} className="block rounded-lg px-3 py-2 text-[14px] hover:bg-[#f6f6f4] hover:text-primary">{l}</a>)}
              </div>
            ) : null}
          </div>
        </nav>
        <div className="ml-auto flex items-center gap-5 lg:ml-0">
          <Link to="/commercial/login" className="hidden text-[14px] font-medium text-[#2a2d33] hover:text-primary sm:inline">Sign In</Link>
          <button type="button" onClick={() => { setOpen(false); scrollTo("apply"); }} className="hidden items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-[14px] font-semibold text-white hover:brightness-110 sm:inline-flex">
            Get Started <ArrowRight size={15} aria-hidden />
          </button>
          <button type="button" className="text-[#14161a] lg:hidden" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {open ? (
        <div className="max-h-[calc(100svh-72px)] overflow-y-auto border-t border-black/10 bg-white px-5 pb-6 sm:px-8 lg:hidden">
          {links.map(([label, href, active]) => (
            <a key={label} href={href} className={cx("block border-b border-black/5 py-3.5 text-[17px] font-semibold", active && "text-primary")}>{label}</a>
          ))}
          <p className={cx("mt-5", EYEBROW, "text-[10px] text-[#6b7078]")}>Resources</p>
          <div className="mt-2 grid grid-cols-2 gap-x-4">
            {RESOURCES.map(([l, h]) => <a key={h} href={h} className="py-2 text-[15px] text-[#2a2d33]">{l}</a>)}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Link to="/commercial/login" className="rounded-md border border-black/15 py-3 text-center text-[15px] font-semibold">Sign In</Link>
            <button type="button" onClick={() => { setOpen(false); scrollTo("apply"); }} className="rounded-md bg-primary py-3 text-[15px] font-semibold text-white">Get Started</button>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="bg-[#121316] text-white/60">
      <div className="mx-auto max-w-[1240px] px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <BrandLogo variant="nav" tone="color" className="!w-[10rem]" />
            <p className="mt-4 max-w-sm text-[14px] leading-relaxed">Commercial tools for contractors who run work orders for offices, retail, warehouses and multi-site portfolios.</p>
          </div>
          <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-[14px]">
            <a href="/" className="hover:text-white">FixBridge home</a>
            <a href="/how-it-works" className="hover:text-white">How It Works</a>
            <Link to="/commercial/login" className="hover:text-white">Company sign in</Link>
            <a href="/contact" className="hover:text-white">Contact</a>
            <a href="/legal/privacy" className="hover:text-white">Privacy Policy</a>
            <a href="/blog" className="hover:text-white">Blog</a>
          </nav>
        </div>
        <p className="mt-10 border-t border-white/10 pt-6 text-[12px] leading-relaxed text-white/40">
          © {new Date().getFullYear()} FixBridge. Pilot sign-up only — no payment details are collected and nothing is charged through FixBridge during the pilot. Joining the network is free; FixBridge does not promise job volume or payment timing. Example screens show sample data. Photos: Unsplash.
        </p>
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
