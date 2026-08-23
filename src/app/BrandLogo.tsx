import { brand } from "../config/brand";

export type BrandLogoVariant = "nav" | "footer" | "hero" | "auth" | "mark";

/**
 * Nav/auth use the gear mark (readable at small sizes) + product name.
 * Hero/footer use the full lockup with fluid sizing for phone → laptop.
 */
const VARIANT: Record<
  BrandLogoVariant,
  { src: "mark" | "full"; className: string; showName: boolean; nameClass: string }
> = {
  mark: {
    src: "mark",
    className: "h-9 w-9 sm:h-10 sm:w-10",
    showName: false,
    nameClass: "",
  },
  nav: {
    src: "mark",
    className: "h-9 w-9 md:h-10 md:w-10",
    showName: true,
    nameClass: "text-base md:text-lg",
  },
  auth: {
    src: "mark",
    className: "h-8 w-8 sm:h-9 sm:w-9",
    showName: true,
    nameClass: "text-base sm:text-lg",
  },
  footer: {
    src: "full",
    className: "h-[4.5rem] w-auto max-h-[4.5rem] max-w-[9rem] sm:h-[5.25rem] sm:max-w-[11rem] md:h-24 md:max-w-[13rem]",
    showName: false,
    nameClass: "",
  },
  hero: {
    src: "full",
    className:
      "h-[6.5rem] w-auto max-w-[min(42vw,9.5rem)] sm:h-[8.5rem] sm:max-w-[12rem] md:h-[10.5rem] md:max-w-[15rem] lg:h-48 lg:max-w-[17rem]",
    showName: false,
    nameClass: "",
  },
};

/** Monochrome FixBridge logo — white, black, or auto (follows light/dark theme). */
export function BrandLogo({
  variant = "nav",
  tone = "white",
  className = "",
  showName,
}: {
  variant?: BrandLogoVariant;
  tone?: "white" | "black" | "auto";
  className?: string;
  /** Override whether the product name appears next to the mark. */
  showName?: boolean;
}) {
  const cfg = VARIANT[variant];
  const src = cfg.src === "mark" ? brand.logoMarkUrl : brand.logoUrl;
  const mono =
    tone === "auto"
      ? "brightness-0 dark:invert"
      : tone === "white"
        ? "brightness-0 invert"
        : "brightness-0";
  const withName = showName ?? cfg.showName;
  const nameTone =
    tone === "auto"
      ? "text-foreground"
      : tone === "white"
        ? "text-white"
        : "text-black";

  const mark = (
    <img
      src={src}
      alt={withName ? "" : brand.productName}
      className={`block object-contain select-none pointer-events-none ${mono} ${cfg.className} ${withName ? "" : className}`}
      draggable={false}
      decoding="async"
      aria-hidden={withName ? true : undefined}
    />
  );

  if (!withName) return mark;

  return (
    <span
      className={`inline-flex items-center gap-2.5 min-w-0 ${className}`}
      role="img"
      aria-label={brand.productName}
    >
      {mark}
      <span
        className={`[font-family:'Barlow_Condensed',sans-serif] font-black uppercase tracking-wide leading-none truncate ${nameTone} ${cfg.nameClass}`}
      >
        {brand.productName}
      </span>
    </span>
  );
}
