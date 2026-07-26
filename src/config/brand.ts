/** Central product branding — override with VITE_BRAND_* env vars. */
const _env = import.meta.env as Record<string, string | undefined>;

export const brand = {
  productName: _env.VITE_BRAND_NAME?.trim() || "FixBridge",
  legalName: _env.VITE_BRAND_LEGAL_NAME?.trim() || "FixBridge",
  supportEmail: _env.VITE_BRAND_SUPPORT_EMAIL?.trim() || "support@fixbridge.example",
  tagline: _env.VITE_BRAND_TAGLINE?.trim() || "AI-powered property care and service coordination",
  primaryColor: _env.VITE_BRAND_PRIMARY_COLOR?.trim() || "#FF4D1C",
  domain: typeof window !== "undefined" ? window.location.host : "localhost:5000",
} as const;

export type BrandConfig = typeof brand;
