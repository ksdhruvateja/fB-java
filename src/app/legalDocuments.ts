export type LegalDocumentKey =
  | "HOMEOWNER_TERMS"
  | "PRIVACY_POLICY"
  | "DIY_SAFETY_DISCLAIMER"
  | "HOMEOWNER_SERVICE_AGREEMENT"
  | "VISIT_CANCELLATION_POLICY"
  | "PAYMENT_VISIT_POLICY"
  | "MARKETING_CONSENT"
  | "HOMEOWNER_PROFESSIONAL_REQUEST_BETA"
  | "CONTRACTOR_AGREEMENT"
  | "MANAGED_ADDENDUM"
  | "INSURANCE_REQUIREMENTS"
  | "SOLO_OWNER_ACKNOWLEDGMENT";

export const LEGAL_ROUTES: Record<LegalDocumentKey, string> = {
  HOMEOWNER_TERMS: "/legal/terms",
  PRIVACY_POLICY: "/legal/privacy",
  DIY_SAFETY_DISCLAIMER: "/legal/diy-safety",
  HOMEOWNER_SERVICE_AGREEMENT: "/legal/homeowner-service-agreement",
  VISIT_CANCELLATION_POLICY: "/legal/visit-cancellation",
  PAYMENT_VISIT_POLICY: "/legal/payment-visit-policy",
  MARKETING_CONSENT: "/legal/marketing-consent",
  HOMEOWNER_PROFESSIONAL_REQUEST_BETA: "/legal/professional-request-beta",
  CONTRACTOR_AGREEMENT: "/legal/contractor-agreement",
  MANAGED_ADDENDUM: "/legal/managed-addendum",
  INSURANCE_REQUIREMENTS: "/legal/insurance-requirements",
  SOLO_OWNER_ACKNOWLEDGMENT: "/legal/solo-owner-acknowledgment",
};

/** URL slug (path after /legal/) → document key */
export const LEGAL_SLUG_TO_KEY: Record<string, LegalDocumentKey> = {
  terms: "HOMEOWNER_TERMS",
  "homeowner-terms": "HOMEOWNER_TERMS",
  privacy: "PRIVACY_POLICY",
  "privacy-policy": "PRIVACY_POLICY",
  "diy-safety": "DIY_SAFETY_DISCLAIMER",
  "homeowner-service-agreement": "HOMEOWNER_SERVICE_AGREEMENT",
  "visit-cancellation": "VISIT_CANCELLATION_POLICY",
  "payment-visit-policy": "PAYMENT_VISIT_POLICY",
  "marketing-consent": "MARKETING_CONSENT",
  "professional-request-beta": "HOMEOWNER_PROFESSIONAL_REQUEST_BETA",
  "contractor-agreement": "CONTRACTOR_AGREEMENT",
  "managed-addendum": "MANAGED_ADDENDUM",
  "insurance-requirements": "INSURANCE_REQUIREMENTS",
  "solo-owner-acknowledgment": "SOLO_OWNER_ACKNOWLEDGMENT",
};

export const PUBLIC_FOOTER_LEGAL_LINKS: { href: string; label: string }[] = [
  { href: LEGAL_ROUTES.HOMEOWNER_TERMS, label: "Terms" },
  { href: LEGAL_ROUTES.PRIVACY_POLICY, label: "Privacy" },
  { href: LEGAL_ROUTES.HOMEOWNER_SERVICE_AGREEMENT, label: "Homeowner Service Agreement" },
  { href: LEGAL_ROUTES.DIY_SAFETY_DISCLAIMER, label: "AI / DIY Safety" },
  { href: LEGAL_ROUTES.VISIT_CANCELLATION_POLICY, label: "Visit / Cancellation Policy" },
];

/** Contractor-facing legal documents (public hub + onboarding). */
export const PUBLIC_CONTRACTOR_LEGAL_LINKS: { href: string; label: string; pdfHref?: string }[] = [
  {
    href: LEGAL_ROUTES.CONTRACTOR_AGREEMENT,
    label: "FixBridge Contractor Agreement Package v4",
    pdfHref: "/documents/fixbridge-contractor-agreement-package-v4.pdf",
  },
  { href: LEGAL_ROUTES.MANAGED_ADDENDUM, label: "Managed Services Addendum" },
  {
    href: LEGAL_ROUTES.INSURANCE_REQUIREMENTS,
    label: "FixBridge Insurance Requirements / Sample COI",
    pdfHref: "/documents/fixbridge-insurance-requirements.pdf",
  },
  { href: LEGAL_ROUTES.SOLO_OWNER_ACKNOWLEDGMENT, label: "Solo Owner / No Employees Acknowledgment" },
];

export const CONTRACTOR_APPLICATION_DOCUMENTS: {
  key?: LegalDocumentKey;
  label: string;
  externalHref?: string;
}[] = [
  { key: "CONTRACTOR_AGREEMENT", label: "FixBridge Contractor Agreement Package v4" },
  { key: "MANAGED_ADDENDUM", label: "Managed Services Addendum" },
  { key: "INSURANCE_REQUIREMENTS", label: "FixBridge Insurance Requirements" },
  { key: "SOLO_OWNER_ACKNOWLEDGMENT", label: "Solo Owner / No Employees Acknowledgment" },
  { label: "W-9", externalHref: "https://www.irs.gov/forms-pubs/about-form-w-9" },
];

export type AcceptanceType =
  | "ACCOUNT_TERMS"
  | "PRIVACY_POLICY"
  | "DIY_SAFETY"
  | "DIY_SAFETY_ABILITY_ACK"
  | "PROFESSIONAL_DISPATCH_PROVIDER_ACK"
  | "PROFESSIONAL_DISPATCH_FIXBRIDGE_ACK"
  | "VISIT_FEE_ACK"
  | "PROFESSIONAL_REQUEST_BETA_ACK"
  | "HOMEOWNER_SERVICE_AGREEMENT"
  | "VISIT_CANCELLATION_POLICY"
  | "QUOTE_SCOPE_APPROVAL"
  | "CHANGE_ORDER_APPROVAL"
  | "PAYMENT_AUTHORIZATION"
  | "PAYMENT_VISIT_POLICY"
  | "MARKETING_SMS_EMAIL";

export type ConsentMap = Partial<Record<AcceptanceType, boolean>>;

export function buildConsentsPayload(consents: ConsentMap) {
  return { consents };
}

export function legalKeyFromPath(pathname: string): LegalDocumentKey | null {
  const slug = pathname.replace(/^\/legal\/?/, "").replace(/\/+$/, "").toLowerCase();
  if (!slug) return null;
  return LEGAL_SLUG_TO_KEY[slug] || null;
}

export function formatLegalDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function formatUtcTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}
