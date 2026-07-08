import { useRef, useEffect } from "react";
import { motion, useInView } from "motion/react";
import { animate } from "motion";

// ─── useTilt ──────────────────────────────────────────────────────────────────
export function useTilt(strength = 14) {
  const ref = useRef<HTMLDivElement>(null);
  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${x * strength}deg) rotateX(${-y * strength}deg) scale3d(1.025,1.025,1.025)`;
  };
  const handleLeave = () => {
    if (ref.current)
      ref.current.style.transform =
        "perspective(900px) rotateY(0deg) rotateX(0deg) scale3d(1,1,1)";
  };
  return { ref, handleMove, handleLeave };
}

// ─── ScrollReveal ─────────────────────────────────────────────────────────────
export function ScrollReveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 36 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.72, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
    >
      {children}
    </motion.div>
  );
}

// ─── Counter ──────────────────────────────────────────────────────────────────
export function Counter({
  value,
  suffix,
  decimal,
}: {
  value: number;
  suffix: string;
  decimal?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const node = ref.current;
    const ctrl = animate(0, value, {
      duration: 2.2,
      ease: "easeOut",
      onUpdate(v) {
        node.textContent = decimal
          ? v.toFixed(1)
          : Math.floor(v).toLocaleString();
      },
    });
    return () => ctrl.stop();
  }, [inView, value, decimal]);
  return (
    <>
      <span ref={ref}>{decimal ? "0.0" : "0"}</span>
      {suffix}
    </>
  );
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────
export function SectionLabel({ left, right }: { left: string; right?: string }) {
  return (
    <div className="flex items-center gap-4 mb-14">
      <span className="font-mono text-[11px] tracking-[0.2em] text-primary uppercase">
        {left}
      </span>
      <span className="h-px flex-1 bg-border" />
      {right && (
        <span className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
          {right}
        </span>
      )}
    </div>
  );
}

// ─── Shared ticker items ───────────────────────────────────────────────────────
export const TICKER_ITEMS = [
  "Licensed & Vetted Contractors",
  "AI Repair Assessment",
  "No Subscription Needed",
  "NYC & Long Island",
  "Free to Post",
  "Real Bids Only",
  "Background-Checked Pros",
  "Transparent Pricing",
];
