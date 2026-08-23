/** Central product branding — keep in sync with src/config/brand.ts */
export const brand = {
  productName: process.env.BRAND_PRODUCT_NAME?.trim() || 'FixBridge',
  legalName: process.env.BRAND_LEGAL_NAME?.trim() || 'FixBridge',
  supportEmail: process.env.BRAND_SUPPORT_EMAIL?.trim() || 'support@fixbridge.example',
  tagline: process.env.BRAND_TAGLINE?.trim() || 'AI-powered property care and service coordination',
  primaryColor: process.env.BRAND_PRIMARY_COLOR?.trim() || '#FF4D1C',
  domain: process.env.APP_URL?.trim() || process.env.BRAND_DOMAIN?.trim() || 'http://localhost:5000',
};
