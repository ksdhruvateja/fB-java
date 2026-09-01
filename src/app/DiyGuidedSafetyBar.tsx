import { DIY_GREEN_PRO_OPTION, DIY_GUIDED_SAFETY_REMINDER } from "./diySafetyCopy";

export default function DiyGuidedSafetyBar({ onGetProfessional }: { onGetProfessional: () => void }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <p className="min-w-0 flex-1 leading-relaxed">{DIY_GUIDED_SAFETY_REMINDER}</p>
        <button
          type="button"
          onClick={onGetProfessional}
          className="shrink-0 rounded-lg border border-primary px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5"
        >
          Get a Professional
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {DIY_GREEN_PRO_OPTION}{" "}
        <button type="button" onClick={onGetProfessional} className="font-semibold text-primary hover:underline">
          Request a Professional
        </button>
      </p>
    </div>
  );
}
