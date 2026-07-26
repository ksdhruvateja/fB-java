/** Central product branding — change here to rename the platform. */
export const brand = {
  productName: "FixBridge",
  legalName: "FixBridge",
  supportEmail: "support@fixbridge.example",
  tagline: "AI-powered property care and service coordination",
  primaryColor: "#FF4D1C",
  domain: "localhost:5000",
} as const;

export type BrandConfig = typeof brand;
