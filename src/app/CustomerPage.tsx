import { useRef } from "react";
import { motion, useScroll, useTransform, useInView } from "motion/react";
import {
  ArrowRight, Shield, Zap, Clock, MapPin, Star,
  CheckCircle, DollarSign,
} from "lucide-react";
import { ScrollReveal, Counter, SectionLabel, useTilt, TICKER_ITEMS } from "./shared";

// ─── Data ─────────────────────────────────────────────────────────────────────

const STEPS = [
  {
    num: "01",
    title: "Describe the Problem",
    body: "Tell us what's broken — in plain English. Upload photos. Our AI handles the rest.",
    icon: Zap,
  },
  {
    num: "02",
    title: "Get Your AI Assessment",
    body: "Receive a detailed repair breakdown, estimated cost range, and urgency rating within minutes.",
    icon: Shield,
  },
  {
    num: "03",
    title: "Review Real Bids",
    body: "Licensed, vetted local contractors submit priced estimates. Compare, choose, and book.",
    icon: CheckCircle,
  },
];

const PERKS = [
  { icon: Zap, label: "AI in minutes", desc: "Instant repair assessment" },
  { icon: Shield, label: "Vetted pros only", desc: "Background-checked contractors" },
  { icon: DollarSign, label: "No subscription", desc: "Free to post, always" },
  { icon: Clock, label: "Fast turnaround", desc: "First bid under 48 hrs avg." },
];

const STATS = [
  { value: 2847, suffix: "+", label: "Jobs Completed" },
  { value: 4.9, suffix: "★", label: "Average Rating", decimal: true },
  { value: 312, suffix: "+", label: "Vetted Contractors" },
  { value: 48, suffix: "h", label: "Avg. First Bid" },
];

const TESTIMONIALS = [
  {
    name: "Maria Santos",
    location: "Astoria, Queens",
    text: "My ceiling was leaking the night before Thanksgiving. FixBridge had three bids by morning — and the contractor who won was incredible.",
    saved: "$800 saved vs. initial quote",
  },
  {
    name: "Tony Marchetti",
    location: "Huntington, Long Island",
    text: "I thought I needed a full HVAC replacement. The AI flagged it as a capacitor issue — $180 fix. Nobody tried to upsell me.",
    saved: "$2,400 saved vs. initial quote",
  },
  {
    name: "Devon Williams",
    location: "Flushing, Queens",
    text: "The AI broke down my panel upgrade better than any contractor I'd spoken to. I finally understood what I was paying for.",
    saved: "$1,100 saved vs. initial quote",
  },
  {
    name: "Rachel Kim",
    location: "Park Slope, Brooklyn",
    text: "I got four bids within 24 hours of posting. The AI estimate was spot on — the winning contractor came in right at the middle of the range.",
    saved: "$650 saved vs. initial quote",
  },
];

const FLOATING_CARDS = [
  {
    tag: "PLUMBING · URGENT",
    title: "Kitchen sink drain clog",
    location: "Park Slope, Brooklyn",
    bids: 4,
    topBid: "$180",
    time: "2h ago",
    floatClass: "float-a",
  },
  {
    tag: "ELECTRICAL",
    title: "Circuit breaker replacement",
    location: "Mineola, Long Island",
    bids: 2,
    topBid: "$340",
    time: "5h ago",
    floatClass: "float-b",
  },
  {
    tag: "HVAC · WINTER READY",
    title: "Furnace not heating evenly",
    location: "Astoria, Queens",
    bids: 6,
    topBid: "$520",
    time: "1d ago",
    floatClass: "float-c",
  },
];

// ─── Sub-components ────────────────────────────────────────────────────────────

function FloatingCard({
  card,
  style,
}: {
  card: (typeof FLOATING_CARDS)[0];
  style: React.CSSProperties;
}) {
  const { ref, handleMove, handleLeave } = useTilt(10);
  return (
    <div
      className={`absolute w-64 ${card.floatClass}`}
      style={{ ...style, transition: "transform 0.15s ease-out" }}
    >
      <div
        ref={ref}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        className="bg-card border border-border p-5 w-full shadow-lg"
        style={{ transition: "transform 0.15s ease-out" }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-[10px] tracking-[0.15em] text-primary uppercase">
            {card.tag}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {card.time}
          </span>
        </div>
        <p className="text-sm font-medium text-foreground mb-1.5 leading-snug">
          {card.title}
        </p>
        <div className="flex items-center gap-1 mb-4">
          <MapPin size={10} className="text-muted-foreground" />
          <span className="font-mono text-[11px] text-muted-foreground">
            {card.location}
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="font-mono text-[11px] text-muted-foreground">
            {card.bids} bids
          </span>
          <span className="text-sm font-semibold text-foreground">
            From {card.topBid}
          </span>
        </div>
      </div>
    </div>
  );
}

function StepCard({ step, index }: { step: (typeof STEPS)[0]; index: number }) {
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
        className="absolute top-4 right-4 font-['Barlow_Condensed',sans-serif] font-black leading-none select-none text-border group-hover:text-border/80 transition-colors duration-300"
        style={{ fontSize: "clamp(5rem,10vw,7.5rem)", opacity: 0.5 }}
      >
        {step.num}
      </span>
      <Icon size={22} className="text-primary mb-6 relative z-10" />
      <h3 className="font-['Barlow_Condensed',sans-serif] font-bold uppercase text-xl text-foreground mb-3 relative z-10">
        {step.title}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed relative z-10">
        {step.body}
      </p>
    </motion.div>
  );
}

function AssessmentDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const messages = [
    {
      role: "user",
      text: "My kitchen ceiling has a water stain that appeared overnight — about 8 inches across, brownish ring. Second floor bathroom is directly above it.",
    },
    {
      role: "ai",
      label: "AI Assessment",
      text: "Likely a slow leak from the bathroom above — supply line, wax ring, or drain gasket. Urgency: Medium-High. Water damage compounds fast.",
    },
    {
      role: "ai",
      label: "Cost Estimate",
      text: "Plumbing diagnosis + repair: $180–$450. Ceiling drywall patch if needed: +$150–$300. Total range: $180–$750.",
    },
  ];
  return (
    <div ref={ref} className="bg-background border border-border overflow-hidden shadow-md">
      <div className="border-b border-border px-4 py-3 flex items-center gap-2 bg-card">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
        <span className="font-mono text-xs text-muted-foreground ml-2">
          fixbridge — ai assessment engine
        </span>
      </div>
      <div className="p-5 space-y-4">
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: msg.role === "user" ? 20 : -20 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: i * 0.5 + 0.3, duration: 0.5 }}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[88%] p-3.5 ${
                msg.role === "user"
                  ? "bg-primary/10 border border-primary/25"
                  : "bg-card border border-border"
              }`}
            >
              {msg.label && (
                <p className="font-mono text-[10px] tracking-[0.15em] text-primary uppercase mb-1.5">
                  {msg.label}
                </p>
              )}
              <p className="text-xs text-foreground leading-relaxed">{msg.text}</p>
            </div>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 2 }}
          className="flex items-center gap-3 pt-2 border-t border-border"
        >
          <p className="flex-1 font-mono text-[11px] text-muted-foreground">
            Ready to receive contractor bids?
          </p>
          <button className="font-mono text-[11px] bg-primary text-white px-3 py-1.5 hover:bg-primary/90 transition-colors">
            Post Job →
          </button>
        </motion.div>
      </div>
    </div>
  );
}

function TestimonialCard({ t, index }: { t: (typeof TESTIMONIALS)[0]; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const inView = useInView(cardRef, { once: true });
  const { ref: tiltRef, handleMove, handleLeave } = useTilt(8);
  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.1 }}
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
          <div className="flex items-center gap-1 mt-1 mb-3">
            <MapPin size={10} className="text-muted-foreground" />
            <p className="font-mono text-[11px] text-muted-foreground">{t.location}</p>
          </div>
          <span className="inline-block font-mono text-[10px] tracking-wider text-primary border border-primary/30 bg-primary/5 px-2 py-1">
            {t.saved}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomerPage({
  scrollContainer,
}: {
  scrollContainer?: React.RefObject<HTMLDivElement | null>;
}) {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    container: scrollContainer,
    offset: ["start start", "end start"],
  });
  const heroTextY = useTransform(scrollYProgress, [0, 1], [0, -100]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);
  const heroCardsY = useTransform(scrollYProgress, [0, 1], [0, -50]);

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative min-h-screen flex items-center overflow-hidden">
        {/* Grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />
        {/* Glow */}
        <div
          className="absolute right-1/4 top-1/3 w-[500px] h-[500px] rounded-full blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,77,28,0.1) 0%, transparent 70%)" }}
        />

        <div className="relative max-w-7xl mx-auto px-6 pt-28 pb-20 w-full grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-12 lg:gap-16 items-center min-h-screen">
          <motion.div style={{ y: heroTextY, opacity: heroOpacity }}>
            <div className="flex items-center gap-3 mb-8">
              <span className="font-mono text-[11px] tracking-[0.2em] text-primary uppercase">
                NYC & Long Island
              </span>
              <span className="h-px w-10 bg-primary" />
              <span className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
                Est. 2026
              </span>
            </div>

            <h1
              className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.88] mb-8"
              style={{ fontSize: "clamp(4rem,9.5vw,8.5rem)" }}
            >
              <span className="block text-foreground">HOME</span>
              <span className="block text-foreground">REPAIR,</span>
              <span
                className="block"
                style={{ WebkitTextStroke: "2px #FF4D1C", WebkitTextFillColor: "transparent" }}
              >
                FIXED
              </span>
              <span className="block text-foreground">BY AI.</span>
            </h1>

            <p className="text-muted-foreground text-lg max-w-md leading-relaxed mb-8">
              Describe your problem. Get an AI assessment. Receive real bids from vetted
              local contractors — no subscription, no cold calls.
            </p>

            <div className="flex flex-wrap gap-3 mb-10">
              <button className="font-medium bg-primary text-white px-6 py-3.5 flex items-center gap-2 hover:bg-primary/90 transition-all group">
                Describe Your Problem
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </button>
              <button className="font-medium border border-border text-foreground px-6 py-3.5 hover:border-foreground/30 transition-colors">
                How It Works
              </button>
            </div>

            <div className="flex items-center gap-5">
              <div className="flex -space-x-2">
                {[["M","bg-orange-400"],["T","bg-sky-400"],["J","bg-emerald-500"],["D","bg-violet-400"]].map(
                  ([init, bg], i) => (
                    <div
                      key={i}
                      className={`w-8 h-8 rounded-full border-2 border-background ${bg} flex items-center justify-center text-[11px] font-bold text-white`}
                    >
                      {init}
                    </div>
                  )
                )}
              </div>
              <div>
                <div className="flex items-center gap-0.5 mb-1">
                  {[1,2,3,4,5].map((i) => (
                    <Star key={i} size={11} fill="#FF4D1C" className="text-primary" />
                  ))}
                </div>
                <p className="font-mono text-[11px] text-muted-foreground">2,847 jobs completed</p>
              </div>
            </div>
          </motion.div>

          {/* Floating bid cards */}
          <motion.div
            style={{ y: heroCardsY }}
            className="relative hidden lg:block w-72 h-[520px]"
          >
            <FloatingCard card={FLOATING_CARDS[0]} style={{ top: "0%", right: "0" }} />
            <FloatingCard card={FLOATING_CARDS[1]} style={{ top: "38%", right: "24px" }} />
            <FloatingCard card={FLOATING_CARDS[2]} style={{ top: "70%", right: "0" }} />
          </motion.div>
        </div>
      </section>

      {/* ── Ticker ───────────────────────────────────────────────────────── */}
      <div className="border-y border-border bg-card py-3 overflow-hidden">
        <div className="flex gap-10 animate-marquee whitespace-nowrap">
          {[...Array(4)].flatMap((_, gi) =>
            TICKER_ITEMS.map((item, i) => (
              <span
                key={`${gi}-${i}`}
                className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase inline-flex items-center gap-8"
              >
                {item}
                <span className="text-primary text-[8px]">◆</span>
              </span>
            ))
          )}
        </div>
      </div>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section className="py-28 px-6 max-w-7xl mx-auto">
        <ScrollReveal>
          <SectionLabel left="Process" right="3 Steps" />
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <h2
            className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9] mb-16"
            style={{ fontSize: "clamp(3rem,6vw,5.5rem)" }}
          >
            NO GUESSWORK.
            <br />
            <span style={{ WebkitTextStroke: "2px #FF4D1C", WebkitTextFillColor: "transparent" }}>
              JUST RESULTS.
            </span>
          </h2>
        </ScrollReveal>
        <div className="grid grid-cols-1 md:grid-cols-3 border-l border-border">
          {STEPS.map((step, i) => <StepCard key={i} step={step} index={i} />)}
        </div>
      </section>

      {/* ── AI Assessment ────────────────────────────────────────────────── */}
      <section className="py-28 bg-card border-y border-border">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <ScrollReveal>
            <div>
              <span className="font-mono text-[11px] tracking-[0.2em] text-primary uppercase block mb-6">
                AI Assessment Engine
              </span>
              <h2
                className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9] mb-6"
                style={{ fontSize: "clamp(2.5rem,5vw,4.5rem)" }}
              >
                YOUR PROBLEM,
                <br />
                <span className="text-primary">DIAGNOSED</span>
                <br />
                IN MINUTES.
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed mb-8 max-w-lg">
                Our AI has analyzed thousands of NYC-area repair jobs. It understands building
                codes, typical contractor rates, and what&apos;s urgent vs. cosmetic.
              </p>
              <ul className="space-y-3">
                {[
                  "Cost range estimate for your NYC/LI neighborhood",
                  "Urgency rating — cosmetic to emergency",
                  "Likely root cause & recommended repair approach",
                  "Smart questions to ask your contractor",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <CheckCircle size={14} className="text-primary shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={0.2}>
            <AssessmentDemo />
          </ScrollReveal>
        </div>
      </section>

      {/* ── Why FixBridge ────────────────────────────────────────────────── */}
      <section className="py-28 px-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <ScrollReveal delay={0.1}>
            <div className="relative overflow-hidden aspect-[4/3] bg-muted">
              <img
                src="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=600&fit=crop&auto=format"
                alt="Homeowner reviewing repair estimate on phone"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/70 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5">
                <div className="bg-card/95 backdrop-blur border border-border p-4 shadow-lg">
                  <div className="flex justify-between mb-1.5">
                    <span className="font-mono text-[10px] tracking-wider text-primary uppercase">
                      AI Assessment Ready
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">2 min ago</span>
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">Leaking kitchen faucet</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    Est. cost: $85–$220 · Urgency: Low
                  </p>
                </div>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div>
              <span className="font-mono text-[11px] tracking-[0.2em] text-primary uppercase block mb-6">
                For Homeowners
              </span>
              <h2
                className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9] mb-6"
                style={{ fontSize: "clamp(2.5rem,5vw,4.5rem)" }}
              >
                FREE TO POST.
                <br />
                <span className="text-primary">FAIR TO PAY.</span>
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed mb-8">
                Post your repair for free. Get an AI breakdown. Receive bids from
                background-checked local contractors. A small booking fee is charged only when
                you confirm — and it&apos;s credited off your final bill.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-8">
                {PERKS.map(({ icon: Icon, label, desc }, i) => (
                  <div
                    key={i}
                    className="border border-border p-4 hover:border-primary/40 transition-colors duration-200 bg-card"
                  >
                    <Icon size={15} className="text-primary mb-2" />
                    <p className="text-sm font-medium text-foreground mb-0.5">{label}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
              <button className="font-medium bg-primary text-white px-6 py-3.5 flex items-center gap-2 hover:bg-primary/90 transition-all group">
                Post Your Repair — It&apos;s Free
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </button>
            </div>
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

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <section className="py-28">
        <div className="max-w-7xl mx-auto px-6 mb-12">
          <ScrollReveal>
            <SectionLabel left="Reviews" />
            <h2
              className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9]"
              style={{ fontSize: "clamp(3rem,6vw,5rem)" }}
            >
              REAL PEOPLE.
              <br />
              <span style={{ WebkitTextStroke: "2px var(--foreground)", WebkitTextFillColor: "transparent" }}>
                REAL STORIES.
              </span>
            </h2>
          </ScrollReveal>
        </div>
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {TESTIMONIALS.map((t, i) => <TestimonialCard key={i} t={t} index={i} />)}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
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
              style={{ fontSize: "clamp(3.5rem,9vw,7.5rem)" }}
            >
              STOP GOOGLING
              <br />
              CONTRACTORS.
            </h2>
            <p className="text-white/75 text-xl mb-10 max-w-lg mx-auto leading-relaxed">
              Start getting real bids from vetted pros in your neighborhood. Free to post.
              No subscription ever.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <button className="font-medium bg-white text-primary px-8 py-4 text-base flex items-center gap-2 hover:bg-white/90 transition-all group">
                Post Your Repair — It&apos;s Free
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </button>
              <button className="font-medium border-2 border-white/70 text-white px-8 py-4 text-base hover:border-white hover:bg-white/10 transition-colors">
                Learn How It Works
              </button>
            </div>
          </div>
        </ScrollReveal>
      </section>
    </>
  );
}
