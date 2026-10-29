import type { ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { ScrollReveal, SectionLabel } from "../shared";

const display = "[font-family:'Barlow_Condensed',sans-serif] font-black uppercase tracking-tight";

/** Dark page header used by the public content pages; leaves room for the fixed marketing nav. */
export function PageHero({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden bg-black text-white">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="relative mx-auto max-w-7xl px-4 pb-12 pt-[max(7rem,calc(env(safe-area-inset-top)+6rem))] sm:px-8 sm:pb-16 md:pb-20"
      >
        <span className="mb-5 block font-mono text-xs uppercase tracking-[0.2em] text-primary">{eyebrow}</span>
        <h1 className={`${display} max-w-4xl leading-[0.92]`} style={{ fontSize: "clamp(2.4rem,7.5vw,5rem)" }}>
          {title}
        </h1>
        {intro ? <div className="mt-5 max-w-2xl text-sm leading-relaxed text-white/75 sm:text-base md:text-lg">{intro}</div> : null}
        {children ? <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-3">{children}</div> : null}
      </motion.div>
    </header>
  );
}

export function PrimaryButton({ children, onClick, light }: { children: ReactNode; onClick: () => void; light?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-bold uppercase tracking-wider transition-colors sm:w-auto [font-family:'Barlow_Condensed',sans-serif] ${
        light ? "bg-white text-black hover:bg-white/90" : "bg-primary text-white hover:bg-primary/90"
      }`}
    >
      {children}
      <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" aria-hidden />
    </button>
  );
}

export function SecondaryButton({ children, onClick, light }: { children: ReactNode; onClick: () => void; light?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-center px-6 py-3.5 text-sm font-bold uppercase tracking-wider transition-colors sm:w-auto [font-family:'Barlow_Condensed',sans-serif] ${
        light ? "border border-white/40 text-white hover:border-white" : "border border-border text-foreground hover:border-primary hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}

export function ContentSection({
  label,
  right,
  title,
  intro,
  children,
  muted,
  id,
}: {
  label: string;
  right?: string;
  title?: ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
  muted?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={muted ? "border-y border-border bg-card" : ""}>
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 md:py-24">
        <ScrollReveal>
          <SectionLabel left={label} right={right} />
          {title ? (
            <h2 className={`${display} mb-5 max-w-3xl leading-[0.92]`} style={{ fontSize: "clamp(2rem,5.5vw,3.75rem)" }}>
              {title}
            </h2>
          ) : null}
          {intro ? <div className="mb-10 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">{intro}</div> : null}
        </ScrollReveal>
        {children}
      </div>
    </section>
  );
}

/** Numbered steps, one per row on mobile and a grid on larger screens. */
export function StepGrid({ steps, columns = 3 }: { steps: { title: string; body: ReactNode; tag?: string }[]; columns?: 2 | 3 | 4 }) {
  const cols = columns === 4 ? "lg:grid-cols-4" : columns === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3";
  return (
    <ol className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${cols}`}>
      {steps.map((step, index) => (
        <ScrollReveal key={step.title} delay={Math.min(index, 5) * 0.06} className="h-full">
          <li className="flex h-full flex-col border border-border bg-background p-5 transition-colors hover:border-primary/40">
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className={`${display} text-4xl leading-none text-primary`}>{String(index + 1).padStart(2, "0")}</span>
              {step.tag ? (
                <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  {step.tag}
                </span>
              ) : null}
            </div>
            <h3 className="mb-2 text-base font-semibold text-foreground">{step.title}</h3>
            <div className="text-sm leading-relaxed text-muted-foreground">{step.body}</div>
          </li>
        </ScrollReveal>
      ))}
    </ol>
  );
}

export function FeatureGrid({ items }: { items: { icon?: ReactNode; title: string; body: ReactNode }[] }) {
  return (
    <ul className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${items.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
      {items.map((item, index) => (
        <ScrollReveal key={item.title} delay={Math.min(index, 5) * 0.05} className="h-full">
          <li className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-5">
            {item.icon ? (
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">{item.icon}</span>
            ) : null}
            <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
            <div className="text-sm leading-relaxed text-muted-foreground">{item.body}</div>
          </li>
        </ScrollReveal>
      ))}
    </ul>
  );
}

export function CtaBand({ title, body, children }: { title: ReactNode; body?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-black text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-14 sm:px-6 sm:py-16 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <h2 className={`${display} leading-[0.92]`} style={{ fontSize: "clamp(2rem,5vw,3.5rem)" }}>
            {title}
          </h2>
          {body ? <p className="mt-3 text-sm leading-relaxed text-white/70 sm:text-base">{body}</p> : null}
        </div>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-3">{children}</div>
      </div>
    </section>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "safety" }) {
  return (
    <div
      className={`rounded-xl border p-4 text-sm leading-relaxed ${
        tone === "safety"
          ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
          : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      {children}
    </div>
  );
}
