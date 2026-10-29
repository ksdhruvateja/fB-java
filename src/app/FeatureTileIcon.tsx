import type { LucideIcon } from "lucide-react";

export type FeatureTileTone = "coral" | "ink" | "steel" | "sand";

const TONE_CLASS: Record<FeatureTileTone, string> = {
  coral: "bg-primary/10 text-primary ring-primary/25",
  ink: "bg-foreground/[0.06] text-foreground ring-border/80",
  steel: "bg-muted text-foreground ring-border",
  sand: "bg-background text-primary ring-border/80 shadow-sm",
};

/** Flat feature glyph — cleaner than extruded 3D blocks on marketing grids. */
export function FeatureTileIcon({
  icon: Icon,
  tone = "coral",
  size = "md",
  className = "",
}: {
  icon: LucideIcon;
  tone?: FeatureTileTone;
  size?: "sm" | "md";
  className?: string;
}) {
  const box = size === "sm" ? "h-10 w-10 rounded-lg" : "h-11 w-11 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl";
  const glyph = size === "sm" ? "h-4 w-4" : "h-5 w-5 sm:h-6 sm:w-6";

  return (
    <div
      className={`flex items-center justify-center ring-1 ${box} ${TONE_CLASS[tone]} ${className}`}
      aria-hidden
    >
      <Icon className={glyph} strokeWidth={1.75} />
    </div>
  );
}
