import { useEffect, useId, useRef } from "react";
import { Loader2, Lock, Sparkles, X } from "lucide-react";
import { proFeatureCopy, trackProFeatureEvent, type ProFeatureId } from "./proFeatures";

export default function UpgradeToProModal({
  open,
  feature,
  source,
  busy,
  onClose,
  onUpgrade,
}: {
  open: boolean;
  feature: ProFeatureId;
  source?: string;
  busy?: boolean;
  onClose: () => void;
  onUpgrade: () => void | Promise<void>;
}) {
  const titleId = useId();
  const descId = useId();
  const upgradeRef = useRef<HTMLButtonElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const copy = proFeatureCopy(feature);

  useEffect(() => {
    if (!open) return;
    lastFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    trackProFeatureEvent("pro_upgrade_modal_viewed", { feature, source });
    const t = window.setTimeout(() => upgradeRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, feature, source]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    lastFocusRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative z-[1] max-h-[min(92vh,640px)] w-full max-w-md overflow-y-auto rounded-t-[1.5rem] border border-border bg-card p-6 shadow-xl sm:rounded-[1.5rem]"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 text-[#4A90D9]">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#4A90D9]/10">
            <Lock className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.14em]">HomeCare Pro</span>
        </div>

        <h2 id={titleId} className="mt-4 pr-8 text-xl font-bold tracking-tight text-foreground">
          {copy.title}
        </h2>
        <p id={descId} className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {copy.benefit}
        </p>

        <div className="mt-5 rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <p className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#FF4D1C]" aria-hidden />
            FixBridge Free still includes AI assessment, service requests, quotes, and basic home profile.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            ref={upgradeRef}
            type="button"
            disabled={busy}
            onClick={() => {
              trackProFeatureEvent("pro_upgrade_clicked", { feature, source });
              trackProFeatureEvent("pro_checkout_started", { feature, source });
              void onUpgrade();
            }}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Upgrade to HomeCare Pro
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}
