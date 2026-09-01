import { motion } from "motion/react";

export function AuthReportStepper({
  steps,
  current,
  onStepClick,
}: {
  steps: readonly { id: number; label: string; hint: string }[];
  current: number;
  onStepClick?: (step: number) => void;
}) {
  return (
    <div className="mt-5 lg:mt-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-neutral-500">
          Step <span className="font-bold text-primary">{current + 1}</span> of {steps.length}
        </p>
        <p className="text-[13px] font-semibold text-neutral-800">{steps[current]?.hint}</p>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none snap-x snap-mandatory">
        {steps.map((s) => {
          const done = s.id < current;
          const active = s.id === current;
          const clickable = onStepClick && s.id <= current;

          return (
            <motion.button
              key={s.id}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick(s.id)}
              whileTap={clickable ? { scale: 0.97 } : undefined}
              className={`snap-start shrink-0 rounded-2xl border px-3.5 py-2.5 text-left transition ${
                active
                  ? "border-primary bg-primary/10 shadow-sm"
                  : done
                    ? "border-primary/30 bg-primary/5"
                    : "border-neutral-200 bg-neutral-50 opacity-70"
              } ${clickable ? "cursor-pointer active:scale-[0.98]" : "cursor-default"}`}
              aria-current={active ? "step" : undefined}
            >
              <span
                className={`block text-[10px] font-bold uppercase tracking-wider ${
                  active ? "text-primary" : done ? "text-primary/70" : "text-neutral-400"
                }`}
              >
                {s.label}
              </span>
              <span className={`mt-0.5 block text-xs font-semibold ${active ? "text-neutral-900" : "text-neutral-600"}`}>
                {s.hint}
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="mt-3 flex gap-1">
        {steps.map((s) => (
          <motion.div
            key={`bar-${s.id}`}
            className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-200"
            layout
          >
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={false}
              animate={{ width: s.id <= current ? "100%" : "0%" }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
