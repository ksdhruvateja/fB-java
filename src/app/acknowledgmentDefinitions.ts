import type { AcceptanceType, LegalDocumentKey } from "./legalDocuments";

export type AcknowledgmentDefinition = {
  acceptanceType: AcceptanceType;
  label: string;
  documentKey?: LegalDocumentKey;
  documentLabel?: string;
};

export const ACKNOWLEDGMENT_DEFINITIONS: Record<AcceptanceType, AcknowledgmentDefinition> = {
  ACCOUNT_TERMS: {
    acceptanceType: "ACCOUNT_TERMS",
    label: "I agree to the FixBridge Terms of Service.",
    documentKey: "HOMEOWNER_TERMS",
    documentLabel: "Terms of Service",
  },
  PRIVACY_POLICY: {
    acceptanceType: "PRIVACY_POLICY",
    label: "I agree to the FixBridge Privacy Policy.",
    documentKey: "PRIVACY_POLICY",
    documentLabel: "Privacy Policy",
  },
  DIY_SAFETY: {
    acceptanceType: "DIY_SAFETY",
    label: "I understand AI-guided DIY is informational only and I am responsible for safety on site.",
    documentKey: "DIY_SAFETY_DISCLAIMER",
    documentLabel: "AI / DIY Safety Disclaimer",
  },
  PROFESSIONAL_DISPATCH_PROVIDER_ACK: {
    acceptanceType: "PROFESSIONAL_DISPATCH_PROVIDER_ACK",
    label:
      "I understand the service professional is an independent provider responsible for on-site work, safety, workmanship, tools and personnel.",
  },
  PROFESSIONAL_DISPATCH_FIXBRIDGE_ACK: {
    acceptanceType: "PROFESSIONAL_DISPATCH_FIXBRIDGE_ACK",
    label:
      "I understand FixBridge coordinates the request/payment workflow and does not guarantee the provider's work or AI diagnosis.",
  },
  VISIT_FEE_ACK: {
    acceptanceType: "VISIT_FEE_ACK",
    label:
      "I understand the visit/diagnostic fee shown is separate from repair work; additional work needs my approval.",
  },
  HOMEOWNER_SERVICE_AGREEMENT: {
    acceptanceType: "HOMEOWNER_SERVICE_AGREEMENT",
    label: "I agree to the Homeowner Service Agreement.",
    documentKey: "HOMEOWNER_SERVICE_AGREEMENT",
    documentLabel: "Homeowner Agreement",
  },
  VISIT_CANCELLATION_POLICY: {
    acceptanceType: "VISIT_CANCELLATION_POLICY",
    label: "I agree to the Visit/Cancellation Policy.",
    documentKey: "VISIT_CANCELLATION_POLICY",
    documentLabel: "Visit/Cancellation Policy",
  },
  QUOTE_SCOPE_APPROVAL: {
    acceptanceType: "QUOTE_SCOPE_APPROVAL",
    label: "I approve the quoted scope and total for this repair.",
  },
  CHANGE_ORDER_APPROVAL: {
    acceptanceType: "CHANGE_ORDER_APPROVAL",
    label: "I approve this additional scope and price.",
  },
  PAYMENT_AUTHORIZATION: {
    acceptanceType: "PAYMENT_AUTHORIZATION",
    label: "I authorize the payment amount shown under the stated cancellation/refund rules.",
    documentKey: "PAYMENT_VISIT_POLICY",
    documentLabel: "Payment / Visit Policy",
  },
  PAYMENT_VISIT_POLICY: {
    acceptanceType: "PAYMENT_VISIT_POLICY",
    label: "I agree to the Payment / Visit Policy.",
    documentKey: "PAYMENT_VISIT_POLICY",
    documentLabel: "Payment / Visit Policy",
  },
  MARKETING_SMS_EMAIL: {
    acceptanceType: "MARKETING_SMS_EMAIL",
    label: "I agree to receive marketing communications from FixBridge.",
    documentKey: "MARKETING_CONSENT",
    documentLabel: "Marketing Communications",
  },
};

export function definitionForType(type: AcceptanceType): AcknowledgmentDefinition {
  return (
    ACKNOWLEDGMENT_DEFINITIONS[type] || {
      acceptanceType: type,
      label: `I acknowledge: ${type.replace(/_/g, " ").toLowerCase()}.`,
    }
  );
}
