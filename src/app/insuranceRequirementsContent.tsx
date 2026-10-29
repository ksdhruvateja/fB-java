import type { ReactNode } from "react";
import { COI_CERTIFICATE_HOLDER, COI_LEGAL_NOTICE_ADDRESS } from "./contractorCompliance";
import { LEGAL_ROUTES } from "./legalDocuments";
import { FIXBRIDGE_INSURANCE_REQUIREMENTS_PDF_URL } from "./contractorApplication";

export const INSURANCE_REQUIREMENTS_URL = FIXBRIDGE_INSURANCE_REQUIREMENTS_PDF_URL;
export const COI_SAMPLE_URL = "/samples/coi-sample.html";

export type InsuranceGuideSection = {
  id: string;
  title: string;
  body: ReactNode;
};

export const CONTRACTOR_INSURANCE_NOTICE =
  "Do not alter or create the insurance certificate yourself. Send this FixBridge Insurance Requirements guide to your licensed insurance agent or broker and ask them to issue the required COI and endorsements.";

export const INSURANCE_GUIDE_SECTIONS: InsuranceGuideSection[] = [
  {
    id: "rule",
    title: "Important rule — COI is evidence only",
    body: (
      <p>
        A Certificate of Insurance (COI) is <strong>evidence of coverage only</strong>. When FixBridge requires
        Additional Insured status, Primary &amp; Non-Contributory status, or Waiver of Subrogation, the contractor must
        provide the <strong>actual policy endorsement(s)</strong> in addition to the COI. Do not treat a COI by itself as
        proof that these rights are granted.
      </p>
    ),
  },
  {
    id: "level1",
    title: "Level 1 — Residential / Network",
    body: (
      <div className="space-y-3">
        <p>Default requirements for standard residential/network work.</p>
        <div>
          <p className="font-medium text-foreground">Commercial General Liability</p>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li>$1,000,000 each occurrence</li>
            <li>$2,000,000 general aggregate</li>
          </ul>
          <p className="mt-1">Include completed-operations protection appropriate to trade and work performed.</p>
        </div>
        <div>
          <p className="font-medium text-foreground">Additional Insured</p>
          <p className="mt-1">
            Where required, name <strong>{COI_CERTIFICATE_HOLDER}</strong> for ongoing and completed operations. Provide
            the actual endorsement — not just the COI.
          </p>
        </div>
        <div>
          <p className="font-medium text-foreground">Primary &amp; Non-Contributory</p>
          <p className="mt-1">Required when applicable per written agreement or job terms. Endorsement required.</p>
        </div>
        <div>
          <p className="font-medium text-foreground">Waiver of Subrogation</p>
          <p className="mt-1">
            May apply to GL and/or WC where legally permitted. Waiver does <strong>not</strong> replace WC coverage.
          </p>
        </div>
        <div>
          <p className="font-medium text-foreground">Workers&apos; Compensation</p>
          <p className="mt-1">Statutory where required. Solo-owner acknowledgment only when genuinely applicable.</p>
        </div>
        <div>
          <p className="font-medium text-foreground">Commercial Auto</p>
          <p className="mt-1">
            Business-use coverage where applicable — commonly $1,000,000 when business-owned vehicles or job/client
            requires it. Not required universally.
          </p>
        </div>
        <div>
          <p className="font-medium text-foreground">Umbrella / Excess</p>
          <p className="mt-1">Not default for all Level 1 providers; may be required for higher-risk or specific jobs.</p>
        </div>
      </div>
    ),
  },
  {
    id: "level2",
    title: "Level 2 — Managed / Facility",
    body: (
      <div className="space-y-3">
        <p>Applies to managed, facility, emergency, and higher-requirement jobs — Level 1 plus client/job-specific rules.</p>
        <p className="font-medium text-foreground">Common Level 2 requirements may include:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Commercial Auto: $1,000,000</li>
          <li>Workers&apos; Compensation: Statutory</li>
          <li>Employers Liability: $1,000,000</li>
          <li>Umbrella / Excess: $1,000,000–$5,000,000 (or client/job amount)</li>
        </ul>
        <p>
          Additional Insured may be required for FixBridge, client, property owner, or other contract entities. Limits
          vary by job — do not assume one fixed Level 2 package for every assignment.
        </p>
      </div>
    ),
  },
  {
    id: "what-to-send",
    title: "What to send to FixBridge",
    body: (
      <ul className="list-disc pl-5 space-y-1">
        <li>Current ACORD 25 or equivalent COI</li>
        <li>Additional Insured — ongoing operations endorsement</li>
        <li>Additional Insured — completed operations endorsement</li>
        <li>Primary &amp; Non-Contributory endorsement</li>
        <li>Waiver of Subrogation endorsement(s)</li>
        <li>Workers&apos; Compensation proof</li>
        <li>Commercial Auto proof</li>
        <li>Umbrella / Excess proof</li>
      </ul>
    ),
  },
  {
    id: "holder",
    title: "FixBridge Certificate Holder Information",
    body: (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2 not-prose">
        <div>
          <p className="font-semibold text-primary">Certificate Holder / Additional Insured</p>
          <p>{COI_CERTIFICATE_HOLDER}</p>
        </div>
        <div>
          <p className="font-semibold text-primary">Temporary COI / legal notice address</p>
          <p className="whitespace-pre-line">{COI_LEGAL_NOTICE_ADDRESS}</p>
        </div>
        <p className="text-xs text-muted-foreground">These fields are not editable by contractors.</p>
      </div>
    ),
  },
  {
    id: "endorsements",
    title: "Important endorsement rules",
    body: (
      <div className="space-y-2">
        <ul className="list-disc pl-5 space-y-1">
          <li>COI uploaded → COI under review (not auto-verified)</li>
          <li>Each endorsement type is verified separately by admin</li>
          <li>WC cannot be replaced by a waiver of subrogation</li>
          <li>Expired required coverage blocks new dispatch for jobs needing that document</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          Statuses: VERIFIED, MISSING, UNDER REVIEW, REJECTED, EXPIRED, NOT APPLICABLE
        </p>
      </div>
    ),
  },
];
