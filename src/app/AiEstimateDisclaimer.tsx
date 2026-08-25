/** Shown under AI market estimates — not binding quotes. */
export default function AiEstimateDisclaimer({ compact }: { compact?: boolean }) {
  return (
    <p
      className={`leading-relaxed text-muted-foreground ${
        compact ? "text-[10px]" : "text-[11px]"
      }`}
    >
      <span className="font-medium text-foreground/80">Market estimate only — not a final bill.</span>{" "}
      This range reflects typical local pricing for your area based on your photos and description. Your actual price will be
      confirmed after a licensed contractor reviews the job and inspects on site if needed.
    </p>
  );
}
