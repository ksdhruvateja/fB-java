/**
 * FixBridge Insurance Requirements — contractor / insurance agent quick guide.
 * Operational guidance; not legal advice.
 */

export const INSURANCE_REQUIREMENTS_META = {
  key: 'INSURANCE_REQUIREMENTS',
  title: 'FixBridge Insurance Requirements',
  version: '2.1',
  route: '/documents/fixbridge-insurance-requirements.pdf',
  pdfUrl: '/documents/fixbridge-insurance-requirements.pdf',
  audience: 'contractor',
};

export const INSURANCE_REQUIREMENTS_CONTENT = {
  heading: 'FixBridge Insurance Requirements — Contractor / Insurance Agent Quick Guide',
  sections: [
    {
      title: 'Important rule — COI is evidence only',
      body: `A Certificate of Insurance (COI) is evidence of coverage only.

When FixBridge requires Additional Insured status, Primary & Non-Contributory status, or Waiver of Subrogation, the contractor must provide the actual policy endorsement(s) in addition to the COI.

Do not treat a COI by itself as proof that these rights are actually granted.`,
    },
    {
      title: 'Contractor instruction',
      body: `Do not alter or create the insurance certificate yourself.

Send this FixBridge Insurance Requirements guide to your licensed insurance agent or broker and ask them to issue the required COI and endorsements.`,
    },
    {
      title: 'Level 1 — Residential / Network Provider',
      body: `Default FixBridge requirements for standard residential/network work.

Commercial General Liability (default):
• $1,000,000 each occurrence
• $2,000,000 general aggregate
Coverage should include completed-operations protection appropriate to the contractor's trade and work performed.

Additional Insured — where required by written contract, the policy should name:
Liora Creations, Corp. d/b/a FixBridge
as Additional Insured for ongoing operations and completed operations. The actual endorsement must be provided where required.

Primary & Non-Contributory — required when applicable and when required by written agreement, client, or job-specific terms. The actual endorsement must be provided.

Waiver of Subrogation — may be required for Commercial General Liability and Workers' Compensation where applicable, legally permitted, and required by written agreement. The actual waiver endorsement must be provided where required.

Workers' Compensation — must meet statutory requirements whenever legally required. A genuine solo owner / no-employee process may be used only where appropriate and legally permissible. Do not use a waiver of subrogation as a replacement for required Workers' Compensation coverage.

Commercial Auto — contractors must maintain appropriate business-use auto coverage where applicable. A common requirement is $1,000,000 when vehicles are business-owned, the job/client requires it, or FixBridge determines the work requires commercial auto coverage. Do not require commercial auto universally if it is not applicable.

Umbrella / Excess — not required by default for every Level 1 provider. It may become required for higher-risk work, specific trades, specific clients, higher-value jobs, or other job-specific requirements.`,
    },
    {
      title: 'Level 2 — Managed / Facility Provider',
      body: `Level 2 applies to managed, facility, emergency, and other higher-requirement jobs.

Use the same base Level 1 requirements, plus any client- or job-specific insurance requirements.

Common Level 2 requirements may include:
• Commercial Auto: $1,000,000
• Workers' Compensation: Statutory
• Employers Liability: $1,000,000
• Umbrella / Excess: $1,000,000–$5,000,000 or the amount required by the client/job

Additional Insured status may also be required for Liora Creations, Corp. d/b/a FixBridge, applicable client, applicable property owner, or other contractually required entities.

Do not hardcode one Level 2 limit for every job if the client/job requires something different. The compliance system must support job-specific requirements.`,
    },
    {
      title: 'What contractors / insurance agents should send to FixBridge',
      body: `Where applicable, request:
• Current ACORD 25 or equivalent Certificate of Insurance
• Additional Insured endorsement — ongoing operations
• Additional Insured endorsement — completed operations
• Primary & Non-Contributory endorsement
• Waiver of Subrogation endorsement(s)
• Workers' Compensation proof
• Commercial Auto proof
• Umbrella / Excess proof

Only require documents that actually apply to the contractor, trade, location, job level, and client requirements.`,
    },
    {
      title: 'FixBridge Certificate Holder Information',
      body: `Certificate Holder / Additional Insured:
Liora Creations, Corp. d/b/a FixBridge

Temporary COI / legal notice address:
131 Continental Dr, Suite 305
Newark, DE 19713

These fields are not editable by contractors.`,
    },
    {
      title: 'Important endorsement rules',
      body: `Admin verification rules:
• COI uploaded → COI under review (not automatically verified)
• AI ongoing endorsement uploaded → separately verified
• AI completed operations endorsement uploaded → separately verified
• Primary & Non-Contributory uploaded → separately verified
• Waiver of Subrogation uploaded → separately verified

Each compliance item retains its own verification status. A COI upload does not automatically mark endorsements as verified.

Compliance statuses: VERIFIED, MISSING, UNDER REVIEW, REJECTED, EXPIRED, NOT APPLICABLE.

If required coverage is MISSING, EXPIRED, REJECTED, or UNVERIFIED, the contractor must not receive new jobs requiring that document.

Save effective and expiration dates for CGL, Workers' Compensation, Commercial Auto, Umbrella/Excess, and other policies where applicable. When required coverage expires, mark it expired, recalculate compliance, and stop new dispatches requiring that coverage.`,
    },
  ],
};
