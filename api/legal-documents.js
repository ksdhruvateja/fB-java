/**
 * Canonical legal document registry — version identifiers must match stored acceptances.
 */

import { INSURANCE_REQUIREMENTS_CONTENT } from './insurance-requirements-content.js';

export const LEGAL_DOCUMENTS = {
  HOMEOWNER_TERMS: {
    key: 'HOMEOWNER_TERMS',
    title: 'FixBridge Terms of Service',
    version: '2026-08-30',
    route: '/legal/terms',
    acceptanceType: 'ACCOUNT_TERMS',
  },
  PRIVACY_POLICY: {
    key: 'PRIVACY_POLICY',
    title: 'Privacy Policy',
    version: '2026-08-30',
    route: '/legal/privacy',
    acceptanceType: 'PRIVACY_POLICY',
  },
  DIY_SAFETY_DISCLAIMER: {
    key: 'DIY_SAFETY_DISCLAIMER',
    title: 'AI / DIY Safety Disclaimer',
    version: '1.0',
    route: '/legal/diy-safety',
    acceptanceType: 'DIY_SAFETY',
  },
  HOMEOWNER_SERVICE_AGREEMENT: {
    key: 'HOMEOWNER_SERVICE_AGREEMENT',
    title: 'Homeowner Service Agreement',
    version: '1.0',
    route: '/legal/homeowner-service-agreement',
    acceptanceType: 'HOMEOWNER_SERVICE_AGREEMENT',
  },
  VISIT_CANCELLATION_POLICY: {
    key: 'VISIT_CANCELLATION_POLICY',
    title: 'Visit / Cancellation Policy',
    version: '1.0',
    route: '/legal/visit-cancellation',
    acceptanceType: 'VISIT_CANCELLATION_POLICY',
  },
  PAYMENT_VISIT_POLICY: {
    key: 'PAYMENT_VISIT_POLICY',
    title: 'Payment / Visit Policy',
    version: '1.0',
    route: '/legal/payment-visit-policy',
    acceptanceType: 'PAYMENT_VISIT_POLICY',
  },
  MARKETING_CONSENT: {
    key: 'MARKETING_CONSENT',
    title: 'Marketing Communications',
    version: '1.0',
    route: '/legal/marketing-consent',
    acceptanceType: 'MARKETING_SMS_EMAIL',
  },
  INSURANCE_REQUIREMENTS: {
    key: 'INSURANCE_REQUIREMENTS',
    title: 'FixBridge Insurance Requirements',
    version: '2.1',
    route: '/documents/fixbridge-insurance-requirements.pdf',
    acceptanceType: null,
    audience: 'contractor',
  },
};

/** Non-document acknowledgment types (no separate legal doc version). */
export const STANDALONE_ACCEPTANCE_TYPES = {
  PROFESSIONAL_DISPATCH_PROVIDER_ACK: {
    acceptanceType: 'PROFESSIONAL_DISPATCH_PROVIDER_ACK',
    title: 'Independent provider acknowledgment',
    version: '1.0',
  },
  PROFESSIONAL_DISPATCH_FIXBRIDGE_ACK: {
    acceptanceType: 'PROFESSIONAL_DISPATCH_FIXBRIDGE_ACK',
    title: 'FixBridge coordinator role acknowledgment',
    version: '1.0',
  },
  VISIT_FEE_ACK: {
    acceptanceType: 'VISIT_FEE_ACK',
    title: 'Visit/diagnostic fee acknowledgment',
    version: '1.0',
  },
  QUOTE_SCOPE_APPROVAL: {
    acceptanceType: 'QUOTE_SCOPE_APPROVAL',
    title: 'Quote scope and total approval',
    version: '1.0',
  },
  CHANGE_ORDER_APPROVAL: {
    acceptanceType: 'CHANGE_ORDER_APPROVAL',
    title: 'Change order approval',
    version: '1.0',
  },
  PAYMENT_AUTHORIZATION: {
    acceptanceType: 'PAYMENT_AUTHORIZATION',
    title: 'Payment authorization',
    version: '1.0',
  },
};

export const CONSENT_ACTIONS = {
  ACCOUNT_SIGNUP: {
    required: [
      { acceptanceType: 'ACCOUNT_TERMS', documentKey: 'HOMEOWNER_TERMS' },
      { acceptanceType: 'PRIVACY_POLICY', documentKey: 'PRIVACY_POLICY' },
    ],
    code: 'ACCOUNT_CONSENT_REQUIRED',
  },
  GUEST_SUBMIT: {
    required: [
      { acceptanceType: 'ACCOUNT_TERMS', documentKey: 'HOMEOWNER_TERMS' },
      { acceptanceType: 'PRIVACY_POLICY', documentKey: 'PRIVACY_POLICY' },
    ],
    code: 'GUEST_CONSENT_REQUIRED',
  },
  DIY_START: {
    required: [{ acceptanceType: 'DIY_SAFETY', documentKey: 'DIY_SAFETY_DISCLAIMER' }],
    code: 'DIY_CONSENT_REQUIRED',
  },
  PROFESSIONAL_DISPATCH: {
    required: [
      { acceptanceType: 'PROFESSIONAL_DISPATCH_PROVIDER_ACK' },
      { acceptanceType: 'PROFESSIONAL_DISPATCH_FIXBRIDGE_ACK' },
      { acceptanceType: 'VISIT_FEE_ACK' },
      { acceptanceType: 'HOMEOWNER_SERVICE_AGREEMENT', documentKey: 'HOMEOWNER_SERVICE_AGREEMENT' },
      { acceptanceType: 'VISIT_CANCELLATION_POLICY', documentKey: 'VISIT_CANCELLATION_POLICY' },
    ],
    code: 'HOMEOWNER_DISPATCH_CONSENT_REQUIRED',
  },
  QUOTE_APPROVAL: {
    required: [
      { acceptanceType: 'HOMEOWNER_SERVICE_AGREEMENT', documentKey: 'HOMEOWNER_SERVICE_AGREEMENT' },
      { acceptanceType: 'VISIT_CANCELLATION_POLICY', documentKey: 'VISIT_CANCELLATION_POLICY' },
      { acceptanceType: 'QUOTE_SCOPE_APPROVAL' },
    ],
    code: 'QUOTE_CONSENT_REQUIRED',
  },
  CHANGE_ORDER_APPROVAL: {
    required: [{ acceptanceType: 'CHANGE_ORDER_APPROVAL' }],
    code: 'CHANGE_ORDER_CONSENT_REQUIRED',
  },
  PAYMENT_AUTHORIZATION: {
    required: [
      { acceptanceType: 'PAYMENT_AUTHORIZATION' },
      { acceptanceType: 'PAYMENT_VISIT_POLICY', documentKey: 'PAYMENT_VISIT_POLICY' },
    ],
    code: 'PAYMENT_CONSENT_REQUIRED',
  },
};

export function getLegalDocument(key) {
  return LEGAL_DOCUMENTS[key] || null;
}

export function getDocumentForAcceptanceType(acceptanceType) {
  return Object.values(LEGAL_DOCUMENTS).find((d) => d.acceptanceType === acceptanceType) || null;
}

export function resolveAcceptanceMeta(acceptanceType) {
  const doc = getDocumentForAcceptanceType(acceptanceType);
  if (doc) {
    return {
      documentKey: doc.key,
      documentVersion: doc.version,
      documentTitle: doc.title,
    };
  }
  const standalone = STANDALONE_ACCEPTANCE_TYPES[acceptanceType];
  if (standalone) {
    return {
      documentKey: null,
      documentVersion: standalone.version,
      documentTitle: standalone.title,
    };
  }
  return {
    documentKey: null,
    documentVersion: '1.0',
    documentTitle: acceptanceType,
  };
}

export function listLegalDocumentsForClient() {
  return Object.values(LEGAL_DOCUMENTS).map((d) => ({
    key: d.key,
    title: d.title,
    version: d.version,
    route: d.route,
    acceptanceType: d.acceptanceType,
  }));
}

/** Short operational summaries — not legal advice. */
export const LEGAL_DOCUMENT_CONTENT = {
  HOMEOWNER_TERMS: {
    heading: 'FixBridge Terms of Service',
    sections: [
      { title: 'Service', body: 'FixBridge coordinates homeowner service requests, payments, and provider matching. Contractors are independent businesses.' },
      { title: 'Accounts', body: 'You are responsible for accurate account information and safeguarding your login credentials.' },
      { title: 'Payments', body: 'Authorized amounts, cancellation rules, and refund eligibility are described in the Payment / Visit Policy and job-specific disclosures.' },
    ],
  },
  PRIVACY_POLICY: {
    heading: 'Privacy Policy',
    sections: [
      { title: 'Data we collect', body: 'Contact information, property details, job history, and communications needed to deliver the service.' },
      { title: 'How we use data', body: 'To match providers, process payments, provide support, and improve the platform. Marketing uses require separate opt-in.' },
      { title: 'Sharing', body: 'Relevant job details are shared with matched contractors and payment processors as needed to complete your request.' },
    ],
  },
  DIY_SAFETY_DISCLAIMER: {
    heading: 'AI / DIY Safety Disclaimer',
    sections: [
      { title: 'Informational only', body: 'FixBridge AI guidance is informational and may be incomplete or incorrect. It is not professional on-site advice.' },
      { title: 'Stop if unsafe', body: 'Stop immediately if a task involves gas, major electrical work, structural damage, flooding, sewage, fire/smoke/CO, or anything beyond your skill level.' },
      { title: 'Professional help', body: 'When in doubt, request a licensed professional through FixBridge instead of proceeding with DIY steps.' },
    ],
  },
  HOMEOWNER_SERVICE_AGREEMENT: {
    heading: 'Homeowner Service Agreement',
    sections: [
      { title: 'Independent providers', body: 'On-site work is performed by independent contractors who control their methods, tools, and personnel.' },
      { title: 'Scope & change orders', body: 'Approved quotes define authorized scope and price. Additional work requires a separate change-order approval.' },
      { title: 'FixBridge role', body: 'FixBridge coordinates intake, matching, and payment workflow but does not guarantee provider workmanship or AI diagnoses.' },
    ],
  },
  VISIT_CANCELLATION_POLICY: {
    heading: 'Visit / Cancellation Policy',
    sections: [
      { title: 'Visit / diagnostic fee', body: 'The visit or diagnostic fee shown at checkout is separate from repair work. Repair pricing requires your quote approval.' },
      { title: 'Cancellations', body: 'Cancellation and rescheduling rules depend on timing and job status. Fees may apply as disclosed at authorization.' },
      { title: 'No-shows', body: 'Missed appointments without timely notice may forfeit or reduce refundable amounts per the disclosed policy.' },
    ],
  },
  PAYMENT_VISIT_POLICY: {
    heading: 'Payment / Visit Policy',
    sections: [
      { title: 'Authorization', body: 'You authorize the exact amount shown at checkout under the cancellation/refund rules presented with that amount.' },
      { title: 'Amount changes', body: 'If the payable amount changes materially, a new authorization is required before charging.' },
      { title: 'Refunds', body: 'Eligible refunds are processed according to job status, provider arrival, and the cancellation policy in effect at authorization.' },
    ],
  },
  MARKETING_CONSENT: {
    heading: 'Marketing Communications',
    sections: [
      { title: 'Optional', body: 'Marketing SMS and email are optional and never required to receive FixBridge services.' },
      { title: 'Opt out', body: 'You may opt out of marketing messages at any time. Service-related messages may still be sent for active jobs.' },
    ],
  },
  INSURANCE_REQUIREMENTS: INSURANCE_REQUIREMENTS_CONTENT,
};
