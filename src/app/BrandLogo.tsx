import { brand } from "../config/brand";

export type BrandLogoVariant = "nav" | "footer" | "hero" | "auth" | "mark";

/**
 * Full-color FixBridge logo assets (transparent PNG).
 * - mark: FB icon only
 * - nav / auth: icon + FixBridge wordmark (no tagline)
 * - footer / hero: full lockup with tagline
 */
const VARIANT: Record<
  BrandLogoVariant,
  { src: "mark" | "lockup" | "full"; className: string }
> = {
  mark: {
    src: "mark",
    className: "h-9 w-9 sm:h-10 sm:w-10",
  },
  nav: {
    src: "lockup",
    className: "h-9 w-auto max-h-9 md:h-10 md:max-h-10 max-w-[10.5rem] md:max-w-[12rem]",
  },
  auth: {
    src: "lockup",
    className: "h-8 w-auto max-h-8 sm:h-9 sm:max-h-9 max-w-[9.5rem] sm:max-w-[11rem]",
  },
  footer: {
    src: "lockup",
    className:
      "h-[3.25rem] w-auto max-h-[3.25rem] max-w-[11rem] sm:h-[3.75rem] sm:max-w-[13rem] md:h-[4.25rem] md:max-w-[15rem]",
  },
  hero: {
    src: "full",
    className:
      "h-auto w-auto max-h-[min(22vh,12.5rem)] max-w-[min(88vw,16rem)] sm:max-w-[18rem] md:max-w-[22rem] lg:max-w-[26rem]",
  },
};

function logoSrc(kind: "mark" | "lockup" | "full") {
  if (kind === "mark") return brand.logoMarkUrl;
  if (kind === "lockup") return brand.logoLockupUrl;
  return brand.logoUrl;
}

/** Full-color FixBridge logo — preserves silver/orange wordmark from brand assets. */
export function BrandLogo({
  variant = "nav",
  tone: _tone = "auto",
  className = "",
  showName: _showName,
}: {
  variant?: BrandLogoVariant;
  /** @deprecated Color logo ignores tone; kept for call-site compatibility. */
  tone?: "white" | "black" | "auto";
  className?: string;
  /** @deprecated Wordmark is baked into lockup/full assets. */
  showName?: boolean;
}) {
  const cfg = VARIANT[variant];
  const src = logoSrc(cfg.src);

  return (
    <img
      src={src}
      alt={brand.productName}
      className={`block object-contain object-left select-none pointer-events-none ${cfg.className} ${className}`}
      draggable={false}
      decoding="async"
    />
  );
}
