import { useEffect, useRef } from "react";
import { ArrowLeft, Camera, ClipboardCheck, House, ShieldCheck, Sparkles, X } from "lucide-react";

const BENEFITS = [
  {
    icon: Camera,
    title: "AI-powered diagnostics",
    body: "Fixera reviews your photos and description to identify visible signs and the likely cause of the problem.",
  },
  {
    icon: ClipboardCheck,
    title: "Personalized repair guidance",
    body: "Step-by-step instructions, the tools and parts you may need, and an approximate DIY parts cost.",
  },
  {
    icon: ShieldCheck,
    title: "Safety-checked DIY recommendations",
    body: "Each repair is checked for its actual risk, and Fixera tells you when it is better to stop and hire a professional.",
  },
  {
    icon: House,
    title: "Property-specific insights",
    body: "Assessments use your Property Passport and repair history, and repairs add follow-up maintenance reminders.",
  },
];

/**
 * Shown when a homeowner without HomeCare Pro chooses "Get AI assessment". No assessment is
 * started and nothing is charged from here; upgrading opens the existing HomeCare plans page.
 */
export default function HomeCareUpgradePrompt({
  open,
  onUpgrade,
  onClose,
  onHirePro,
}: {
  open: boolean;
  onUpgrade: () => void;
  onClose: () => void;
  onHirePro?: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="homecare-upgrade-title"
        className="max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
      >
        <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-[#FF4D1C] to-[#FF8A3D] px-5 pb-5 pt-6 text-white sm:px-6">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 rounded-full p-1.5 text-white/85 hover:bg-white/15 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> HomeCare Pro
          </span>
          <h2
            id="homecare-upgrade-title"
            className="mt-3 [font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase leading-[0.95] tracking-tight"
          >
            Fixera AI assessment is part of HomeCare Pro
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/90">
            Upgrade to get an instant assessment of this repair. Your description and photos stay in this request.
          </p>
        </div>

        <ul className="grid gap-3 px-5 py-5 sm:px-6">
          {BENEFITS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FF4D1C]/10 text-[#FF4D1C]">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">{title}</span>
                <span className="block text-sm leading-relaxed text-muted-foreground">{body}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="border-t border-border px-5 py-4 sm:px-6">
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            AI guidance is informational and is not a professional inspection. You can still hire a verified professional
            for this request without a subscription.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back to my request
            </button>
            {onHirePro ? (
              <button
                type="button"
                onClick={onHirePro}
                className="inline-flex min-h-11 items-center justify-center rounded-md border-2 border-[#FF4D1C] px-4 text-sm font-medium text-[#FF4D1C]"
              >
                Hire a Professional
              </button>
            ) : null}
            <button
              type="button"
              onClick={onUpgrade}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#FF4D1C] px-4 text-sm font-semibold text-white hover:bg-[#e84416]"
            >
              <Sparkles className="h-4 w-4" aria-hidden /> See HomeCare Pro plans
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
