import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import {
  ArrowRight,
  BadgeCheck,
  ShieldCheck,
  CircleDollarSign,
  Zap,
  Camera,
  Sparkles,
  Scale,
  MapPin,
  Clock,
  Cpu,
  HardDrive,
} from "lucide-react";
import { ScrollReveal, Counter } from "./shared";
import { BrandLogo } from "./BrandLogo";
import { FeatureTileIcon } from "./FeatureTileIcon";
import CustomerTrustSection from "./CustomerTrustSection";
import { brand } from "../config/brand";

const HERO_IMAGE = "/hero-homeowner.png";

const FEATURES = [
  {
    title: "Transparent Pricing",
    body: "AI cost ranges before you talk to anyone. No surprise markups.",
    icon: CircleDollarSign,
    tone: "coral" as const,
  },
  {
    title: "Guaranteed Vetting",
    body: "Background-checked, licensed contractors only. No cold-call spam.",
    icon: ShieldCheck,
    tone: "ink" as const,
  },
  {
    title: "Certified Process",
    year: "2026",
    body: "Built for NYC & Long Island homeowners who want clarity first.",
    icon: BadgeCheck,
    tone: "steel" as const,
  },
  {
    title: "Fast First Bids",
    body: "Average first bid under 48 hours. Free to post — always.",
    icon: Zap,
    tone: "coral" as const,
  },
];

const accent =
  "bg-gradient-to-br from-[#FF8A5B] via-[#FF4D1C] to-[#E03A0C] bg-clip-text text-transparent";

const MOBILE_STEPS = [
  {
    num: "01",
    title: "Describe the problem",
    body: "Tell us what's broken in plain English. Add photos if you have them.",
    icon: Camera,
  },
  {
    num: "02",
    title: "Get an AI assessment",
    body: "Cost range, urgency, and what the repair likely involves — in minutes.",
    icon: Sparkles,
  },
  {
    num: "03",
    title: "Compare real bids",
    body: "Licensed local pros send priced estimates you can review side by side.",
    icon: Scale,
  },
  {
    num: "04",
    title: "Book & get it fixed",
    body: "Hire when you're ready. Free to post — a small fee only when you book.",
    icon: ShieldCheck,
  },
];

const MOBILE_STATS = [
  { value: "48h", label: "Avg. first bid" },
  { value: "4.9★", label: "Customer rating" },
  { value: "312+", label: "Vetted pros" },
  { value: "$0", label: "To post a job" },
];

const MOBILE_PERKS = [
  { icon: Zap, label: "Instant AI triage" },
  { icon: Camera, label: "Photo uploads" },
  { icon: Clock, label: "No pressure calls" },
  { icon: BadgeCheck, label: "Verified process" },
  { icon: Cpu, label: "AI + human check" },
  { icon: MapPin, label: "NYC & Long Island" },
];

function BentoCard({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <ScrollReveal delay={delay} className={`h-full min-h-[132px] sm:min-h-[148px] ${className}`}>
      <div className="h-full rounded-2xl sm:rounded-3xl bg-[#1d1d1f] border border-white/[0.06] p-5 sm:p-6 md:p-7 flex flex-col items-center justify-center text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        {children}
      </div>
    </ScrollReveal>
  );
}

export default function CustomerPage({
  scrollContainer,
  onGetStarted,
}: {
  scrollContainer?: React.RefObject<HTMLDivElement | null>;
  onGetStarted?: () => void;
}) {
  const heroRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    container: scrollContainer,
    offset: ["start start", "end start"],
  });
  const imageScale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);
  const brandY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.55], [1, 0]);

  return (
    <>
      {/* ── Hero: full-bleed photo + brand as the composition ─────────────── */}
      <section ref={heroRef} className="relative min-h-[100svh] min-h-[100dvh] flex flex-col overflow-hidden bg-black">
        <motion.div className="absolute inset-0" style={{ scale: imageScale }}>
          <img
            src={HERO_IMAGE}
            alt="Kitchen renovation in progress — cabinets and drywall during a home repair"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-black/45" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-black/35" />
        </motion.div>

        <motion.div
          style={{ opacity: contentOpacity }}
          className="relative z-10 flex-1 flex flex-col justify-end w-full px-5 sm:px-6 lg:px-10 xl:px-12 2xl:px-16 pt-[max(5.5rem,calc(env(safe-area-inset-top)+4.5rem))] pb-[max(1.25rem,env(safe-area-inset-bottom))] md:pb-8"
        >
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="max-w-xl mb-6 sm:mb-10 md:mb-14"
          >
            <h1
              className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase text-white leading-[0.92] mb-3 sm:mb-5 tracking-tight"
              style={{ fontSize: "clamp(2.25rem,8vw,4.5rem)" }}
            >
              Home repair,
              <br />
              fixed by AI.
            </h1>
            <p className="text-white/70 text-sm sm:text-base md:text-lg leading-relaxed mb-5 sm:mb-8 max-w-md">
              Describe the problem. Get an AI assessment. Receive real bids from vetted local contractors.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-3 w-full sm:w-auto">
              <button
                onClick={onGetStarted}
                className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase tracking-wider text-sm bg-white text-black px-5 sm:px-7 py-3 sm:py-3.5 flex items-center justify-center gap-2 hover:bg-white/90 transition-colors group w-full sm:w-auto"
              >
                Describe Your Problem
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </motion.div>

          <motion.div style={{ y: brandY }} className="w-full flex justify-start items-end">
            <BrandLogo
              variant="hero"
              className="drop-shadow-[0_8px_28px_rgba(0,0,0,0.5)] max-h-[min(22vh,12.5rem)] sm:max-h-[min(24vh,11rem)] md:max-h-[min(26vh,12.5rem)]"
            />
          </motion.div>
        </motion.div>
      </section>

      {/* ── Mission ──────────────────────────────────────────────────────── */}
      <section id="mission" className="bg-background text-foreground py-16 sm:py-24 md:py-32 px-4 sm:px-8 border-b border-border">
        <div className="max-w-7xl mx-auto">
          <ScrollReveal>
            <h2
              className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.92] tracking-tight mb-14 md:mb-20"
              style={{ fontSize: "clamp(2.5rem,7vw,5.5rem)" }}
            >
              <span className="block">We connect homeowners</span>
              <span className="block md:pl-[8%]">with vetted local contractors —</span>
              <span className="block md:pl-[16%]">no guesswork, no cold calls.</span>
            </h2>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-20 border-t border-border pt-12">
            <ScrollReveal delay={0.08}>
              <p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-md">
                {brand.productName} turns a vague repair into a clear assessment and competing bids —
                so you hire with confidence across NYC & Long Island.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.16}>
              <ul className="space-y-4 border-l border-border pl-6">
                {[
                  "AI repair diagnosis in minutes",
                  "Transparent neighborhood cost ranges",
                  "Licensed, background-checked pros",
                  "Free to post — pay only when you book",
                ].map((line) => (
                  <li key={line} className="font-mono text-xs md:text-sm tracking-wide text-muted-foreground uppercase">
                    — {line}
                  </li>
                ))}
              </ul>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ── Features grid — 2×2 on mobile & up (iconwerk-style tile set) ── */}
      <section className="bg-muted text-foreground border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-5 sm:py-6">
          <p className="font-mono text-[11px] tracking-[0.25em] uppercase text-muted-foreground py-3 sm:py-4 border-b border-border">
            Deserved Service
          </p>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-0 pb-4 sm:pb-0">
          <div className="grid grid-cols-2 border border-border sm:border-0 overflow-hidden rounded-2xl sm:rounded-none bg-card/60 sm:bg-transparent">
            {FEATURES.map((f, i) => (
              <ScrollReveal key={f.title} delay={i * 0.05} className="h-full">
                <div
                  className={[
                    "h-full flex flex-col items-center sm:items-start text-center sm:text-left",
                    "p-4 sm:p-8 md:p-12 border-border",
                    "min-h-[148px] sm:min-h-[240px]",
                    i % 2 === 0 ? "border-r" : "",
                    i < 2 ? "border-b" : "sm:border-b-0",
                    i >= 2 ? "sm:border-b-0" : "",
                  ].join(" ")}
                >
                  <div className="mb-3 sm:mb-6 flex justify-center sm:justify-start">
                    <FeatureTileIcon icon={f.icon} tone={f.tone} />
                  </div>
                  {"year" in f && f.year ? (
                    <div className="hidden sm:flex flex-wrap items-end gap-3 sm:gap-4 mb-4">
                      <span
                        className="[font-family:'Barlow_Condensed',sans-serif] font-black leading-none text-foreground/15"
                        style={{ fontSize: "clamp(3rem,8vw,4.5rem)" }}
                      >
                        {f.year}
                      </span>
                      <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2 border border-border px-2 py-1">
                        Certified Platform
                      </span>
                    </div>
                  ) : null}
                  <h3 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-[13px] leading-tight sm:text-2xl md:text-3xl mb-1.5 sm:mb-3 tracking-wide">
                    {f.title}
                  </h3>
                  <p className="hidden sm:block text-sm text-muted-foreground leading-relaxed max-w-sm">
                    {f.body}
                  </p>
                  <p className="sm:hidden font-mono text-[9px] tracking-wide uppercase text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                    {f.body}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Performance bento ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="bg-black text-white py-14 sm:py-24 md:py-32 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
            <div className="mb-8 sm:mb-14 md:mb-16">
              <h2
                className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9] tracking-tight max-w-4xl"
                style={{ fontSize: "clamp(2.35rem,7vw,4.75rem)" }}
              >
                Built for reliable
                <br />
                performance.
              </h2>
              <p className="mt-3 sm:mt-4 text-white/55 text-sm sm:text-base max-w-md leading-relaxed md:hidden">
                Four clear steps from problem to booked pro — no cold calls, no guesswork.
              </p>
            </div>
          </ScrollReveal>

          {/* ── Mobile: readable steps + stats (friendlier than dense bento) ── */}
          <div className="md:hidden space-y-5">
            <ScrollReveal>
              <div className="rounded-3xl bg-[#1d1d1f] border border-white/[0.08] p-5 flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
                  <Zap className="h-6 w-6 text-primary" strokeWidth={1.75} aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase text-xl tracking-wide">
                    {brand.productName}
                  </p>
                  <p className="text-xs text-white/50 leading-relaxed mt-0.5">
                    Problem → assessment → bids → booked
                  </p>
                </div>
              </div>
            </ScrollReveal>

            <div className="grid grid-cols-2 gap-2.5">
              {MOBILE_STATS.map((s, i) => (
                <ScrollReveal key={s.label} delay={i * 0.04}>
                  <div className="rounded-2xl bg-[#1d1d1f] border border-white/[0.06] px-4 py-4 text-center">
                    <p className={`[font-family:'Barlow_Condensed',sans-serif] font-black leading-none mb-1.5 ${accent}`} style={{ fontSize: "1.85rem" }}>
                      {s.value}
                    </p>
                    <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-white/45">{s.label}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>

            <div className="rounded-3xl bg-[#1d1d1f] border border-white/[0.08] overflow-hidden">
              <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-white/40 px-4 pt-4 pb-2">
                How it works
              </p>
              <ol className="divide-y divide-white/[0.08]">
                {MOBILE_STEPS.map((step, i) => {
                  const Icon = step.icon;
                  return (
                    <ScrollReveal key={step.num} delay={0.05 + i * 0.05}>
                      <li className="flex gap-3.5 px-4 py-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] border border-white/[0.08]">
                          <Icon className="h-5 w-5 text-[#FF4D1C]" strokeWidth={1.75} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="font-mono text-[10px] tracking-wider text-white/35">{step.num}</span>
                            <h3 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-[15px] tracking-wide leading-tight">
                              {step.title}
                            </h3>
                          </div>
                          <p className="text-[13px] text-white/55 leading-relaxed">{step.body}</p>
                        </div>
                      </li>
                    </ScrollReveal>
                  );
                })}
              </ol>
            </div>

            <div className="-mx-4 px-4">
              <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-white/40 mb-2.5 px-0.5">
                Also included
              </p>
              <div
                className="flex gap-2.5 overflow-x-auto pb-2 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {MOBILE_PERKS.map((perk) => {
                  const Icon = perk.icon;
                  return (
                    <div
                      key={perk.label}
                      className="snap-start shrink-0 flex items-center gap-2 rounded-full bg-[#1d1d1f] border border-white/[0.08] pl-2.5 pr-3.5 py-2"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06]">
                        <Icon className="h-3.5 w-3.5 text-white/80" strokeWidth={1.75} />
                      </span>
                      <span className="text-xs text-white/70 whitespace-nowrap">{perk.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <ScrollReveal delay={0.1}>
              <button
                type="button"
                onClick={onGetStarted}
                className="w-full [font-family:'Barlow_Condensed',sans-serif] font-bold uppercase tracking-wider text-sm bg-[#FF4D1C] text-white px-5 py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                Start with your repair
                <ArrowRight size={15} />
              </button>
              <p className="mt-2.5 text-center font-mono text-[10px] tracking-[0.16em] uppercase text-white/35">
                Free to post · NYC & Long Island
              </p>
            </ScrollReveal>
          </div>

          {/* ── Desktop / tablet: Apple-style metric bento ──────────────────── */}
          <div
            className="hidden md:grid grid-cols-4 gap-4 md:[grid-template-areas:'a_b_c_c'_'d_e_e_f'_'g_e_e_h'_'i_j_k_l'_'m_n_o_p']"
          >
            <BentoCard className="md:[grid-area:a]" delay={0.02}>
              <p className={`[font-family:'Barlow_Condensed',sans-serif] font-black leading-none mb-2 ${accent}`} style={{ fontSize: "clamp(2.5rem,6vw,3.75rem)" }}>
                48h
              </p>
              <p className="text-sm text-white/55 leading-snug">
                Faster first bids
                <br />
                than cold calling
              </p>
            </BentoCard>

            <BentoCard className="md:[grid-area:b]" delay={0.06}>
              <Zap className="w-11 h-11 text-white mb-3" strokeWidth={1.5} />
              <p className="text-sm text-white/70 font-medium">Instant AI triage</p>
            </BentoCard>

            <BentoCard className="md:[grid-area:c]" delay={0.1}>
              <p className={`[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-none mb-2 tracking-tight ${accent}`} style={{ fontSize: "clamp(1.75rem,4vw,2.75rem)" }}>
                AI Assessment
              </p>
              <p className="text-sm text-white/50 max-w-[16rem]">
                Repair breakdown, cost range & urgency in minutes
              </p>
            </BentoCard>

            <BentoCard className="md:[grid-area:d]" delay={0.08}>
              <p className="text-sm text-white/50 mb-2">Avg. rating</p>
              <p className={`[font-family:'Barlow_Condensed',sans-serif] font-black leading-none ${accent}`} style={{ fontSize: "clamp(2.25rem,5vw,3.25rem)" }}>
                4.9★
              </p>
            </BentoCard>

            <BentoCard className="md:[grid-area:f]" delay={0.14}>
              <p className={`[font-family:'Barlow_Condensed',sans-serif] font-black leading-none mb-2 ${accent}`} style={{ fontSize: "clamp(2rem,5vw,2.75rem)" }}>
                312+
              </p>
              <p className="text-sm text-white/50">Vetted contractors</p>
            </BentoCard>

            <BentoCard className="min-h-0 md:[grid-area:e]" delay={0.12}>
              <div className="flex flex-col items-center justify-center gap-5 py-4 h-full">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]">
                  <BadgeCheck className="h-8 w-8 text-primary" strokeWidth={1.5} aria-hidden />
                </div>
                <div>
                  <p className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase text-3xl md:text-4xl tracking-wide text-white">
                    {brand.productName}
                  </p>
                  <p className="mt-2 text-sm text-white/45 max-w-[14rem] mx-auto leading-relaxed">
                    Problem → assessment → bids → booked. One clear path.
                  </p>
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-white/35">
                  <MapPin size={11} /> NYC & Long Island
                </div>
              </div>
            </BentoCard>

            <BentoCard className="md:[grid-area:g]" delay={0.1}>
              <ShieldCheck className="w-10 h-10 text-white mb-2.5" strokeWidth={1.5} />
              <p className="text-sm text-white/55 leading-snug">
                Licensed &
                <br />
                background-checked
              </p>
            </BentoCard>

            <BentoCard className="md:[grid-area:h]" delay={0.16}>
              <p className={`[font-family:'Barlow_Condensed',sans-serif] font-black leading-none mb-1 ${accent}`} style={{ fontSize: "clamp(2rem,4.5vw,2.5rem)" }}>
                $0
              </p>
              <p className="text-sm text-white/50">Free to post a job</p>
            </BentoCard>

            <BentoCard className="md:[grid-area:i]" delay={0.18}>
              <Camera className="w-10 h-10 text-white mb-2.5" strokeWidth={1.5} />
              <p className="text-sm text-white/55">Photo uploads</p>
            </BentoCard>

            <BentoCard className="md:[grid-area:j]" delay={0.2}>
              <Scale className="w-10 h-10 text-white mb-2.5" strokeWidth={1.5} />
              <p className="text-sm text-white/55">Side-by-side bids</p>
            </BentoCard>

            <BentoCard className="md:[grid-area:k]" delay={0.12}>
              <div className="flex items-center gap-3">
                <Clock className="w-7 h-7 text-white shrink-0" strokeWidth={1.5} />
                <p className="text-left text-sm text-white/60 leading-snug">
                  Book when you&apos;re ready — no pressure calls
                </p>
              </div>
            </BentoCard>

            <BentoCard className="md:[grid-area:l]" delay={0.14}>
              <p className={`[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-none mb-2 ${accent}`} style={{ fontSize: "clamp(1.25rem,3vw,1.65rem)" }}>
                Local rates
              </p>
              <p className="text-[11px] text-white/45">Transparent pricing</p>
            </BentoCard>

            <BentoCard className="md:[grid-area:m]" delay={0.16}>
              <Sparkles className="w-9 h-9 text-white mb-2" strokeWidth={1.5} />
              <p className="text-sm text-white/55">Urgency scoring</p>
            </BentoCard>

            <BentoCard className="md:[grid-area:n]" delay={0.18}>
              <div className="flex items-center justify-center gap-4 text-white/80">
                <Cpu className="w-8 h-8" strokeWidth={1.4} />
                <HardDrive className="w-8 h-8" strokeWidth={1.4} />
              </div>
              <p className="mt-3 text-sm text-white/50">AI + human oversight</p>
            </BentoCard>

            <BentoCard className="md:[grid-area:o]" delay={0.2}>
              <p className={`[font-family:'Barlow_Condensed',sans-serif] font-black leading-none mb-1 ${accent}`} style={{ fontSize: "clamp(1.75rem,4vw,2.25rem)" }}>
                2,847+
              </p>
              <p className="text-sm text-white/50">Jobs completed</p>
            </BentoCard>

            <BentoCard className="md:[grid-area:p]" delay={0.22}>
              <BadgeCheck className="w-9 h-9 text-white mb-2" strokeWidth={1.5} />
              <p className="text-sm text-white/55">Verified process</p>
            </BentoCard>
          </div>
        </div>
      </section>

      <CustomerTrustSection />

      {/* ── Stats strip ──────────────────────────────────────────────────── */}
      <section className="bg-muted border-b border-border">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4">
          {[
            { value: 2847, suffix: "+", label: "Jobs Completed" },
            { value: 4.9, suffix: "★", label: "Average Rating", decimal: true },
            { value: 312, suffix: "+", label: "Vetted Contractors" },
            { value: 48, suffix: "h", label: "Avg. First Bid" },
          ].map((s, i) => (
            <div
              key={s.label}
              className={`px-6 py-12 md:py-16 border-border ${i % 2 === 0 ? "border-r" : ""} ${
                i < 2 ? "border-b md:border-b-0" : ""
              } ${i < 3 ? "md:border-r" : ""}`}
            >
              <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-4xl md:text-5xl tracking-tight mb-2 text-foreground">
                <Counter value={s.value} suffix={s.suffix} decimal={s.decimal} />
              </p>
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <section className="bg-black text-white py-20 sm:py-28 md:py-36 px-4 sm:px-8 relative overflow-hidden">
        <motion.div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 0.06 }}
          viewport={{ once: true }}
        />
        <ScrollReveal>
          <div className="max-w-5xl mx-auto relative text-center pb-[env(safe-area-inset-bottom)]">
            <h2
              className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.88] tracking-tight mb-5 sm:mb-6"
              style={{ fontSize: "clamp(2.5rem,11vw,7rem)" }}
            >
              Stop googling
              <br />
              contractors.
            </h2>
            <p className="text-white/55 text-base sm:text-lg mb-8 sm:mb-10 max-w-md mx-auto leading-relaxed">
              Post free. Get assessed. Hire with real bids — NYC & Long Island.
            </p>
            <button
              onClick={onGetStarted}
              className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase tracking-wider text-sm bg-white text-black px-6 sm:px-8 py-3.5 sm:py-4 inline-flex items-center justify-center gap-2 hover:bg-white/90 transition-colors group w-full sm:w-auto max-w-sm"
            >
              Post Your Repair — It&apos;s Free
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </ScrollReveal>
      </section>
    </>
  );
}
