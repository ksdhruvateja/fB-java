import { useState } from "react";
import { Star } from "lucide-react";

type Tone = "coral" | "gold" | "white";

const FILL: Record<Tone, string> = {
  coral: "#FF4D1C",
  gold: "#FBBF24",
  white: "#FFFFFF",
};

const TEXT: Record<Tone, string> = {
  coral: "text-[#FF4D1C]",
  gold: "text-amber-400",
  white: "text-white",
};

const EMPTY: Record<Tone, string> = {
  coral: "text-muted-foreground/30",
  gold: "text-muted-foreground/30",
  white: "text-white/35",
};

/** Display or pick 1–5 stars; supports fractional fill for averages (e.g. 4.6). */
export function StarRating({
  value,
  onChange,
  size = 16,
  interactive = false,
  tone = "coral",
  className = "",
  label = "Rating",
}: {
  value: number;
  onChange?: (n: number) => void;
  size?: number;
  interactive?: boolean;
  tone?: Tone;
  className?: string;
  label?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const safe = Number.isFinite(value) ? Math.min(5, Math.max(0, value)) : 0;
  const shown = interactive && hover != null ? hover : safe;
  const fillColor = FILL[tone];

  return (
    <div
      className={`inline-flex items-center gap-0.5 ${className}`}
      role={interactive ? "radiogroup" : "img"}
      aria-label={interactive ? label : `${safe.toFixed(1)} out of 5 stars`}
      onMouseLeave={() => interactive && setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const fillPct = Math.max(0, Math.min(1, shown - (n - 1))) * 100;
        const selected = interactive && Math.round(safe) === n;

        if (!interactive) {
          return (
            <span key={n} className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
              <Star size={size} className={`absolute inset-0 ${EMPTY[tone]}`} fill="transparent" />
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fillPct}%` }}
              >
                <Star size={size} className={TEXT[tone]} fill={fillColor} />
              </span>
            </span>
          );
        }

        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onClick={() => onChange?.(n)}
            className="relative p-0.5 rounded-sm transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span className="relative inline-flex" style={{ width: size, height: size }}>
              <Star size={size} className={`absolute inset-0 ${EMPTY[tone]}`} fill="transparent" />
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fillPct}%` }}>
                <Star size={size} className={TEXT[tone]} fill={fillColor} />
              </span>
            </span>
          </button>
        );
      })}
      {interactive && (
        <span className="ml-2 font-mono text-[11px] tracking-wide text-muted-foreground tabular-nums">
          {Math.round(shown)}/5
        </span>
      )}
    </div>
  );
}

const MAX_REVIEW_IMAGES = 4;
const MAX_IMAGE_EDGE = 1280;
const JPEG_QUALITY = 0.72;

/** Resize/compress an image file to a JPEG data URL for review uploads. */
export async function fileToReviewImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (JPG, PNG, or WebP).");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Each image must be under 8 MB.");
  }

  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not load that image."));
    el.src = raw;
  });

  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image.");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export { MAX_REVIEW_IMAGES };
