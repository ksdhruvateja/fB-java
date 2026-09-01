import { useMemo, useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import {
  ArrowRight,
  MapPin,
  Sparkles,
  Users,
  FileCheck,
  CheckCircle,
} from "lucide-react";
import { Counter, ScrollReveal, SectionLabel } from "./shared";
import { Icon3D } from "./Icon3D";
import { BrandLogo } from "./BrandLogo";
import { brand } from "../config/brand";

/** Job / place photos only — no person portraits. */
const HERO_PHOTOS = [
  {
    src: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1920&h=1200&fit=crop&auto=format&q=80",
    alt: "Blueprint and tools laid out for a home renovation",
  },
  {
    src: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1920&h=1200&fit=crop&auto=format&q=80",
    alt: "Workshop tools ready for a residential repair job",
  },
  {
    src: "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=1920&h=1200&fit=crop&auto=format&q=80",
    alt: "Power tools staged for carpentry and home repair",
  },
  {
    src: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1920&h=1200&fit=crop&auto=format&q=80",
    alt: "Modern home exterior across a residential neighborhood",
  },
  {
    src: "https://images.unsplash.com/photo-1560184897-ae75f418493e?w=1920&h=1200&fit=crop&auto=format&q=80",
    alt: "City row houses along a quiet residential street",
  },
];

const SIDE_PHOTOS = [
  {
    src: "https://images.unsplash.com/photo-1556912173-46c336c7fd55?w=900&h=700&fit=crop&auto=format&q=80",
    alt: "Bright kitchen ready for repair or remodel work",
  },
  {
    src: "https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?w=900&h=700&fit=crop&auto=format&q=80",
    alt: "Paint and finishing supplies for a home project",
  },
  {
    src: "https://images.unsplash.com/photo-1615874959474-d609969a20ed?w=900&h=700&fit=crop&auto=format&q=80",
    alt: "Living room interior prepared for home improvement",
  },
  {
    src: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=900&h=700&fit=crop&auto=format&q=80",
    alt: "Bathroom remodel space mid renovation",
  },
];

function pickPhoto<T>(pool: T[], salt = 0): T {
  const i = Math.floor((Math.random() * pool.length + salt) % pool.length);
  return pool[i];
}

const PRINCIPLES = [
  {
    icon: Sparkles,
    title: "AI First, Human Accountable",
    body: `${brand.productName} turns messy home repair problems into clear scopes, estimated ranges, and better-informed decisions before a contractor even bids.`,
    tone: "coral" as const,
  },
  {
    icon: FileCheck,
    title: "Trust Before Transactions",
    body: "We are built around verified contractors, cleaner job intake, and transparent expectations on both sides of the marketplace.",
    tone: "ink" as const,
  },
  {
    icon: Users,
    title: "Better For Both Sides",
    body: "Homeowners get clarity and confidence. Contractors get qualified jobs with real specs instead of low-intent leads.",
    tone: "steel" as const,
  },
];

const COVERAGE = [
  "Nationwide service coverage",
  "Licensed trade verification and profile trust signals",
  "AI-guided repair intake before job posting",
  "Structured bidding flow for apples-to-apples quotes",
];

const IMPACT = [
  { value: 2847, suffix: "+", label: "Repair Requests Guided" },
  { value: 312, suffix: "+", label: "Vetted Contractors" },
  { value: 48, suffix: "h", label: "Average First Bid" },
];

export default function AboutPage({
  scrollContainer,
  onGoHomeowner,
  onGoContractor,
}: {
  scrollContainer?: React.RefObject<HTMLDivElement | null>;
  onGoHomeowner: () => void;
  onGoContractor: () => void;
}) {
  const heroRef = useRef<HTMLElement>(null);
  const heroPhoto = useMemo(() => pickPhoto(HERO_PHOTOS), []);
  const sidePhoto = useMemo(() => pickPhoto(SIDE_PHOTOS, 1), []);
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
            src={heroPhoto.src}
            alt={heroPhoto.alt}
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-black/45" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-black/35" />
        </motion.div>

        <motion.div
          style={{ opacity: contentOpacity }}
          className="relative z-10 flex-1 flex flex-col justify-end max-w-7xl mx-auto w-full px-4 sm:px-8 pt-[max(5.5rem,calc(env(safe-area-inset-top)+4.5rem))] pb-[max(1.25rem,env(safe-area-inset-bottom))] md:pb-8"
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
              We make home repair
              <br />
              make sense.
            </h1>
            <p className="text-white/70 text-sm sm:text-base md:text-lg leading-relaxed mb-5 sm:mb-8 max-w-md">
              The layer between homeowners and contractors — AI-structured requests, clearer scope, fewer surprises.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={onGoHomeowner}
                className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase tracking-wider text-sm bg-white text-black px-5 sm:px-7 py-3 sm:py-3.5 flex items-center justify-center gap-2 hover:bg-white/90 transition-colors group w-full sm:w-auto"
              >
                Post a Repair
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </button>
              <button
                type="button"
                onClick={onGoContractor}
                className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase tracking-wider text-sm border border-white/40 text-white px-5 sm:px-7 py-3 sm:py-3.5 hover:border-white transition-colors w-full sm:w-auto text-center"
              >
                Join as a Contractor
              </button>
            </div>
          </motion.div>

          <motion.div style={{ y: brandY }} className="w-full flex justify-start items-end">
            <BrandLogo variant="hero" className="drop-shadow-[0_8px_28px_rgba(0,0,0,0.5)]" />
          </motion.div>
        </motion.div>
      </section>

      <section className="border-y border-border py-12 sm:py-20 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
            {IMPACT.map((stat, index) => (
              <ScrollReveal key={stat.label} delay={index * 0.1}>
                <div className="px-4 sm:px-6 py-6 sm:py-8 text-center">
                  <div
                    className="[font-family:'Barlow_Condensed',sans-serif] font-black leading-none text-foreground mb-2"
                    style={{ fontSize: "clamp(2.25rem,8vw,4.5rem)" }}
                  >
                    <Counter value={stat.value} suffix={stat.suffix} />
                  </div>
                  <p className="font-mono text-[9px] sm:text-[11px] tracking-widest text-muted-foreground uppercase">
                    {stat.label}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-28 px-4 sm:px-6 max-w-7xl mx-auto">
        <ScrollReveal>
          <SectionLabel left="What We Believe" right="3 Principles" />
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <h2
            className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9] mb-10 sm:mb-16"
            style={{ fontSize: "clamp(2.5rem,8vw,5.5rem)" }}
          >
            LESS FRICTION.
            <br />
            <span style={{ WebkitTextStroke: "2px #FF4D1C", WebkitTextFillColor: "transparent" }}>
              MORE TRUST.
            </span>
          </h2>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 border-l border-border">
          {PRINCIPLES.map(({ icon, title, body, tone }, index) => (
            <ScrollReveal key={title} delay={index * 0.08}>
              <div className="border-r border-b border-border p-6 sm:p-8 lg:p-10 h-full">
                <div className="mb-5 sm:mb-6">
                  <Icon3D icon={icon} tone={tone} size="responsive" />
                </div>
                <h3 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-xl sm:text-2xl text-foreground mb-3">
                  {title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section className="py-16 sm:py-28 bg-card border-y border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-10 sm:gap-16 items-center">
          <ScrollReveal>
            <div className="relative overflow-hidden aspect-[4/3] bg-muted">
              <img
                src={sidePhoto.src}
                alt={sidePhoto.alt}
                className="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/70 to-transparent" />
              <div className="absolute bottom-3 left-3 right-3 sm:bottom-5 sm:left-5 sm:right-5">
                <div className="bg-card/95 backdrop-blur border border-border p-3 sm:p-4 shadow-lg">
                  <div className="flex justify-between mb-1.5 gap-2">
                    <span className="font-mono text-[10px] tracking-wider text-primary uppercase">
                      Coverage
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0">Current market</span>
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    Built for homeowners and contractors across the United States
                  </p>
                  <div className="flex items-center gap-1">
                    <MapPin size={11} className="text-muted-foreground" />
                    <p className="font-mono text-[11px] text-muted-foreground">
                      Nationwide · United States
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.15}>
            <div>
              <span className="font-mono text-[11px] tracking-[0.2em] text-primary uppercase block mb-6">
                Why We Exist
              </span>
              <h2
                className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9] mb-6"
                style={{ fontSize: "clamp(2.5rem,5vw,4.5rem)" }}
              >
                A CLEARER PATH
                <br />
                <span className="text-primary">FROM PROBLEM</span>
                <br />
                TO PRO.
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed mb-8 max-w-xl">
                Most repair marketplaces optimize for lead volume. {brand.productName} is built to improve
                understanding first, so the matching, bidding, and hiring process starts from a
                better brief.
              </p>
              <ul className="space-y-3">
                {COVERAGE.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <CheckCircle size={14} className="text-primary shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section className="py-16 sm:py-28 bg-primary relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        <ScrollReveal>
          <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center relative pb-[env(safe-area-inset-bottom)]">
            <h2
              className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.88] text-white mb-5 sm:mb-6"
              style={{ fontSize: "clamp(2.5rem,10vw,7rem)" }}
            >
              READY TO USE
              <br />
              {brand.productName.toUpperCase()}?
            </h2>
            <p className="text-white/75 text-base sm:text-xl mb-8 sm:mb-10 max-w-2xl mx-auto leading-relaxed">
              Start from the side you are on: post a repair as a homeowner, or join the network
              as a contractor.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 justify-center">
              <button
                type="button"
                onClick={onGoHomeowner}
                className="font-medium bg-white text-primary px-6 sm:px-8 py-3.5 sm:py-4 text-sm sm:text-base flex items-center justify-center gap-2 hover:bg-white/90 transition-all group w-full sm:w-auto"
              >
                Post Your Repair
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </button>
              <button
                type="button"
                onClick={onGoContractor}
                className="font-medium border-2 border-white/70 text-white px-6 sm:px-8 py-3.5 sm:py-4 text-sm sm:text-base hover:border-white hover:bg-white/10 transition-colors w-full sm:w-auto"
              >
                Join as a Contractor
              </button>
            </div>
          </div>
        </ScrollReveal>
      </section>
    </>
  );
}
