import { useState } from "react";
import { Loader2 } from "lucide-react";
import { submitDiySafetyFeedback, type DiySafetyFeedbackRating } from "./diySafetyApi";

export default function DiySafetyFeedback({
  jobId,
  riskLevel,
  messageIndex,
  chatExcerpt,
  onUnsafe,
}: {
  jobId?: number;
  riskLevel?: string;
  messageIndex: number;
  chatExcerpt?: string;
  onUnsafe?: () => void;
}) {
  const [busy, setBusy] = useState<DiySafetyFeedbackRating | null>(null);
  const [done, setDone] = useState<DiySafetyFeedbackRating | null>(null);

  async function send(rating: DiySafetyFeedbackRating) {
    if (busy || done) return;
    setBusy(rating);
    const r = await submitDiySafetyFeedback({
      jobId,
      rating,
      riskLevel,
      messageIndex,
      chatExcerpt: chatExcerpt?.slice(0, 300),
    });
    setBusy(null);
    if (r.ok) {
      setDone(rating);
      if (rating === "unsafe") onUnsafe?.();
    }
  }

  if (done) {
    return (
      <p className="mt-1 text-[10px] text-muted-foreground">
        {done === "unsafe"
          ? "Thanks — we take safety reports seriously. Professional help is available."
          : "Thanks for your feedback."}
      </p>
    );
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground">Was this helpful?</span>
      {(["helpful", "not_helpful", "unsafe"] as const).map((rating) => (
        <button
          key={rating}
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void send(rating)}
          className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${
            rating === "unsafe"
              ? "border-red-500/40 text-red-700 dark:text-red-300"
              : "border-border text-muted-foreground hover:bg-muted/50"
          }`}
        >
          {busy === rating ? <Loader2 className="inline h-3 w-3 animate-spin" /> : null}
          {rating === "helpful" ? "Helpful" : rating === "not_helpful" ? "Not Helpful" : "This advice seems unsafe"}
        </button>
      ))}
    </div>
  );
}
