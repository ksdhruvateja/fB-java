import { Loader2, Sparkles } from "lucide-react";

export default function FixeraAnalysisExperience({
  mediaUrl,
  mediaType,
  category,
  description,
}: {
  mediaUrl?: string | null;
  mediaType?: string | null;
  category?: string | null;
  description?: string | null;
}) {
  const isVideo = String(mediaType || "").startsWith("video");
  const hasSubmittedDetails = Boolean(category?.trim() || description?.trim() || mediaUrl);

  return (
    <section className="fixera-shell space-y-3 p-3 sm:p-4" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--fixbridge-orange)] text-white" aria-hidden>
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fixbridge-orange)]">Fixera</p>
          <h2 className="truncate text-base font-semibold">Analyzing your repair</h2>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--fixbridge-orange)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          In progress
        </span>
      </div>

      <div className="fixera-buffer" role="progressbar" aria-label="Fixera analysis in progress" />

      <div className="grid grid-cols-[88px_minmax(0,1fr)] items-stretch gap-2 sm:grid-cols-[112px_minmax(0,1fr)]">
        <div className="fixera-card relative min-h-[88px] overflow-hidden">
          {mediaUrl ? (
            isVideo ? (
              <video src={mediaUrl} className="h-full min-h-[88px] w-full object-cover" muted playsInline />
            ) : (
              <img src={mediaUrl} alt="" className="h-full min-h-[88px] w-full object-cover" />
            )
          ) : (
            <div className="flex h-full min-h-[88px] items-center justify-center px-2 text-center text-xs text-[var(--fixbridge-muted-text)]">
              Repair details
            </div>
          )}
        </div>
        <div className="fixera-card flex min-w-0 flex-col justify-center p-3">
          <p className="text-xs font-semibold">Submitted information</p>
          {category?.trim() ? <p className="mt-1 text-xs text-[var(--fixbridge-muted-text)]">Category: {category.trim()}</p> : null}
          {description?.trim() ? (
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-[var(--fixbridge-muted-text)]">{description.trim()}</p>
          ) : null}
          {!hasSubmittedDetails ? (
            <p className="mt-1 text-xs text-[var(--fixbridge-muted-text)]">Your saved repair case is being analyzed.</p>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-[var(--fixbridge-muted-text)]">Your assessment will appear here when processing completes.</p>
    </section>
  );
}