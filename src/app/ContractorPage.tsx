import { useRef } from "react";
import { motion, useScroll, useTransform, useInView } from "motion/react";
import {
  ArrowRight, CheckCircle, MapPin, Star, TrendingUp,
  FileCheck, Bell, MessageSquare, DollarSign, Briefcase,
  Wrench, Zap, Flame, PaintBucket, Home, Layers, Hammer,
} from "lucide-react";
import { ScrollReveal, Counter, SectionLabel, useTilt } from "./shared";

// ─── Data ─────────────────────────────────────────────────────────────────────

const CONTRACTOR_STEPS = [
  {
    num: "01",
    title: "Apply Free",
    body: "Submit your license, insurance, and trade info once. Our team verifies and approves — no recurring paperwork.",
    icon: FileCheck,
  },
  {
    num: "02",
    title: "Get Matched",
    body: "We surface jobs that fit your trade and service area. You see full specs, photos, and the AI cost estimate before you bid.",
    icon: Bell,
  },
  {
    num: "03",
    title: "Win Work",
    body: "Submit your priced estimate. Homeowners compare bids and choose you on quality — not who clicked fastest.",
    icon: TrendingUp,
  },
];

const BENEFITS = [
  {
    icon: DollarSign,
    title: "Zero Monthly Fees",
    desc: "No subscription, no lead auctions. Pay nothing to join or bid.",
  },
  {
    icon: FileCheck,
    title: "One-Time Verification",
    desc: "License & insurance verified once. Not re-uploaded every job.",
  },
  {
    icon: Briefcase,
    title: "Full Job Specs",
    desc: "See photos, AI assessment, and homeowner notes before bidding.",
  },
  {
    icon: MessageSquare,
    title: "Direct Contact",
    desc: "Message homeowners directly after the match. No middlemen.",
  },
  {
    icon: Bell,
    title: "Real-Time Alerts",
    desc: "Get notified instantly when a job in your trade & area is posted.",
  },
  {
    icon: TrendingUp,
    title: "Bid on Merit",
    desc: "Homeowners see your reviews, close rate, and price — not just price.",
  },
];

const TRADES = [
  { icon: Wrench, label: "Plumbing" },
  { icon: Zap, label: "Electrical" },
  { icon: Flame, label: "HVAC" },
  { icon: PaintBucket, label: "Painting" },
  { icon: Home, label: "Roofing" },
  { icon: Layers, label: "Flooring" },
  { icon: Hammer, label: "Carpentry" },
  { icon: Briefcase, label: "General Contracting" },
];

const STATS = [
  { value: 312, suffix: "+", label: "Active Contractors" },
  { value: 2847, suffix: "+", label: "Jobs Posted" },
  { value: 60, suffix: "%", label: "Avg. Bid Close Rate" },
  { value: 4.8, suffix: "★", label: "Contractor Rating", decimal: true },
];

const TESTIMONIALS = [
  {
    name: "James Park",
    location: "Brooklyn, NY",
    trade: "Licensed Plumber",
    text: "I was spending $400/month on lead gen that gave me garbage. FixBridge sends me real jobs with real specs. I close 60% of the bids I submit.",
    stat: "60% bid close rate",
  },
  {
    name: "Carlos Rivera",
    location: "Mineola, Long Island",
    trade: "Master Electrician",
    text: "The homeowners on this platform actually read the AI assessment first — so they understand the scope. Less negotiating over basics, more winning the job.",
    stat: "18 jobs in 3 months",
  },
  {
    name: "Ed Kowalski",
    location: "Flushing, Queens",
    trade: "HVAC Technician",
    text: "I get matched with exactly the kind of jobs I want — residential HVAC in Queens. No cold leads, no tire-kickers. Worth every penny (which is zero).",
    stat: "$34k in platform earnings",
  },
];

// ─── Sub-components ────────────────────────────────────────────────────────────

function BiddingStep({ step, index }: { step: (typeof CONTRACTOR_STEPS)[0]; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const Icon = step.icon;
  return (
    <motion.div
      ref={ref}
      className="border-r border-b border-border p-8 lg:p-12 relative overflow-hidden group hover:bg-muted/40 transition-colors duration-300"
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay: index * 0.15, ease: "easeOut" }}
    >
      <span
        className="absolute top-4 right-4 [font-family:'Barlow_Condensed',sans-serif] font-black leading-none select-none opacity-40 text-border group-hover:opacity-60 transition-opacity duration-300"
        style={{ fontSize: "clamp(5rem,10vw,7.5rem)" }}
      >
        {step.num}
      </span>
      <Icon size={22} className="text-primary mb-6 relative z-10" />
      <h3 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-xl text-foreground mb-3 relative z-10">
        {step.title}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed relative z-10">{step.body}</p>
    </motion.div>
  );
}

function DashboardMockup() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });

  const jobs = [
    { tag: "PLUMBING", title: "Pipe burst under sink", location: "Park Slope, BK", est: "$220–$480", bids: 2, urgent: true },
    { tag: "ELECTRICAL", title: "Panel upgrade 200A", location: "Mineola, LI", est: "$1,200–$1,800", bids: 1, urgent: false },
    { tag: "HVAC", title: "AC not cooling — 2nd floor", location: "Astoria, QNS", est: "$180–$350", bids: 3, urgent: false },
  ];

  return (
    <div ref={ref} className="bg-card border border-border overflow-hidden shadow-xl">
      {/* Titlebar */}
      <div className="border-b border-border px-4 py-3 flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          <span className="font-mono text-xs text-muted-foreground ml-2">
            fixbridge — contractor portal
          </span>
        </div>
        <span className="font-mono text-[10px] text-primary uppercase tracking-wider">● Live</span>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex">
        {["Job Matches", "My Bids", "Earnings"].map((tab, i) => (
          <div
            key={tab}
            className={`px-4 py-2.5 font-mono text-[11px] tracking-wider uppercase cursor-default border-r border-border ${
              i === 0
                ? "text-primary border-b-2 border-b-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </div>
        ))}
      </div>

      {/* Job list */}
      <div className="divide-y divide-border">
        {jobs.map((job, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -16 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: i * 0.2 + 0.4, duration: 0.5 }}
            className="p-4 hover:bg-muted/20 transition-colors group cursor-default"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-[10px] tracking-wider text-primary uppercase">
                    {job.tag}
                  </span>
                  {job.urgent && (
                    <span className="font-mono text-[9px] bg-red-500/15 text-red-500 border border-red-500/25 px-1.5 py-0.5">
                      URGENT
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-foreground truncate">{job.title}</p>
                <div className="flex items-center gap-1 mt-1">
                  <MapPin size={10} className="text-muted-foreground shrink-0" />
                  <span className="font-mono text-[11px] text-muted-foreground">{job.location}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-foreground">{job.est}</p>
                <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                  {job.bids} bid{job.bids !== 1 ? "s" : ""}
                </p>
                <button className="mt-2 font-mono text-[10px] text-primary border border-primary/40 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary hover:text-white">
                  Bid →
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Summary bar */}
      <div className="border-t border-border p-4 bg-muted/20 flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
            This month
          </p>
          <p className="[font-family:'Barlow_Condensed',sans-serif] font-bold text-2xl text-foreground">
            $4,820 <span className="text-primary text-lg">earned</span>
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
            Win rate
          </p>
          <p className="[font-family:'Barlow_Condensed',sans-serif] font-bold text-2xl text-foreground">
            62%
          </p>
        </div>
      </div>
    </div>
  );
}

function ContractorCard({ t, index }: { t: (typeof TESTIMONIALS)[0]; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const inView = useInView(cardRef, { once: true });
  const { ref: tiltRef, handleMove, handleLeave } = useTilt(8);
  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.12 }}
    >
      <div
        ref={tiltRef}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        className="bg-card border border-border p-6 flex flex-col h-full shadow-sm"
        style={{ transition: "transform 0.15s ease-out" }}
      >
        <div className="flex gap-0.5 mb-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} size={12} fill="#FF4D1C" className="text-primary" />
          ))}
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-5">
          &ldquo;{t.text}&rdquo;
        </p>
        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground">{t.name}</p>
          <p className="font-mono text-[11px] text-primary mt-0.5">{t.trade}</p>
          <div className="flex items-center gap-1 mt-1 mb-3">
            <MapPin size={10} className="text-muted-foreground" />
            <p className="font-mono text-[11px] text-muted-foreground">{t.location}</p>
          </div>
          <span className="inline-block font-mono text-[10px] tracking-wider text-primary border border-primary/30 bg-primary/5 px-2 py-1">
            {t.stat}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContractorPage({
  scrollContainer,
  onApply,
}: {
  scrollContainer?: React.RefObject<HTMLDivElement | null>;
  onApply?: () => void;
}) {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    container: scrollContainer,
    offset: ["start start", "end start"],
  });
  const heroTextY = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative min-h-screen flex items-center overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />
        {/* Accent glow */}
        <div
          className="absolute left-1/3 top-1/4 w-[600px] h-[600px] rounded-full blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,77,28,0.08) 0%, transparent 70%)" }}
        />

        <div className="relative max-w-7xl mx-auto px-6 pt-28 pb-20 w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center min-h-screen">
          <motion.div style={{ y: heroTextY, opacity: heroOpacity }}>
            <div className="flex items-center gap-3 mb-8">
              <span className="font-mono text-[11px] tracking-[0.2em] text-primary uppercase">
                For Licensed Contractors
              </span>
              <span className="h-px w-10 bg-primary" />
              <span className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
                NYC & LI
              </span>
            </div>

            <h1
              className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.88] mb-8"
              style={{ fontSize: "clamp(4rem,9.5vw,8.5rem)" }}
            >
              <span className="block text-foreground">WIN JOBS.</span>
              <span
                className="block"
                style={{ WebkitTextStroke: "2px #FF4D1C", WebkitTextFillColor: "transparent" }}
              >
                BUILD YOUR
              </span>
              <span className="block text-foreground">BUSINESS.</span>
            </h1>

            <p className="text-muted-foreground text-lg max-w-lg leading-relaxed mb-8">
              No monthly fees. No lead auctions. Get matched with real jobs that fit your trade
              and territory — review full specs before you bid, win work on your merit.
            </p>

            <div className="flex flex-wrap gap-3 mb-10">
              <button
                type="button"
                onClick={onApply}
                className="font-medium bg-primary text-white px-6 py-3.5 flex items-center gap-2 hover:bg-primary/90 transition-all group"
              >
                Apply as a Contractor
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </button>
              <button
                type="button"
                onClick={() => {
                  document.getElementById("contractor-how-it-works")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="font-medium border border-border text-foreground px-6 py-3.5 hover:border-foreground/30 transition-colors"
              >
                See How Bidding Works
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              {[
                { val: "Free", label: "to join, always" },
                { val: "60%", label: "avg. bid close rate" },
                { val: "48h", label: "avg. first match" },
              ].map(({ val, label }, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-2xl text-primary">
                    {val}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Dashboard preview */}
          <ScrollReveal delay={0.3} className="hidden lg:block">
            <DashboardMockup />
          </ScrollReveal>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <section className="border-y border-border py-20 bg-card">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border">
            {STATS.map((stat, i) => (
              <ScrollReveal key={i} delay={i * 0.1}>
                <div className="px-6 py-8 text-center">
                  <div
                    className="[font-family:'Barlow_Condensed',sans-serif] font-black leading-none text-foreground mb-2"
                    style={{ fontSize: "clamp(2.8rem,5.5vw,4.5rem)" }}
                  >
                    <Counter value={stat.value} suffix={stat.suffix} decimal={stat.decimal} />
                  </div>
                  <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
                    {stat.label}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── How Bidding Works ────────────────────────────────────────────── */}
      <section id="contractor-how-it-works" className="py-28 px-6 max-w-7xl mx-auto">
        <ScrollReveal>
          <SectionLabel left="The Process" right="3 Steps" />
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <h2
            className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9] mb-16"
            style={{ fontSize: "clamp(3rem,6vw,5.5rem)" }}
          >
            JOIN FREE.
            <br />
            <span style={{ WebkitTextStroke: "2px #FF4D1C", WebkitTextFillColor: "transparent" }}>
              BID SMART.
            </span>
          </h2>
        </ScrollReveal>
        <div className="grid grid-cols-1 md:grid-cols-3 border-l border-border">
          {CONTRACTOR_STEPS.map((step, i) => (
            <BiddingStep key={i} step={step} index={i} />
          ))}
        </div>
      </section>

      {/* ── Benefits ─────────────────────────────────────────────────────── */}
      <section className="py-28 bg-card border-y border-border">
        <div className="max-w-7xl mx-auto px-6">
          <ScrollReveal>
            <SectionLabel left="Platform Benefits" right="6 Reasons" />
          </ScrollReveal>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            <ScrollReveal delay={0.1}>
              <h2
                className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9] mb-0"
                style={{ fontSize: "clamp(3rem,5vw,4.5rem)" }}
              >
                REAL LEADS.
                <br />
                <span className="text-primary">ZERO NOISE.</span>
                <br />
                NONE OF THE
                <br />
                <span style={{ WebkitTextStroke: "2px var(--foreground)", WebkitTextFillColor: "transparent" }}>
                  USUAL BS.
                </span>
              </h2>
            </ScrollReveal>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {BENEFITS.map(({ icon: Icon, title, desc }, i) => (
                <ScrollReveal key={i} delay={i * 0.08}>
                  <div className="border border-border p-5 hover:border-primary/40 transition-colors duration-200 bg-background h-full">
                    <Icon size={16} className="text-primary mb-3" />
                    <p className="text-sm font-medium text-foreground mb-1">{title}</p>
                    <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Trades ───────────────────────────────────────────────────────── */}
      <section className="py-28 px-6 max-w-7xl mx-auto">
        <ScrollReveal>
          <SectionLabel left="Trades Covered" right="And growing" />
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <h2
            className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9] mb-14"
            style={{ fontSize: "clamp(3rem,6vw,5rem)" }}
          >
            YOUR TRADE
            <br />
            <span className="text-primary">HAS A PLACE</span>
            <br />
            HERE.
          </h2>
        </ScrollReveal>
        <div className="grid grid-cols-2 md:grid-cols-4 border-t border-l border-border">
          {TRADES.map(({ icon: Icon, label }, i) => (
            <ScrollReveal key={i} delay={i * 0.07}>
              <div className="border-r border-b border-border p-8 flex flex-col items-center gap-3 text-center group hover:bg-card transition-colors duration-200 cursor-default">
                <Icon size={24} className="text-primary group-hover:scale-110 transition-transform duration-200" />
                <p className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-base text-foreground tracking-wide">
                  {label}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ── Contractor image section ──────────────────────────────────────── */}
      <section className="py-28 bg-card border-y border-border">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <ScrollReveal>
            <div>
              <span className="font-mono text-[11px] tracking-[0.2em] text-primary uppercase block mb-6">
                Compliance Made Simple
              </span>
              <h2
                className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9] mb-6"
                style={{ fontSize: "clamp(2.5rem,5vw,4.5rem)" }}
              >
                VERIFIED ONCE.
                <br />
                <span className="text-primary">TRUSTED ALWAYS.</span>
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed mb-8">
                Upload your license and insurance once during onboarding. We verify it,
                badge your profile, and homeowners see it on every bid. No re-uploading per
                job, no paperwork friction — just professional credibility, automatic.
              </p>
              <ul className="space-y-4">
                {[
                  "License number verified with state licensing board",
                  "Insurance certificate stored & shown to homeowners",
                  "Background check badge displayed on your profile",
                  "Re-verification only when documents expire",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-muted-foreground">
                    <CheckCircle size={14} className="text-primary shrink-0 mt-0.5" />
                    <span className="text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div className="relative aspect-[4/3] bg-muted overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=800&h=600&fit=crop&auto=format"
                alt="Licensed contractor reviewing job on tablet"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/70 to-transparent" />
              <div className="absolute bottom-5 left-5">
                <div className="bg-card/90 backdrop-blur border border-border p-4 inline-block shadow-lg">
                  <p className="font-mono text-[10px] tracking-wider text-primary uppercase mb-1.5">
                    Profile Status
                  </p>
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    <CheckCircle size={14} className="text-green-500" />
                    Verified & Active
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground mt-1">
                    License · Insurance · Background
                  </p>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <section className="py-28">
        <div className="max-w-7xl mx-auto px-6 mb-12">
          <ScrollReveal>
            <SectionLabel left="Contractor Reviews" />
            <h2
              className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9]"
              style={{ fontSize: "clamp(3rem,6vw,5rem)" }}
            >
              PROS WHO
              <br />
              <span style={{ WebkitTextStroke: "2px var(--foreground)", WebkitTextFillColor: "transparent" }}>
                SWITCHED OVER.
              </span>
            </h2>
          </ScrollReveal>
        </div>
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {TESTIMONIALS.map((t, i) => <ContractorCard key={i} t={t} index={i} />)}
        </div>
      </section>

      {/* ── Application CTA ──────────────────────────────────────────────── */}
      <section className="py-28 bg-primary relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        <div className="max-w-7xl mx-auto px-6 relative grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <ScrollReveal>
            <h2
              className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.88] text-white mb-6"
              style={{ fontSize: "clamp(3.5rem,7vw,6.5rem)" }}
            >
              READY TO
              <br />
              GROW YOUR
              <br />
              BUSINESS?
            </h2>
            <p className="text-white/75 text-lg mb-6 max-w-sm leading-relaxed">
              Join 312+ licensed contractors already winning jobs on FixBridge. It takes
              10 minutes to apply. Zero dollars to join.
            </p>
            <div className="flex items-center gap-2">
              {[1,2,3,4,5].map((i) => (
                <Star key={i} size={14} fill="white" className="text-white" />
              ))}
              <span className="font-mono text-[11px] text-white/70 ml-1">
                4.8★ platform rating from contractors
              </span>
            </div>
          </ScrollReveal>

          {/* Application form */}
          <ScrollReveal delay={0.2}>
            <div className="bg-white/10 border border-white/20 p-8 backdrop-blur">
              <p className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-2xl text-white mb-6">
                Apply to Join
              </p>
              <div className="space-y-4">
                {[
                  { label: "Full Name", placeholder: "John Kowalski" },
                  { label: "Trade", placeholder: "Plumbing, HVAC, Electrical…" },
                  { label: "License Number", placeholder: "NY-12345678" },
                  { label: "Email Address", placeholder: "john@yourcompany.com" },
                ].map(({ label, placeholder }) => (
                  <div key={label}>
                    <label className="font-mono text-[11px] tracking-wider text-white/70 uppercase block mb-1.5">
                      {label}
                    </label>
                    <input
                      type="text"
                      placeholder={placeholder}
                      className="w-full bg-white/10 border border-white/20 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/60 transition-colors"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={onApply}
                  className="w-full font-medium bg-white text-primary py-3.5 text-base flex items-center justify-center gap-2 hover:bg-white/90 transition-colors mt-2 group"
                >
                  Submit Application
                  <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                </button>
                <p className="font-mono text-[10px] text-white/50 text-center">
                  We review applications within 2 business days.
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
