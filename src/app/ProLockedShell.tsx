import { Lock, Sparkles } from "lucide-react";
import LockedProBadge from "./LockedProBadge";
import { proFeatureCopy, type ProFeatureId } from "./proFeatures";

export default function ProLockedShell({
  feature,
  onUnlock,
}: {
  feature: ProFeatureId;
  onUnlock: () => void;
}) {
  const copy = proFeatureCopy(feature);
  return (
    <section className="mx-auto max-w-2xl rounded-[1.5rem] border border-dashed border-[#4A90D9]/35 bg-gradient-to-br from-[#f5f9ff] via-card to-card px-6 py-10 text-center dark:from-[#142033]">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4A90D9]/10 text-[#4A90D9]">
        <Lock className="h-5 w-5" aria-hidden />
      </div>
      <div className="mt-4 flex justify-center">
        <LockedProBadge />
      </div>
      <h2 className="mt-3 text-xl font-bold tracking-tight">{copy.title.replace(/^Unlock /, "")}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{copy.benefit}</p>
      <button
        type="button"
        onClick={onUnlock}
        className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#FF4D1C] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105"
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        Upgrade to HomeCare Pro
      </button>
    </section>
  );
}
