/** Central product branding — override with VITE_BRAND_* env vars. */
const _env = import.meta.env as Record<string, string | undefined>;

export const brand = {
  productName: _env.VITE_BRAND_NAME?.trim() || "FixBridge",
  legalName: _env.VITE_BRAND_LEGAL_NAME?.trim() || "FixBridge",
  supportEmail: _env.VITE_BRAND_SUPPORT_EMAIL?.trim() || "support@fixbridge.example",
  tagline: _env.VITE_BRAND_TAGLINE?.trim() || "AI-powered property care and service coordination",
  primaryColor: _env.VITE_BRAND_PRIMARY_COLOR?.trim() || "#FF4D1C",
  logoUrl: _env.VITE_BRAND_LOGO_URL?.trim() || "/fixbridge-logo.png",
  logoLockupUrl: _env.VITE_BRAND_LOGO_LOCKUP_URL?.trim() || "/fixbridge-logo-lockup.png",
  logoMarkUrl: _env.VITE_BRAND_LOGO_MARK_URL?.trim() || "/fixbridge-mark.png",
  /** Black lockup for marketing nav when scrolled over light content */
  logoLockupBlackUrl: _env.VITE_BRAND_LOGO_LOCKUP_BLACK_URL?.trim() || "/fixbridge-logo-lockup-black.png",
  /** Absolute site URL for Open Graph (e.g. https://fixbridge.com). Falls back to window origin in the client. */
  siteUrl: _env.VITE_SITE_URL?.trim() || "",
  domain: typeof window !== "undefined" ? window.location.host : "localhost:5000",
} as const;

export type BrandConfig = typeof brand;
