import { useMemo, useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { ArrowRight, MapPin, CheckCircle } from "lucide-react";
import { Counter, ScrollReveal, SectionLabel } from "./shared";
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

const FIXA_HELPS = [
  "Analyze photos and videos of home problems",
  "Identify visible signs and likely causes",
  "Understand the type of repair you may be dealing with",
  "Evaluate whether Guided DIY is appropriate",
  "Create detailed step-by-step DIY instructions",
  "Explain what tools and materials may be needed",
  "Tell you what result to expect after each step",
  "Adjust guidance when something looks different",
  "Recognize when it is better to stop and get professional help",
  "Carry your existing assessment into the professional service process",
];

const SUPER_FIXBRIDGE = [
  "Fixa Intelligence",
  "Guided DIY",
  "Photo & Video Analysis",
  "Professional Home Services",
  "Property History",
  "Property Passport",
  "HomeCare",
  "Repair Assessments",
  "Job Tracking",
  "Homeowner Support",
  "Contractor Coordination",
];

const HOW_IT_WORKS = [
  {
    title: "You show Fixa the problem",
    body: "Upload a photo or video and explain what you're experiencing.",
  },
  {
    title: "Fixa understands the situation",
    body: "Fixa reviews the information available for the repair, identifies relevant details, and builds an assessment around your specific situation.",
  },
  {
    title: "Fixa checks the next safe path",
    body: "If the problem is appropriate for Guided DIY, Fixa can walk you through the process. If it needs a professional, FixBridge moves the same information into the service flow.",
  },
];

const DIY_DETAIL = [
  "What to do",
  "How to do it",
  "Why the step matters",
  "What tools may be needed",
  "What to look for",
  "What result to expect",
  "What to do if the step does not work",
  "When to stop and request professional assistance",
];

const HANDOFF = [
  "The original issue",
  "Property information",
  "Uploaded photos or videos",
  "Fixa's assessment",
  "Repair category",
  "Risk information",
  "DIY steps already attempted",
  "Where the homeowner encountered a problem",
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
              A smarter way
              <br />
              to care for home.
            </h1>
            <p className="text-white/70 text-sm sm:text-base md:text-lg leading-relaxed mb-5 sm:mb-8 max-w-md">
              Real help. A more livable you. Meet Fixa, the intelligence behind {brand.productName}.
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

      <section className="py-16 sm:py-28 px-4 sm:px-6 max-w-3xl mx-auto">
        <ScrollReveal>
          <SectionLabel left="About FixBridge" right="One place" />
          <h2
            className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9] mb-6"
            style={{ fontSize: "clamp(2.25rem,7vw,4.5rem)" }}
          >
            A smarter way to take care of your home
          </h2>
          <div className="space-y-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
            <p>
              {brand.productName} is an AI-powered home repair and property care platform built to make maintaining a home simpler, faster, and more transparent.
            </p>
            <p>
              From understanding what is wrong to figuring out what to do next, {brand.productName} brings homeowners, intelligent technology, guided DIY support, property information, and trusted professionals together in one connected experience.
            </p>
            <p>
              Upload a photo or video, describe what is happening, understand the problem, follow guided repair steps when appropriate, or move the same assessment to a professional when expert help is needed.
            </p>
            <p className="text-foreground font-medium">Our goal is simple: Real help. A more livable you.</p>
          </div>
        </ScrollReveal>
      </section>

      <section className="py-16 sm:py-28 px-4 sm:px-6 max-w-7xl mx-auto border-t border-border">
        <ScrollReveal>
          <SectionLabel left="Meet Fixa" right="Central assistant" />
          <h2
            className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9] mb-6 max-w-3xl"
            style={{ fontSize: "clamp(2.25rem,7vw,4.5rem)" }}
          >
            The intelligence behind {brand.productName}
          </h2>
          <p className="max-w-3xl text-sm sm:text-base text-muted-foreground leading-relaxed mb-8">
            Think of Fixa as the brain behind your {brand.productName} experience. Fixa is designed to understand your home, your repair issue, the photos or videos you provide, the current job, previous repair information, and where you are in the repair process.
          </p>
        </ScrollReveal>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FIXA_HELPS.map((item) => (
            <li key={item} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              <CheckCircle size={16} className="text-primary shrink-0 mt-0.5" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="mt-8 max-w-3xl text-sm sm:text-base text-foreground leading-relaxed">
          Fixa doesn&apos;t just answer a question. It understands the scenario and helps determine what should happen next.
        </p>
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
                Super FixBridge
              </span>
              <h2
                className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9] mb-6"
                style={{ fontSize: "clamp(2.25rem,5vw,4.5rem)" }}
              >
                One platform.
                <br />
                <span className="text-primary">One assistant.</span>
              </h2>
              <p className="text-muted-foreground text-base sm:text-lg leading-relaxed mb-8 max-w-xl">
                Your home already has history. Your repairs already have context. Fixa helps {brand.productName} use that information so homeowners don&apos;t have to start from zero every time something goes wrong.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUPER_FIXBRIDGE.map((item) => (
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

      <section className="py-16 sm:py-28 px-4 sm:px-6 max-w-7xl mx-auto">
        <ScrollReveal>
          <SectionLabel left="How Fixa works" right="Same job" />
        </ScrollReveal>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {HOW_IT_WORKS.map((step, index) => (
            <ScrollReveal key={step.title} delay={index * 0.06}>
              <article className="h-full rounded-2xl border border-border bg-card p-5 sm:p-6">
                <p className="font-mono text-[11px] tracking-widest text-primary uppercase">Step {index + 1}</p>
                <h3 className="mt-2 text-lg font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </article>
            </ScrollReveal>
          ))}
        </div>
        <p className="mt-6 max-w-3xl text-sm text-muted-foreground">No starting over. No repeatedly explaining the same issue.</p>
      </section>

      <section className="py-16 sm:py-24 px-4 sm:px-6 max-w-7xl mx-auto border-t border-border">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          <div>
            <SectionLabel left="Guided DIY with Fixa" right="Not highlights" />
            <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9] mb-4" style={{ fontSize: "clamp(2rem,6vw,3.5rem)" }}>
              Beyond “check the connection.”
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-5">
              When a repair is appropriate for DIY, Fixa walks through the action, why it matters, what to look for, and when to stop.
            </p>
            <ul className="space-y-2">
              {DIY_DETAIL.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <CheckCircle size={14} className="text-primary shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4">
            <article className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <h3 className="text-lg font-semibold">Safety comes first</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Fixa works together with {brand.productName}&apos;s safety systems. AI does not get the final word on whether a potentially dangerous repair should continue. Higher-risk situations restrict DIY guidance when professional help is the safer option.
              </p>
            </article>
            <article className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <h3 className="text-lg font-semibold">From DIY to professional help</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                If DIY is unsuccessful, something changes, or you are not comfortable continuing, Hire a Professional keeps the same repair context.
              </p>
              <ul className="mt-4 space-y-2">
                {HANDOFF.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <CheckCircle size={14} className="text-primary shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 px-4 sm:px-6 max-w-3xl mx-auto">
        <ScrollReveal>
          <SectionLabel left="Fixa remains" right="Models may change" />
          <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9] mb-4" style={{ fontSize: "clamp(2rem,6vw,3.5rem)" }}>
            Built to grow with {brand.productName}
          </h2>
          <div className="space-y-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
            <p>
              Fixa is the permanent intelligence layer of {brand.productName}. The underlying AI technology can evolve. Homeowners keep interacting with one assistant: Fixa.
            </p>
            <p>
              Over time, Fixa is being designed to understand previous repairs, recurring problems, home systems, maintenance, past visits, homeowner-confirmed details, and professional outcomes — so every future interaction is more informed than the last.
            </p>
            <p className="text-foreground font-medium">
              Your home has problems. Fixa helps understand them. {brand.productName} helps solve them.
            </p>
          </div>
        </ScrollReveal>
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
              Welcome to
              <br />
              Super {brand.productName}
            </h2>
            <p className="text-white/75 text-base sm:text-xl mb-8 sm:mb-10 max-w-2xl mx-auto leading-relaxed">
              Models may change. Fixa remains. Post a repair as a homeowner, or join the network as a contractor.
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
