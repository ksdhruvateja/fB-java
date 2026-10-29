/**
 * Homeowner-facing legal document content (working product copy).
 * Counsel review recommended before broad public scale.
 */

const AI_LIMITATIONS =
  'FixBridge AI provides informational, safety-conscious guidance based on the information provided by the homeowner. It cannot physically inspect a property or guarantee that its assessment or instructions accurately reflect actual site conditions.';

const HOMEOWNER_JUDGMENT =
  'You should use your own judgment, follow appropriate safety precautions, use proper tools and equipment, and stop immediately if a task appears unsafe, differs from the information provided, or is beyond your experience or ability.';

const PROFESSIONAL_ESCALATION =
  'If you do not feel comfortable or safe completing a task yourself, FixBridge can help you request a service professional instead.';

export const HOMEOWNER_LEGAL_EFFECTIVE_DATE = '2026-09-01';

export const HOMEOWNER_LEGAL_CONTENT = {
  HOMEOWNER_TERMS: {
    heading: 'FixBridge Terms of Service',
    intro:
      'These Terms of Service govern your use of the FixBridge platform, including AI-assisted assessments, Guided DIY features, and professional service coordination. By creating an account or using FixBridge, you agree to these Terms and our Privacy Policy.',
    sections: [
      {
        title: 'FixBridge Platform',
        body: `FixBridge provides a technology platform that helps homeowners describe property issues, receive AI-assisted assessments and troubleshooting guidance, explore Guided DIY options when appropriate, and request independent service professionals.

FixBridge coordinates intake, matching, workflow, approvals, and payment processing according to the features available in your account. On-site repair work is performed by independent contractors or service providers, not by FixBridge employees performing trade work at your property.`,
      },
      {
        title: 'Accounts and Eligibility',
        body: 'You are responsible for accurate account information, property details you provide, and safeguarding your login credentials. You must be legally able to enter into these Terms and use the services in your jurisdiction.',
      },
      {
        title: 'AI-Assisted Assessments and Guided DIY',
        body: `FixBridge may provide automated assessments, troubleshooting suggestions, Guided DIY information, estimated service needs, or other AI-assisted features.

These features are informational tools based on information supplied by you and other available inputs. They are not a physical inspection, guaranteed diagnosis, professional trade opinion, engineering opinion, safety certification, or guarantee of outcome.

AI-generated information may occasionally be incomplete, inaccurate, outdated, or inappropriate for the actual conditions at a property.

${AI_LIMITATIONS}

${HOMEOWNER_JUDGMENT}

You should not rely solely on FixBridge AI for decisions involving personal safety, property safety, regulated work, or hazardous conditions.

You should stop any DIY activity if you are uncertain, uncomfortable, unable to safely perform the work, lack appropriate tools or experience, or encounter conditions that differ from the information presented.

${PROFESSIONAL_ESCALATION}`,
      },
      {
        title: 'Guided DIY and Safety-Critical Activities',
        body: `Guided DIY is intended for appropriate, lower-risk homeowner tasks when the platform indicates it may be suitable. FixBridge does not encourage homeowners to perform hazardous, regulated, or high-risk work through DIY guidance.

Examples of situations that are generally not appropriate for DIY repair instructions include suspected gas leaks, gas-line work, live electrical panels, exposed energized wiring, electrical panel internal work, torch or open-flame work, roof or high-elevation work, structural repairs, refrigerant handling, sewage or biohazard conditions, fire or smoke hazards, carbon monoxide concerns, significant flooding around electricity, and other serious hazards.

For these situations FixBridge may limit or stop DIY guidance, provide immediate safety or damage-control guidance, recommend professional assistance, and recommend appropriate emergency or utility services when warranted.`,
      },
      {
        title: 'Professional Services and Independent Providers',
        body: `When you request a service professional through FixBridge, matched providers are independent businesses responsible for their on-site work, means and methods, personnel, tools, safety practices, licensing where required, and workmanship.

FixBridge coordinates platform workflow, requests, disclosures, approvals, and related services according to the business model in effect for your job. FixBridge does not guarantee provider availability, timing, pricing outcomes beyond disclosed authorizations, or specific repair results.`,
      },
      {
        title: 'Payments, Authorizations, and Cancellations',
        body: 'Authorized amounts, visit or diagnostic fees, cancellation rules, and refund eligibility are described in the Payment / Visit Policy, Visit / Cancellation Policy, and job-specific disclosures presented at checkout or approval. Material changes to payable amounts require new authorization where applicable.',
      },
      {
        title: 'Acceptable Use',
        body: 'You agree not to misuse the platform, attempt to bypass safety restrictions, submit unlawful content, interfere with other users or providers, or use FixBridge in a manner that could harm people or property.',
      },
      {
        title: 'Changes to These Terms',
        body: 'FixBridge may update these Terms from time to time. When we publish a new version, continued use after the effective date may require acceptance of the updated Terms where the platform prompts you to do so.',
      },
    ],
  },
  PRIVACY_POLICY: {
    heading: 'Privacy Policy',
    intro:
      'This Privacy Policy explains how FixBridge collects, uses, and shares information when you use our platform, including AI-assisted features. Liability and safety responsibilities are addressed in our Terms of Service and AI / DIY Safety Disclaimer.',
    sections: [
      {
        title: 'Information We Collect',
        body: `We collect information needed to operate the platform, including:

• Account and contact information (such as name, email, phone, and login credentials)
• Property and service-request details you provide
• Communications with FixBridge support
• Payment-related metadata processed by our payment providers (FixBridge does not need to store full payment card numbers on its own servers for standard checkout)
• Device, browser, and session information (such as IP address, user agent, and basic usage logs) for security, fraud prevention, and service delivery`,
      },
      {
        title: 'Information Used for AI-Assisted Features',
        body: `FixBridge may process information you submit to provide issue assessment, troubleshooting, Guided DIY, service categorization, contractor or professional coordination, and related support.

Depending on the features you use, this may include:

• Text descriptions and answers you enter about an issue
• Service category, urgency, and intake responses
• Photos you choose to upload for visual assessment (sent to our AI processing pipeline when provided)
• Property location context such as city, state, or ZIP when available for service-area and complexity context
• Prior job or property context already stored in your account when a feature uses that context (for example, an existing AI assessment attached to a job during Guided DIY chat)
• Basic device/session metadata associated with the request

FixBridge does not send payment card details, government identification documents, contractor W-9 or insurance records, or unrelated internal admin notes to AI models for homeowner troubleshooting.`,
      },
      {
        title: 'Automated Processing and AI Transparency',
        body: `FixBridge may use automated systems, including artificial intelligence models, to analyze information provided through the platform and generate assessments, recommendations, classifications, troubleshooting steps, or other service-related outputs.

AI-generated outputs may be used to assist the homeowner experience and FixBridge operations but are not treated as guaranteed factual determinations.

When configured, FixBridge may use third-party AI infrastructure providers to process prompts and return model outputs. Those providers process data according to their role as service providers and FixBridge's agreements with them. FixBridge configures AI processing to use only the information needed for the requested feature.`,
      },
      {
        title: 'Photos, Property Information, and Retention',
        body: `If you upload a photo for assessment, the image is transmitted to FixBridge servers and may be included in an AI request for analysis. Very large images may be declined or assessed from text only for reliability and performance.

Video uploads and general document uploads are not routinely sent to homeowner DIY AI troubleshooting unless a specific feature clearly requests them.

Property history and equipment information from HomeCare Pro or similar property features may be included in AI context only when that feature is enabled and relevant to your request.

Assessment results, chat messages, and related job records may be stored in your FixBridge account to support continuity, support, safety review, and service delivery. Retention follows operational needs, legal requirements, and your account status.`,
      },
      {
        title: 'How We Use Information',
        body: `We use information to:

• Provide and improve platform features
• Match and coordinate service professionals
• Process payments and send service-related communications
• Maintain safety controls, fraud prevention, and audit logs
• Comply with law and enforce our terms

Marketing email or SMS uses require separate opt-in where offered.`,
      },
      {
        title: 'How We Share Information',
        body: `We share information with:

• Matched service professionals and their organizations as needed to perform requested work
• Payment processors and infrastructure providers that help us operate the platform
• AI or cloud service providers that process data on our behalf for permitted features
• Authorities when required by law or to protect safety

We do not sell your personal information as a standalone product.`,
      },
      {
        title: 'Your Choices',
        body: 'You may update account information, manage communication preferences where available, and contact support about access or deletion requests subject to legal and operational limits. You may decline optional marketing communications at any time.',
      },
      {
        title: 'Security',
        body: 'FixBridge uses administrative, technical, and organizational measures designed to protect information. No method of transmission or storage is completely secure.',
      },
      {
        title: 'Children',
        body: 'FixBridge is not directed to children under 13, and we do not knowingly collect personal information from children under 13.',
      },
      {
        title: 'Changes to This Policy',
        body: 'We may update this Privacy Policy from time to time. Material changes will be reflected by an updated version and effective date. Continued use after the effective date may require acceptance where the platform prompts you.',
      },
    ],
  },
  DIY_SAFETY_DISCLAIMER: {
    heading: 'AI / DIY Safety Disclaimer',
    intro:
      'FixBridge uses AI to provide helpful, safety-conscious informational guidance based on the information available to the system. Because FixBridge cannot physically inspect your property, actual conditions may differ and AI-generated information may occasionally be incomplete or inaccurate.',
    sections: [
      {
        title: '1. Purpose of FixBridge AI',
        body: `FixBridge AI helps homeowners organize symptoms, explore likely causes, review safety-conscious troubleshooting ideas, and decide whether Guided DIY or professional assistance may be appropriate.

${AI_LIMITATIONS}`,
      },
      {
        title: '2. Limitations of AI Guidance',
        body: `AI-generated assessments, steps, and suggestions are informational only. They are not a substitute for an on-site inspection by a qualified professional, a code compliance determination, a manufacturer warranty decision, or an emergency services evaluation.

Information may be incomplete, outdated, or unsuitable for your specific property, equipment, or local requirements. Photos and descriptions may not reveal hidden conditions behind walls, inside panels, underground, or in inaccessible areas.`,
      },
      {
        title: '3. Homeowner Safety Responsibility',
        body: `${HOMEOWNER_JUDGMENT}

You should not rely solely on AI guidance for safety-critical decisions.

Use appropriate personal protective equipment, shut off utilities when safely possible using normal homeowner controls, and follow manufacturer instructions and local codes where applicable.`,
      },
      {
        title: '4. When to Stop DIY',
        body: `Stop Guided DIY and do not proceed if you:

• do not understand the instructions
• do not have appropriate tools
• lack experience for the task
• cannot safely access the work area
• see conditions different from the AI assessment
• feel uncomfortable or unsafe
• simply prefer not to perform the work

${PROFESSIONAL_ESCALATION}`,
      },
      {
        title: '5. High-Risk / Prohibited DIY Categories',
        body: `FixBridge is not intended to guide homeowners through hazardous or regulated repair work. Examples include suspected gas leaks, gas-line work, live electrical panels, exposed energized wiring, electrical panel internal work, torch or open-flame work, roof or high-elevation work, structural repairs, refrigerant handling, sewage or biohazard conditions, fire or smoke hazards, carbon monoxide concerns, significant flooding around electricity, and other serious hazards.

For these situations FixBridge may limit or stop DIY guidance, provide immediate safety or damage-control guidance, recommend professional assistance, and recommend emergency or utility services when appropriate.`,
      },
      {
        title: '6. Professional Assistance',
        body: `${PROFESSIONAL_ESCALATION}

Requesting a professional is always appropriate when you are uncertain, when regulated work is involved, or when safety risk may be present.`,
      },
      {
        title: '7. Emergency Situations',
        body: `If you believe there is immediate danger to people or property — including fire, active flooding with electrical risk, gas odor, carbon monoxide symptoms, or structural collapse — leave the area if safe to do so, contact emergency services or your utility provider as appropriate, and do not rely on DIY instructions as a substitute for emergency response.`,
      },
    ],
  },
  HOMEOWNER_SERVICE_AGREEMENT: {
    heading: 'Homeowner Platform & Professional Service Agreement',
    intro:
      'This Agreement describes how FixBridge platform services, AI/DIY assistance, and independent professional work fit together when you use FixBridge as a homeowner.',
    sections: [
      {
        title: '1. Three Parts of the FixBridge Experience',
        body: `Your FixBridge experience may include:

• AI/DIY assistance — informational assessments, troubleshooting, and Guided DIY when appropriate (see AI / DIY Safety Disclaimer)
• FixBridge coordination — intake, matching, workflow, approvals, payments, and platform communications
• Independent service provider work — on-site trade labor performed by matched professionals who are not FixBridge employees performing the repair at your property`,
      },
      {
        title: '2. AI / DIY Assistance',
        body: `FixBridge AI guidance is informational and based on information you provide. It is not a guaranteed diagnosis or on-site professional opinion. See the AI / DIY Safety Disclaimer for detailed safety rules.

You should stop DIY if conditions are unsafe or uncertain and may request a professional through FixBridge instead.`,
      },
      {
        title: '3. FixBridge Coordination Role',
        body: `FixBridge coordinates platform workflow, service requests, disclosures shown in the product, approvals, and payment processing according to the features available for your job.

FixBridge does not perform the on-site trade work and does not control the day-to-day means, methods, or personnel of independent providers.`,
      },
      {
        title: '4. Independent Service Providers',
        body: `Matched professionals are independent businesses responsible for their licensing where required, tools, personnel, safety practices, workmanship, and compliance with applicable laws on site.

Provider-specific terms, insurance requirements, and platform policies may apply in addition to this Agreement.`,
      },
      {
        title: '5. Scope, Quotes, and Change Orders',
        body: 'Approved quotes define authorized scope and pricing for covered work. Additional scope requires separate homeowner approval through the change-order workflow presented in the platform.',
      },
      {
        title: '6. Professional Dispatch Acknowledgments',
        body: 'When you authorize a professional service request, you may be asked to acknowledge beta product disclosures, visit or diagnostic fees, and the independent-provider relationship. Those acknowledgments supplement this Agreement and are stored with the document versions shown at authorization time.',
      },
      {
        title: '7. Payments and Cancellations',
        body: 'Payment authorizations, visit fees, and cancellation rules are governed by the Payment / Visit Policy and Visit / Cancellation Policy in effect when you authorize a charge.',
      },
    ],
  },
};
