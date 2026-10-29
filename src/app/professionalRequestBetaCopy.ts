/** Working beta product copy — not final legal advice. See api/legal-documents.js counsel note. */

export const PROFESSIONAL_REQUEST_BETA_DOCUMENT_VERSION = "homeowner_professional_request_beta_v1";

export const PROFESSIONAL_REQUEST_BETA_CHECKBOX_LABEL =
  "I understand the contractor visit charge, repair approval process, cancellation terms, and FixBridge beta terms, and I authorize this professional service request.";

export type ProfessionalRequestBetaSection = {
  id: string;
  title: string;
  body: string;
};

export function buildProfessionalRequestBetaSections(): ProfessionalRequestBetaSection[] {
  return [
    {
      id: "beta-fee",
      title: "FixBridge Beta Fee",
      body: "Your FixBridge assessment and coordination fee is waived during the beta.",
    },
    {
      id: "contractor-visit",
      title: "Contractor Visit",
      body: "The service professional may charge the visit/diagnostic amount shown above for travel and evaluation of the problem.",
    },
    {
      id: "repair-work",
      title: "Repair Work",
      body: "The visit fee does not include additional labor, parts, or repair work unless specifically stated. Additional work requires your approval.",
    },
    {
      id: "payment-auth",
      title: "Payment Authorization",
      body: "You authorize the displayed visit amount to be placed on hold/charged according to the dispatch and cancellation policy shown before you confirm.",
    },
    {
      id: "cancellation",
      title: "Cancellation",
      body: "If you cancel before a contractor accepts or before travel begins, the authorization should be released unless a disclosed exception applies. Once a contractor begins travel, the disclosed trip/cancellation amount may apply.",
    },
    {
      id: "ai-assessment",
      title: "AI Assessment",
      body: "FixBridge AI provides an informational assessment based on the information you provide. It is not a guaranteed diagnosis and site conditions may differ.",
    },
    {
      id: "emergency",
      title: "Emergency Safety",
      body: "FixBridge is not a 911 or utility emergency-response service. For fire, suspected gas leak, dangerous electrical conditions, medical emergency, or immediate danger, contact the appropriate emergency authority or utility.",
    },
    {
      id: "contact-consent",
      title: "Contact Consent",
      body: "You authorize FixBridge and the selected service professional to contact you about this service request by the contact methods you provide.",
    },
  ];
}
