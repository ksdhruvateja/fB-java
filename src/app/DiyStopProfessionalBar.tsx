import { DIY_STOP_PROFESSIONAL_LABEL } from "./diySafetyCopy";

export default function DiyStopProfessionalBar({
  onStop,
  onGetProfessional,
  compact,
}: {
  onStop: () => void;
  onGetProfessional: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border border-border bg-card/95 sm:flex-row sm:items-center sm:justify-between ${
        compact ? "p-2.5" : "p-3"
      }`}
    >
      <p className="text-xs leading-relaxed text-muted-foreground sm:max-w-[55%]">
        Prefer professional help? You can stop DIY at any time.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onStop}
          className="inline-flex items-center justify-center rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-900 dark:text-amber-100"
        >
          {DIY_STOP_PROFESSIONAL_LABEL}
        </button>
        <button
          type="button"
          onClick={onGetProfessional}
          className="inline-flex items-center justify-center rounded-lg border border-primary px-3 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/5"
        >
          Request a Professional
        </button>
      </div>
    </div>
  );
}
