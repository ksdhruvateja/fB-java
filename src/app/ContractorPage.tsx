import { useRef } from "react";
import { motion, useScroll, useTransform, useInView } from "motion/react";
import {
  ArrowRight, CheckCircle, MapPin, Star, TrendingUp,
  FileCheck, Bell, MessageSquare, DollarSign, Briefcase,
  Wrench, Zap, Flame, PaintBucket, Home, Layers, Hammer,
} from "lucide-react";
import { ScrollReveal, Counter, SectionLabel } from "./shared";
import { Icon3D } from "./Icon3D";
import { BrandLogo } from "./BrandLogo";
import ContractorReviewsSection from "./ContractorReviewsSection";
import { brand } from "../config/brand";

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
  { value: 100, suffix: "%", label: "Secure Stripe Payouts" },
];

// ─── Sub-components ────────────────────────────────────────────────────────────

function BiddingStep({ step, index }: { step: (typeof CONTRACTOR_STEPS)[0]; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      className={[
        // Mobile: single horizontal line
        "flex flex-row items-center gap-3 border-b border-border py-3.5 px-1",
        // Desktop: tall process card
        "md:flex-col md:items-start md:border-r md:p-8 lg:p-12 md:relative md:overflow-hidden",
        "group hover:bg-muted/40 transition-colors duration-300",
      ].join(" ")}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay: index * 0.12, ease: "easeOut" }}
    >
      <span
        className="hidden md:block absolute top-3 right-3 sm:top-4 sm:right-4 [font-family:'Barlow_Condensed',sans-serif] font-black leading-none select-none opacity-30 text-border group-hover:opacity-50 transition-opacity duration-300 pointer-events-none"
        style={{ fontSize: "clamp(3.5rem,18vw,7.5rem)" }}
      >
        {step.num}
      </span>

      <div className="shrink-0 relative z-10 md:mb-7">
        <Icon3D icon={step.icon} tone={index === 1 ? "ink" : "coral"} size="sm" className="md:hidden" />
        <div className="hidden md:block">
          <Icon3D icon={step.icon} tone={index === 1 ? "ink" : "coral"} size="responsive" />
        </div>
      </div>

      <span className="md:hidden font-mono text-[10px] tracking-wider text-muted-foreground shrink-0">
        {step.num}
      </span>

      <div className="md:hidden min-w-0 flex-1 flex items-center gap-2">
        <h3 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-[15px] text-foreground whitespace-nowrap">
          {step.title}
        </h3>
        <span className="text-muted-foreground/40 shrink-0" aria-hidden>
          —
        </span>
        <p className="min-w-0 flex-1 text-xs text-muted-foreground truncate">{step.body}</p>
      </div>

      <h3 className="hidden md:block [font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-xl text-foreground relative z-10 mb-3">
        {step.title}
      </h3>
      <p className="hidden md:block text-sm text-muted-foreground leading-relaxed relative z-10">
        {step.body}
      </p>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=1920&h=1200&fit=crop&auto=format&q=80";

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
  const imageScale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);
  const brandY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.55], [1, 0]);

  return (
    <>
      {/* ── Hero: full-bleed photo + brand (matches homeowners) ───────────── */}
      <section ref={heroRef} className="relative min-h-[100svh] min-h-[100dvh] flex flex-col overflow-hidden bg-black">
        <motion.div className="absolute inset-0" style={{ scale: imageScale }}>
          <img
            src={HERO_IMAGE}
            alt="Construction materials staged for a trade job"
            className="absolute inset-0 w-full h-full object-cover"
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
              Win jobs.
              <br />
              Build your business.
            </h1>
            <p className="text-white/70 text-sm sm:text-base md:text-lg leading-relaxed mb-5 sm:mb-8 max-w-md">
              No monthly fees. Get matched with real jobs in your trade — review full specs, then bid on merit.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={onApply}
                className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase tracking-wider text-sm bg-white text-black px-5 sm:px-7 py-3 sm:py-3.5 flex items-center justify-center gap-2 hover:bg-white/90 transition-colors group w-full sm:w-auto"
              >
                Apply as a Contractor
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </button>
              <button
                type="button"
                onClick={() => {
                  document.getElementById("contractor-how-it-works")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase tracking-wider text-sm border border-white/40 text-white px-5 sm:px-7 py-3 sm:py-3.5 hover:border-white transition-colors w-full sm:w-auto text-center"
              >
                How Bidding Works
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

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <section className="border-y border-border py-12 sm:py-20 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border">
            {STATS.map((stat, i) => (
              <ScrollReveal key={i} delay={i * 0.1}>
                <div className={`px-3 sm:px-6 py-6 sm:py-8 text-center ${i >= 2 ? "border-t lg:border-t-0 border-border" : ""}`}>
                  <div
                    className="[font-family:'Barlow_Condensed',sans-serif] font-black leading-none text-foreground mb-2"
                    style={{ fontSize: "clamp(2rem,8vw,4.5rem)" }}
                  >
                    <Counter value={stat.value} suffix={stat.suffix} decimal={stat.decimal} />
                  </div>
                  <p className="font-mono text-[9px] sm:text-[11px] tracking-widest text-muted-foreground uppercase leading-snug">
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
        <div className="grid grid-cols-1 md:grid-cols-3 border-t md:border-t-0 md:border-l border-border">
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
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {BENEFITS.map(({ icon, title, desc }, i) => (
                <ScrollReveal key={i} delay={i * 0.08} className="h-full">
                  <div className="border border-border p-2.5 sm:p-5 hover:border-primary/40 transition-colors duration-200 bg-background h-full flex flex-col items-center sm:items-start text-center sm:text-left">
                    <div className="mb-2 sm:mb-4">
                      <Icon3D
                        icon={icon}
                        tone={i % 2 === 0 ? "coral" : "sand"}
                        size="sm"
                      />
                    </div>
                    <p className="text-[11px] sm:text-sm font-medium text-foreground mb-0.5 sm:mb-1 leading-tight">
                      {title}
                    </p>
                    <p className="font-mono text-[9px] sm:text-[11px] text-muted-foreground leading-snug line-clamp-3 sm:line-clamp-none">
                      {desc}
                    </p>
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
          {TRADES.map(({ icon, label }, i) => (
            <ScrollReveal key={i} delay={i * 0.07}>
              <div className="border-r border-b border-border p-5 sm:p-8 flex flex-col items-center gap-3 sm:gap-4 text-center group hover:bg-card transition-colors duration-200 cursor-default">
                <Icon3D
                  icon={icon}
                  tone={i % 3 === 0 ? "coral" : i % 3 === 1 ? "ink" : "steel"}
                  size="responsive"
                  label={label}
                />
                <p className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-sm sm:text-base text-foreground tracking-wide">
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
                src="https://images.unsplash.com/photo-1504148455328-c376907d081c?w=800&h=600&fit=crop&auto=format"
                alt="Trade tools ready for a verified job"
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

      <ContractorReviewsSection />

      {/* ── Application CTA ──────────────────────────────────────────────── */}
      <section className="py-16 sm:py-24 bg-primary relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start pb-[env(safe-area-inset-bottom)]">
          <ScrollReveal>
            <h2
              className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.95] tracking-tight text-white mb-5 sm:mb-6"
              style={{ fontSize: "clamp(2.5rem,8vw,5rem)" }}
            >
              READY TO
              <br />
              GROW YOUR
              <br />
              BUSINESS?
            </h2>
            <p className="text-white text-base sm:text-lg mb-6 max-w-md leading-relaxed">
              Join 312+ licensed contractors already winning jobs on {brand.productName}. It takes 10 minutes to
              apply. Zero dollars to join.
            </p>
            <p className="text-sm font-medium text-white/95 leading-relaxed max-w-md">
              Verified professionals · Secure payments · Local coverage
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div className="rounded-2xl bg-white p-6 sm:p-8 shadow-xl text-foreground">
              <h3 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-2xl sm:text-3xl text-foreground mb-6">
                Apply to Join
              </h3>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  onApply?.();
                }}
              >
                {[
                  { label: "Full Name", name: "fullName", type: "text", autoComplete: "name" },
                  { label: "Trade", name: "trade", type: "text", autoComplete: "organization-title" },
                  { label: "License Number", name: "licenseNumber", type: "text", autoComplete: "off" },
                  { label: "Email Address", name: "email", type: "email", autoComplete: "email" },
                ].map(({ label, name, type, autoComplete }) => (
                  <div key={name}>
                    <label
                      htmlFor={`apply-${name}`}
                      className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-1.5"
                    >
                      {label}
                    </label>
                    <input
                      id={`apply-${name}`}
                      name={name}
                      type={type}
                      autoComplete={autoComplete}
                      defaultValue=""
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-transparent focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40 transition-colors"
                    />
                  </div>
                ))}
                <button
                  type="submit"
                  className="w-full rounded-xl font-semibold bg-primary text-white py-3.5 text-base flex items-center justify-center gap-2 hover:brightness-105 transition-all mt-2 group"
                >
                  Submit Application
                  <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                </button>
                <p className="text-xs text-muted-foreground text-center leading-relaxed">
                  We review applications within 2 business days.
                </p>
              </form>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
