/** FixBridge Contractor Agreement Package v4 — canonical metadata & static content. */

export const CONTRACTOR_AGREEMENT_KEY = 'CONTRACTOR_AGREEMENT';
export const MANAGED_ADDENDUM_KEY = 'MANAGED_ADDENDUM';
export const SOLO_OWNER_ACK_KEY = 'SOLO_OWNER_ACKNOWLEDGMENT';

export const AGREEMENT_V3_VERSION = '3';
export const AGREEMENT_V4_VERSION = '4';

export const AGREEMENT_V4_TITLE = 'FixBridge Contractor Agreement Package v4';
export const AGREEMENT_V4_PDF_PATH = '/documents/fixbridge-contractor-agreement-package-v4.pdf';

export const AGREEMENT_V4_META = {
  key: CONTRACTOR_AGREEMENT_KEY,
  title: AGREEMENT_V4_TITLE,
  version: AGREEMENT_V4_VERSION,
  route: '/legal/contractor-agreement',
  pdfUrl: AGREEMENT_V4_PDF_PATH,
  acceptanceType: 'CONTRACTOR_AGREEMENT',
  audience: 'contractor',
};

export const AGREEMENT_V3_META = {
  key: CONTRACTOR_AGREEMENT_KEY,
  title: 'FixBridge Contractor Agreement v3',
  version: AGREEMENT_V3_VERSION,
  route: '/legal/contractor-agreement',
  acceptanceType: 'CONTRACTOR_AGREEMENT',
  audience: 'contractor',
  status: 'archived',
};

export const MANAGED_ADDENDUM_V4_META = {
  key: MANAGED_ADDENDUM_KEY,
  title: 'Managed Services Addendum',
  version: '4',
  route: '/legal/managed-addendum',
  acceptanceType: 'MANAGED_ADDENDUM',
  audience: 'contractor',
};

export const AGREEMENT_V4_CONTENT = {
  heading: AGREEMENT_V4_TITLE,
  pdfUrl: AGREEMENT_V4_PDF_PATH,
  sections: [
    {
      title: 'Provider levels',
      body:
        'Level 1 — Network Provider: residential, network, site visits, quote requests, and Provider-Direct jobs where identified. Level 2 — Managed Provider: managed residential, emergency, recurring, facility, commercial, and client-managed jobs.',
    },
    {
      title: 'Managed job pricing',
      body:
        'For FixBridge-Managed jobs, the provider discusses the work; FixBridge discusses the price. Providers must not quote customer-facing pricing, negotiate customer pricing, disclose provider compensation, or collect customer payment on managed jobs.',
    },
    {
      title: 'Insurance & compliance',
      body:
        'Providers must maintain applicable General Liability, Additional Insured endorsements (not COI text alone), Primary & Non-Contributory, Waiver of Subrogation where required, Workers\' Compensation when legally required, Commercial Auto, Umbrella/Excess for Level 2 when applicable, and remain dispatch-eligible on the date of service.',
    },
    {
      title: 'Solo owner / no employees',
      body:
        'Genuine solo owner-operators may submit a Schedule C acknowledgment subject to FixBridge admin approval. Solo owner status is not a substitute for Workers\' Compensation where coverage is legally required.',
    },
    {
      title: 'Job authorization',
      body:
        'Each accepted job receives an immutable Job Authorization identifying provider level, pricing mode (PROVIDER_DIRECT or FIXBRIDGE_MANAGED), scope, NTE, and provider compensation separately from customer amounts.',
    },
  ],
};

export const MANAGED_PRICING_GUIDANCE = [
  {
    question: 'How much will this cost?',
    response:
      "FixBridge handles pricing and approvals. I'll send my diagnosis and scope through FixBridge, and you'll receive the price there.",
  },
  {
    question: 'How much are you charging FixBridge?',
    response:
      "My contractor pricing is handled directly with FixBridge. They'll provide your approved customer price.",
  },
  {
    question: 'Can I pay you directly?',
    response:
      'For this FixBridge job, payment has to stay through FixBridge so the job, approval and warranty record stay protected.',
  },
  {
    question: 'Can you do extra work?',
    response:
      'I can document it and submit a change request. FixBridge will send you the additional price for approval before I do the extra work.',
  },
];

export const SOLO_OWNER_ACKNOWLEDGMENTS = [
  'I am an owner/operator of an independently established business and personally perform the FixBridge work.',
  'I currently have NO employees, helpers, day laborers, technicians or other workers performing FixBridge jobs for me.',
  'I will not bring another person or subcontractor onto a FixBridge job unless I notify FixBridge and obtain approval and all legally required coverage is in place.',
  'I am responsible for determining and maintaining all legally required Workers\' Compensation, disability/PFL, liability, auto and other insurance.',
  'I understand this acknowledgment does not bind government agencies, courts, insurers or customers regarding worker classification/statutory liability.',
  'I will notify FixBridge before my status changes.',
];
