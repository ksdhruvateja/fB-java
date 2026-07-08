import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import {
  ArrowRight,
  Shield,
  MapPin,
  Sparkles,
  Users,
  FileCheck,
  CheckCircle,
  Bell,
} from "lucide-react";
import { Counter, ScrollReveal, SectionLabel } from "./shared";

const PRINCIPLES = [
  {
    icon: Sparkles,
    title: "AI First, Human Accountable",
    body: "FixBridge turns messy home repair problems into clear scopes, estimated ranges, and better-informed decisions before a contractor even bids.",
  },
  {
    icon: FileCheck,
    title: "Trust Before Transactions",
    body: "We are built around verified contractors, cleaner job intake, and transparent expectations on both sides of the marketplace.",
  },
  {
    icon: Users,
    title: "Better For Both Sides",
    body: "Homeowners get clarity and confidence. Contractors get qualified jobs with real specs instead of low-intent leads.",
  },
];

const COVERAGE = [
  "NYC boroughs and Long Island service coverage",
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
  const { scrollYProgress } = useScroll({
    target: heroRef,
    container: scrollContainer,
    offset: ["start start", "end start"],
  });

  const heroTextY = useTransform(scrollYProgress, [0, 1], [0, -70]);
  const heroCardY = useTransform(scrollYProgress, [0, 1], [0, -40]);

  return (
    <>
      <section ref={heroRef} className="relative min-h-screen flex items-center overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />
        <div
          className="absolute left-1/2 top-1/3 w-[520px] h-[520px] -translate-x-1/2 rounded-full blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,77,28,0.12) 0%, transparent 70%)" }}
        />

        <div className="relative max-w-7xl mx-auto px-6 pt-28 pb-20 w-full grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center min-h-screen">
          <motion.div style={{ y: heroTextY }}>
            <div className="flex items-center gap-3 mb-8">
              <span className="font-mono text-[11px] tracking-[0.2em] text-primary uppercase">
                About FixBridge
              </span>
              <span className="h-px w-10 bg-primary" />
              <span className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
                NYC & Long Island
              </span>
            </div>

            <h1
              className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.88] mb-8"
              style={{ fontSize: "clamp(4rem,9vw,8rem)" }}
            >
              <span className="block text-foreground">WE MAKE</span>
              <span className="block text-foreground">HOME REPAIR</span>
              <span
                className="block"
                style={{ WebkitTextStroke: "2px #FF4D1C", WebkitTextFillColor: "transparent" }}
              >
                MAKE SENSE.
              </span>
            </h1>

            <p className="text-muted-foreground text-lg max-w-xl leading-relaxed mb-8">
              FixBridge is the layer between confused homeowners and overloaded contractors.
              We use AI to structure repair requests, clarify scope, and help both sides move
              faster with fewer surprises.
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onGoHomeowner}
                className="font-medium bg-primary text-white px-6 py-3.5 flex items-center gap-2 hover:bg-primary/90 transition-all group"
              >
                Post a Repair
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </button>
              <button
                type="button"
                onClick={onGoContractor}
                className="font-medium border border-border text-foreground px-6 py-3.5 hover:border-foreground/30 transition-colors"
              >
                Join as a Contractor
              </button>
            </div>
          </motion.div>

          <motion.div style={{ y: heroCardY }} className="lg:justify-self-end">
            <div className="border border-border bg-card shadow-xl overflow-hidden">
              <div className="border-b border-border px-5 py-4 flex items-center justify-between bg-muted/30">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                  <span className="font-mono text-xs text-muted-foreground ml-2">
                    why fixbridge works
                  </span>
                </div>
                <span className="font-mono text-[10px] text-primary uppercase tracking-wider">
                  Live Model
                </span>
              </div>

              <div className="p-6 space-y-5">
                {[
                  {
                    icon: Shield,
                    title: "Cleaner intake",
                    body: "Homeowners describe the problem once, and AI turns that into structured job detail.",
                  },
                  {
                    icon: Bell,
                    title: "Smarter matching",
                    body: "Contractors see the right jobs with trade, urgency, and context already laid out.",
                  },
                  {
                    icon: CheckCircle,
                    title: "Better decisions",
                    body: "Both sides compare expectations before the booking, not after the invoice.",
                  },
                ].map(({ icon: Icon, title, body }) => (
                  <div key={title} className="border border-border bg-background p-4">
                    <Icon size={16} className="text-primary mb-2" />
                    <p className="text-sm font-medium text-foreground mb-1">{title}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="border-y border-border py-20 bg-card">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
            {IMPACT.map((stat, index) => (
              <ScrollReveal key={stat.label} delay={index * 0.1}>
                <div className="px-6 py-8 text-center">
                  <div
                    className="[font-family:'Barlow_Condensed',sans-serif] font-black leading-none text-foreground mb-2"
                    style={{ fontSize: "clamp(2.8rem,5.5vw,4.5rem)" }}
                  >
                    <Counter value={stat.value} suffix={stat.suffix} />
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

      <section className="py-28 px-6 max-w-7xl mx-auto">
        <ScrollReveal>
          <SectionLabel left="What We Believe" right="3 Principles" />
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <h2
            className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9] mb-16"
            style={{ fontSize: "clamp(3rem,6vw,5.5rem)" }}
          >
            LESS FRICTION.
            <br />
            <span style={{ WebkitTextStroke: "2px #FF4D1C", WebkitTextFillColor: "transparent" }}>
              MORE TRUST.
            </span>
          </h2>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 border-l border-border">
          {PRINCIPLES.map(({ icon: Icon, title, body }, index) => (
            <ScrollReveal key={title} delay={index * 0.08}>
              <div className="border-r border-b border-border p-8 lg:p-10 h-full">
                <Icon size={18} className="text-primary mb-5" />
                <h3 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-2xl text-foreground mb-3">
                  {title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section className="py-28 bg-card border-y border-border">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-16 items-center">
          <ScrollReveal>
            <div className="relative overflow-hidden aspect-[4/3] bg-muted">
              <img
                src="https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?w=900&h=700&fit=crop&auto=format"
                alt="Contractor reviewing a residential job site"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/70 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5">
                <div className="bg-card/95 backdrop-blur border border-border p-4 shadow-lg">
                  <div className="flex justify-between mb-1.5">
                    <span className="font-mono text-[10px] tracking-wider text-primary uppercase">
                      Coverage
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">Current market</span>
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    Built for homeowners and contractors across NYC & Long Island
                  </p>
                  <div className="flex items-center gap-1">
                    <MapPin size={11} className="text-muted-foreground" />
                    <p className="font-mono text-[11px] text-muted-foreground">
                      Boroughs, Nassau, and Suffolk
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
                Most repair marketplaces optimize for lead volume. FixBridge is built to improve
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

      <section className="py-28 bg-primary relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        <ScrollReveal>
          <div className="max-w-5xl mx-auto px-6 text-center relative">
            <h2
              className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.88] text-white mb-6"
              style={{ fontSize: "clamp(3.5rem,9vw,7rem)" }}
            >
              READY TO USE
              <br />
              FIXBRIDGE?
            </h2>
            <p className="text-white/75 text-xl mb-10 max-w-2xl mx-auto leading-relaxed">
              Start from the side you are on: post a repair as a homeowner, or join the network
              as a contractor.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <button
                type="button"
                onClick={onGoHomeowner}
                className="font-medium bg-white text-primary px-8 py-4 text-base flex items-center gap-2 hover:bg-white/90 transition-all group"
              >
                Post Your Repair
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </button>
              <button
                type="button"
                onClick={onGoContractor}
                className="font-medium border-2 border-white/70 text-white px-8 py-4 text-base hover:border-white hover:bg-white/10 transition-colors"
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
