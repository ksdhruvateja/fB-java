import { useState, useEffect, type ReactNode } from "react";
import type { Unicon } from "./contractorIcons";
import {
  SECTION_ICONS,
  TRADE_ICONS,
  UniconBadge,
  UilExternalLinkAlt,
  UilFileUploadAlt,
} from "./contractorIcons";
import { brand } from "../config/brand";
import {
  BUSINESS_TYPES,
  FIXBRIDGE_CONTRACTOR_AGREEMENT_V4_PDF_URL,
  FIXBRIDGE_INSURANCE_REQUIREMENTS_PDF_URL,
  INSURANCE_REQUIREMENTS_URL,
  W9_FORM_URL,
  PHONE_TYPES,
  PRIMARY_SERVICES,
  UNION_OPTIONS,
  US_STATES,
  type ApplicationDoc,
  type ContractorApplication,
  type TaxIdType,
  type YesNo,
} from "./contractorApplication";
import { VerifiedAddressFields } from "./VerifiedAddressInput";
import InsuranceRequirementsLink from "./InsuranceRequirementsLink";
import {
  CONTRACTOR_APPLICATION_DOCUMENTS,
  formatLegalDate,
  LEGAL_ROUTES,
} from "./legalDocuments";
import { fetchPublicLegalDocument } from "./legalApi";
import { isValidPhoneNumber } from "libphonenumber-js";

const inputClass =
  "w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15";
const labelClass = "text-xs font-semibold text-foreground";
const helpClass = "text-[11px] text-muted-foreground leading-relaxed";
const sectionClass = "rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3.5 shadow-sm";

function Req() {
  return <span className="text-primary">*</span>;
}

function SectionTitle({
  icon,
  children,
}: {
  icon: Unicon;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <UniconBadge icon={icon} />
      <h3 className="[font-family:'Barlow_Condensed',sans-serif] text-xl font-black uppercase tracking-tight">
        {children}
      </h3>
    </div>
  );
}

function Field({
  label,
  required,
  help,
  children,
  className = "",
}: {
  label: string;
  required?: boolean;
  help?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`grid gap-1.5 ${className}`}>
      <span className={labelClass}>
        {label} {required ? <Req /> : null}
      </span>
      {children}
      {help ? <span className={helpClass}>{help}</span> : null}
    </label>
  );
}

function YesNoSelect({
  value,
  onChange,
  required,
}: {
  value: YesNo;
  onChange: (v: YesNo) => void;
  required?: boolean;
}) {
  return (
    <select
      required={required}
      className={inputClass}
      value={value}
      onChange={(e) => onChange(e.target.value as YesNo)}
    >
      <option value="">Choose one…</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );
}

function ChipToggle({
  label,
  selected,
  onToggle,
  icon: Icon,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
  icon?: Unicon;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition ${
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-background text-muted-foreground hover:border-primary/40"
      }`}
    >
      {Icon ? (
        <Icon
          size={16}
          color="currentColor"
          className={selected ? "text-primary shrink-0" : "shrink-0 opacity-70"}
        />
      ) : null}
      <span>{label}</span>
    </button>
  );
}

function DocUpload({
  label,
  required,
  file,
  existingName,
  onChange,
  sampleLink,
  allowUploadLater,
}: {
  label: string;
  required?: boolean;
  file: ApplicationDoc;
  existingName?: string | null;
  onChange: (doc: ApplicationDoc) => void;
  sampleLink?: { href: string; text: string };
  allowUploadLater?: boolean;
}) {
  const [uploadLater, setUploadLater] = useState(false);
  const hasExisting = Boolean(existingName || file?.data);

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`${labelClass} inline-flex items-center gap-1.5`}>
          <UilFileUploadAlt size={14} color="currentColor" className="text-primary" />
          {label} {required ? <Req /> : null}
        </span>
        {hasExisting ? (
          <span className="text-[10px] font-semibold text-emerald-600">✓ Uploaded</span>
        ) : uploadLater ? (
          <span className="text-[10px] font-semibold text-muted-foreground">Upload later</span>
        ) : null}
        {sampleLink ? (
          <a
            href={sampleLink.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
          >
            {sampleLink.text}
            <UilExternalLinkAlt size={12} color="currentColor" />
          </a>
        ) : null}
      </div>
      {allowUploadLater && !hasExisting ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setUploadLater(false);
              onChange(null);
            }}
            className={`rounded-md px-2 py-1 text-[10px] font-semibold ${!uploadLater ? "bg-primary text-white" : "border border-border"}`}
          >
            Upload now
          </button>
          <button
            type="button"
            onClick={() => {
              setUploadLater(true);
              onChange(null);
            }}
            className={`rounded-md px-2 py-1 text-[10px] font-semibold ${uploadLater ? "bg-muted text-foreground" : "border border-border"}`}
          >
            Upload later
          </button>
        </div>
      ) : null}
      {!uploadLater ? (
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*"
          required={required && !existingName && !file?.data}
          className="w-full text-xs text-foreground file:mr-2 file:rounded-md file:border file:border-border file:bg-card file:px-2.5 file:py-1 file:text-xs file:font-semibold"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) {
              onChange(null);
              return;
            }
            const reader = new FileReader();
            reader.onload = () => onChange({ name: f.name, data: reader.result as string });
            reader.readAsDataURL(f);
          }}
        />
      ) : (
        <p className="text-[10px] text-muted-foreground">You can upload this from your Compliance dashboard after applying.</p>
      )}
      {file?.name && <p className="text-[10px] text-emerald-600">Selected: {file.name}</p>}
      {!file && existingName && (
        <p className="text-[10px] text-muted-foreground truncate">Current: {existingName}</p>
      )}
    </div>
  );
}

export type ContractorApplicationDocs = {
  w9: ApplicationDoc;
  license: ApplicationDoc;
  insurance: ApplicationDoc;
  businessRegistration: ApplicationDoc;
  businessLicense: ApplicationDoc;
  idDoc: ApplicationDoc;
  diversityCert: ApplicationDoc;
  aiOngoing: ApplicationDoc;
  aiCompleted: ApplicationDoc;
  primaryNonContributory: ApplicationDoc;
  glWaiver: ApplicationDoc;
  workersComp: ApplicationDoc;
  wcWaiver: ApplicationDoc;
  commercialAuto: ApplicationDoc;
  umbrellaExcess: ApplicationDoc;
  soloOwnerAck: ApplicationDoc;
};

export function emptyContractorApplicationDocs(): ContractorApplicationDocs {
  return {
    w9: null,
    license: null,
    insurance: null,
    businessRegistration: null,
    businessLicense: null,
    idDoc: null,
    diversityCert: null,
    aiOngoing: null,
    aiCompleted: null,
    primaryNonContributory: null,
    glWaiver: null,
    workersComp: null,
    wcWaiver: null,
    commercialAuto: null,
    umbrellaExcess: null,
    soloOwnerAck: null,
  };
}

export type ExistingDocs = {
  w9?: string | null;
  license?: string | null;
  insurance?: string | null;
  businessRegistration?: string | null;
  businessLicense?: string | null;
  idDoc?: string | null;
  aiOngoing?: string | null;
  aiCompleted?: string | null;
  primaryNonContributory?: string | null;
  glWaiver?: string | null;
  workersComp?: string | null;
  wcWaiver?: string | null;
  commercialAuto?: string | null;
  umbrellaExcess?: string | null;
  soloOwnerAck?: string | null;
};

export default function ContractorApplicationForm({
  mode,
  value,
  onChange,
  docs,
  onDocsChange,
  existingDocs,
  accountEmail,
}: {
  mode: "signup" | "profile";
  value: ContractorApplication;
  onChange: (next: ContractorApplication) => void;
  docs: ContractorApplicationDocs;
  onDocsChange: (next: ContractorApplicationDocs) => void;
  existingDocs?: ExistingDocs;
  accountEmail?: string;
}) {
  const set = <K extends keyof ContractorApplication>(key: K, v: ContractorApplication[K]) =>
    onChange({ ...value, [key]: v });

  const toggleIn = (key: "primaryServices", item: string) => {
    const list = value[key];
    const has = list.includes(item);
    set(key, has ? list.filter((s) => s !== item) : [...list, item]);
  };

  return (
    <div className="space-y-4">
      {/* Welcome */}
      <div className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <UniconBadge icon={SECTION_ICONS.welcome} size={20} className="h-11 w-11 rounded-2xl" />
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-primary">
              {brand.productName} contractor onboarding
            </p>
            <h2 className="mt-1.5 [font-family:'Barlow_Condensed',sans-serif] text-2xl font-black uppercase tracking-tight sm:text-3xl">
              Welcome — let&apos;s get you set up
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground leading-relaxed">
              Fill this out once, upload your W-9 and insurance certificate, and you&apos;re ready for review.
              Most contractors finish in under 10 minutes. You can update anything later in Profile &amp; Compliance.
              Fields marked <span className="text-primary font-semibold">*</span> are required.
            </p>
          </div>
        </div>
      </div>

      {/* 1. Company */}
      <div className={sectionClass}>
        <SectionTitle icon={SECTION_ICONS.company}>1. Your company</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Legal company name" required className="sm:col-span-2">
            <input
              className={inputClass}
              value={value.legalBusinessName}
              onChange={(e) => set("legalBusinessName", e.target.value)}
              required
            />
          </Field>
          <Field
            label="DBA (Doing Business As)"
            help="Leave blank if you operate under your legal name."
            className="sm:col-span-2"
          >
            <input
              className={inputClass}
              value={value.dbaTradeName}
              onChange={(e) => set("dbaTradeName", e.target.value)}
            />
          </Field>
          <Field label="Entity type" required>
            <select
              className={inputClass}
              value={value.businessType}
              onChange={(e) => set("businessType", e.target.value)}
              required
            >
              <option value="">Choose one…</option>
              {BUSINESS_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Years in business" required>
            <input
              className={inputClass}
              type="text"
              inputMode="numeric"
              min={0}
              placeholder="Years"
              value={value.yearsInBusiness}
              onChange={(e) => set("yearsInBusiness", e.target.value.replace(/\D/g, ""))}
              required
            />
          </Field>
          <div className="sm:col-span-2 space-y-2">
            <span className={labelClass}>
              Tax ID <Req />
            </span>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  { id: "ein", label: "EIN (XX-XXXXXXX)" },
                  { id: "ssn", label: "SSN (XXX-XX-XXXX)" },
                ] as const
              ).map((opt) => (
                <label key={opt.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="taxIdType"
                    checked={value.taxIdType === opt.id}
                    onChange={() => set("taxIdType", opt.id as TaxIdType)}
                    className="accent-primary"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <input
              className={inputClass}
              placeholder="Tax ID"
              value={value.ein}
              onChange={(e) => set("ein", e.target.value)}
              required
            />
            <p className={helpClass}>
              EIN for businesses, or SSN for sole proprietors / single-member LLCs filing as disregarded entities.
              Stored securely; only the last 4 digits are shown in admin tools.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Classifications */}
      <div className={sectionClass}>
        <SectionTitle icon={SECTION_ICONS.classifications}>2. Classifications</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Union or Non-Union" required>
            <select
              className={inputClass}
              value={value.unionStatus}
              onChange={(e) => set("unionStatus", e.target.value)}
              required
            >
              <option value="">Choose one…</option>
              {UNION_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Business Diversity Classifications"
            help="If your business carries WBE, MBE, SBE, DBE, HUBZone, Veteran-Owned, etc., list them here. Leave blank if none."
            className="sm:col-span-2"
          >
            <input
              className={inputClass}
              placeholder="Optional — leave blank if none"
              value={value.diversityClassifications}
              onChange={(e) => set("diversityClassifications", e.target.value)}
            />
          </Field>
          {value.diversityClassifications.trim() ? (
            <div className="sm:col-span-2">
              <DocUpload
                label="Diversity certification (optional)"
                file={docs.diversityCert}
                onChange={(d) => onDocsChange({ ...docs, diversityCert: d })}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* 3. Address */}
      <div className={sectionClass}>
        <SectionTitle icon={SECTION_ICONS.address}>3. Business address</SectionTitle>
        <VerifiedAddressFields
          idPrefix="contractor-biz"
          addressLine1={value.businessAddress}
          addressLine2={value.businessSuite}
          city={value.businessCity}
          state={value.businessState}
          zip={value.businessZip}
          onAddressLine1Change={(v) => set("businessAddress", v)}
          onAddressLine2Change={(v) => set("businessSuite", v)}
          onCityChange={(v) => set("businessCity", v)}
          onStateChange={(v) => set("businessState", v)}
          onZipChange={(v) => set("businessZip", v)}
          initiallyVerified={value.addressVerified === true}
          onVerificationChange={(meta) =>
            onChange({
              ...value,
              addressVerified: meta.addressVerified,
              postalCodePlus4: meta.postalCodePlus4 || null,
            })
          }
        />
      </div>

      {/* 4. Contact */}
      <div className={sectionClass}>
        <SectionTitle icon={SECTION_ICONS.contact}>4. Primary contact</SectionTitle>
        <p className={helpClass}>Who should we reach out to with questions or work orders?</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" required>
            <input
              className={inputClass}
              value={value.contactName}
              onChange={(e) => set("contactName", e.target.value)}
              required
            />
          </Field>
          <Field label="Title / role">
            <input
              className={inputClass}
              placeholder="Optional"
              value={value.contactTitle}
              onChange={(e) => set("contactTitle", e.target.value)}
            />
          </Field>
          <Field label="Email" required>
            <input
              className={inputClass}
              type="email"
              placeholder={accountEmail || undefined}
              value={value.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
              required
            />
          </Field>
          <Field label="Phone" required>
            <input
               className={inputClass}
               type="tel"
               inputMode="tel"
               placeholder="+1 123 456 7890"
               value={value.contactPhone}
               onChange={(e) => {
                 const cleaned = e.target.value
                   .replace(/[^\d+ ]/g, "")
                   .replace(/(?!^)\+/g, "");
               
                 set("contactPhone", cleaned);
               }}
               required
            />
          </Field>
          <Field label="Type" required>
            <select
              className={inputClass}
              value={value.contactPhoneType}
              onChange={(e) => set("contactPhoneType", e.target.value)}
              required
            >
              <option value="">Choose one…</option>
              {PHONE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Company website">
            <input
              className={inputClass}
              type="url"
              placeholder="https://"
              value={value.website}
              onChange={(e) => set("website", e.target.value)}
            />
          </Field>
        </div>
      </div>

      {/* 5. Documents */}
      <div className={sectionClass}>
        <SectionTitle icon={SECTION_ICONS.documents}>5. Documents</SectionTitle>
        <p className={helpClass}>
          PDF or image, under ~3.5 MB each. Upload documents now or choose &quot;Upload later&quot; — you can submit
          your application even if some documents are still missing. Live dispatch requires verified compliance.
        </p>
        <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 space-y-2">
          <p className="text-sm font-medium">Need help preparing your insurance documents?</p>
          <InsuranceRequirementsLink label="View FixBridge Insurance Requirements / Sample COI" />
        </div>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs space-y-1">
          <p className="font-semibold text-primary">Certificate Holder / Additional Insured legal name</p>
          <p>Liora Creations, Corp. d/b/a FixBridge</p>
          <p className="pt-1 font-semibold text-primary">Temporary COI / legal notice address</p>
          <p>131 Continental Dr, Suite 305, Newark, DE 19713</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <DocUpload
            label="W-9"
            file={docs.w9}
            existingName={existingDocs?.w9}
            onChange={(d) => onDocsChange({ ...docs, w9: d })}
            sampleLink={{ href: W9_FORM_URL, text: "Download blank W-9 (IRS) →" }}
            allowUploadLater
          />
          <DocUpload
            label="Certificate of Insurance (COI)"
            file={docs.insurance}
            existingName={existingDocs?.insurance}
            onChange={(d) => onDocsChange({ ...docs, insurance: d })}
            sampleLink={{
              href: FIXBRIDGE_INSURANCE_REQUIREMENTS_PDF_URL,
              text: "View FixBridge Insurance Requirements / Sample COI →",
            }}
            allowUploadLater
          />
          <DocUpload
            label="Business / Trade License"
            file={docs.license}
            existingName={existingDocs?.license}
            onChange={(d) => onDocsChange({ ...docs, license: d })}
            allowUploadLater
          />
          <DocUpload
            label="Additional Insured — ongoing operations"
            file={docs.aiOngoing}
            existingName={existingDocs?.aiOngoing}
            onChange={(d) => onDocsChange({ ...docs, aiOngoing: d })}
            allowUploadLater
          />
          <DocUpload
            label="Additional Insured — completed operations"
            file={docs.aiCompleted}
            existingName={existingDocs?.aiCompleted}
            onChange={(d) => onDocsChange({ ...docs, aiCompleted: d })}
            allowUploadLater
          />
          <DocUpload
            label="Primary & Non-Contributory Endorsement"
            file={docs.primaryNonContributory}
            existingName={existingDocs?.primaryNonContributory}
            onChange={(d) => onDocsChange({ ...docs, primaryNonContributory: d })}
            allowUploadLater
          />
          <DocUpload
            label="Waiver of Subrogation — General Liability"
            file={docs.glWaiver}
            existingName={existingDocs?.glWaiver}
            onChange={(d) => onDocsChange({ ...docs, glWaiver: d })}
            allowUploadLater
          />
          <DocUpload
            label="Workers' Compensation proof"
            file={docs.workersComp}
            existingName={existingDocs?.workersComp}
            onChange={(d) => onDocsChange({ ...docs, workersComp: d })}
            allowUploadLater
          />
          <DocUpload
            label="Workers' Comp Waiver of Subrogation"
            file={docs.wcWaiver}
            existingName={existingDocs?.wcWaiver}
            onChange={(d) => onDocsChange({ ...docs, wcWaiver: d })}
            allowUploadLater
          />
          <DocUpload
            label="Commercial Auto proof"
            file={docs.commercialAuto}
            existingName={existingDocs?.commercialAuto}
            onChange={(d) => onDocsChange({ ...docs, commercialAuto: d })}
            allowUploadLater
          />
          <DocUpload
            label="Umbrella / Excess coverage"
            file={docs.umbrellaExcess}
            existingName={existingDocs?.umbrellaExcess}
            onChange={(d) => onDocsChange({ ...docs, umbrellaExcess: d })}
            allowUploadLater
          />
          <DocUpload
            label="Solo Owner / No Employees Acknowledgment"
            file={docs.soloOwnerAck}
            existingName={existingDocs?.soloOwnerAck}
            onChange={(d) => onDocsChange({ ...docs, soloOwnerAck: d })}
            allowUploadLater
          />
        </div>
      </div>

      {/* 6. Trades */}
      <div className={sectionClass}>
        <SectionTitle icon={SECTION_ICONS.trades}>6. Trades you cover <span className="text-primary">*</span></SectionTitle>
        <p className={helpClass}>
          You can select multiple trades — choose all that apply. Tap a trade again to deselect. At least one is
          required.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PRIMARY_SERVICES.map((svc) => (
            <ChipToggle
              key={svc}
              label={svc}
              icon={TRADE_ICONS[svc]}
              selected={value.primaryServices.includes(svc)}
              onToggle={() => toggleIn("primaryServices", svc)}
            />
          ))}
        </div>
        {value.primaryServices.length > 0 ? (
          <p className="text-[11px] font-medium text-primary">
            {value.primaryServices.length} trade{value.primaryServices.length === 1 ? "" : "s"} selected
            {value.primaryServices.length === 1 ? " — add more if you cover additional services" : ""}
          </p>
        ) : null}
        <Field label="Services description">
          <textarea
            className={`${inputClass} min-h-[72px]`}
            placeholder="Briefly describe the work you specialize in…"
            value={value.servicesDescription}
            onChange={(e) => set("servicesDescription", e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Emergency / after-hours service?">
            <YesNoSelect
              value={value.emergencyAfterHours}
              onChange={(v) => set("emergencyAfterHours", v)}
            />
          </Field>
          <Field label="Preventive maintenance available?">
            <YesNoSelect
              value={value.preventiveMaintenance}
              onChange={(v) => set("preventiveMaintenance", v)}
            />
          </Field>
        </div>
      </div>

      {/* 7. Service areas */}
      <div className={sectionClass}>
        <SectionTitle icon={SECTION_ICONS.serviceAreas}>7. Service areas</SectionTitle>
        <p className={helpClass}>
          Add the ZIP codes you cover and your max travel radius. Job matching uses ZIP coverage — no statewide map needed.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 pt-1">
          <Field label="Primary ZIP codes" required className="sm:col-span-2">
            <input
              className={inputClass}
              placeholder="Comma-separated 5-digit ZIP codes"
              value={value.serviceZips}
              onChange={(e) => set("serviceZips", e.target.value)}
              required
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Comma-separated 5-digit US ZIP codes.</p>
          </Field>
          <Field label="Maximum service radius (miles)" required>
            <input
              className={inputClass}
              type="number"
              min={1}
              value={value.maxServiceRadius}
              onChange={(e) => set("maxServiceRadius", e.target.value)}
              required
            />
          </Field>
          <Field label="Available days">
            <input
              className={inputClass}
              placeholder="e.g. weekdays, weekends by appointment"
              value={value.availableDays}
              onChange={(e) => set("availableDays", e.target.value)}
            />
          </Field>
          <Field label="Number of field technicians" required>
            <select
              className={inputClass}
              value={value.companySize}
              onChange={(e) => set("companySize", e.target.value)}
              required
            >
              <option value="">Choose one…</option>
              {["1", "2–5", "6–10", "11–25", "26–50", "50+"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Emergency availability" className="sm:col-span-2">
            <input
              className={inputClass}
              placeholder="e.g. evenings, weekends"
              value={value.emergencyAvailability}
              onChange={(e) => set("emergencyAvailability", e.target.value)}
            />
          </Field>
        </div>
      </div>

      {/* 8. Licensing & insurance (FixBridge) */}
      <div className={sectionClass}>
        <SectionTitle icon={SECTION_ICONS.licensing}>8. Licensing &amp; insurance</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Contractor license number">
            <input
              className={inputClass}
              value={value.licenseNumber}
              onChange={(e) => set("licenseNumber", e.target.value)}
            />
          </Field>
          <Field label="License state">
            <select
              className={inputClass}
              value={value.licenseState}
              onChange={(e) => set("licenseState", e.target.value)}
            >
              <option value="">…</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code}
                </option>
              ))}
            </select>
          </Field>
          <Field label="License expiration" required={Boolean(value.licenseNumber.trim())}>
            <input
              className={inputClass}
              type="date"
              value={value.licenseExpiration}
              onChange={(e) => set("licenseExpiration", e.target.value)}
              required={Boolean(value.licenseNumber.trim())}
            />
          </Field>
          <Field label="General liability insurance?" required>
            <YesNoSelect
              value={value.generalLiability}
              onChange={(v) => set("generalLiability", v)}
              required
            />
          </Field>
          <Field label="Coverage amount" required={value.generalLiability === "yes"}>
            <input
              className={inputClass}
              placeholder="Enter coverage amount"
              value={value.coverageAmount}
              onChange={(e) => set("coverageAmount", e.target.value)}
              required={value.generalLiability === "yes"}
            />
          </Field>
          <Field label="Insurance expiration" required={value.generalLiability === "yes"}>
            <input
              className={inputClass}
              type="date"
              value={value.insuranceExpiration}
              onChange={(e) => set("insuranceExpiration", e.target.value)}
              required={value.generalLiability === "yes"}
            />
          </Field>
          <Field label="Workers' compensation?" required>
            <YesNoSelect value={value.workersComp} onChange={(v) => set("workersComp", v)} required />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <DocUpload
            label="License document"
            required={mode === "signup" && Boolean(value.licenseNumber.trim())}
            file={docs.license}
            existingName={existingDocs?.license}
            onChange={(d) => onDocsChange({ ...docs, license: d })}
          />
          <DocUpload
            label="Government ID"
            file={docs.idDoc}
            existingName={existingDocs?.idDoc}
            onChange={(d) => onDocsChange({ ...docs, idDoc: d })}
          />
        </div>
      </div>

      {/* 9. Experience & pricing */}
      <div className={sectionClass}>
        <SectionTitle icon={SECTION_ICONS.experience}>9. Experience &amp; pricing</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <Field label="Years of facility maintenance experience" required>
            <input
              className={inputClass}
              type="number"
              min={0}
              value={value.facilityYears}
              onChange={(e) => set("facilityYears", e.target.value)}
              required
            />
          </Field>
          <Field label="Commercial experience?" required>
            <YesNoSelect
              value={value.commercialExperience}
              onChange={(v) => set("commercialExperience", v)}
              required
            />
          </Field>
          <Field label="Property management experience?">
            <YesNoSelect
              value={value.propertyMgmtExperience}
              onChange={(v) => set("propertyMgmtExperience", v)}
            />
          </Field>
          <Field label="Standard hourly rate ($)" required>
            <input
              className={inputClass}
              type="number"
              min={0}
              step="0.01"
              value={value.standardHourlyRate}
              onChange={(e) => set("standardHourlyRate", e.target.value)}
              required
            />
          </Field>
          <Field label="Emergency hourly rate ($)">
            <input
              className={inputClass}
              type="number"
              min={0}
              step="0.01"
              value={value.emergencyHourlyRate}
              onChange={(e) => set("emergencyHourlyRate", e.target.value)}
            />
          </Field>
          <Field label="Service / trip fee ($)">
            <input
              className={inputClass}
              type="number"
              min={0}
              step="0.01"
              value={value.tripFee}
              onChange={(e) => set("tripFee", e.target.value)}
            />
          </Field>
          <Field label="Material markup %">
            <input
              className={inputClass}
              type="number"
              min={0}
              step="0.1"
              value={value.materialMarkup}
              onChange={(e) => set("materialMarkup", e.target.value)}
            />
          </Field>
          <Field label="Minimum service charge ($)">
            <input
              className={inputClass}
              type="number"
              min={0}
              step="0.01"
              value={value.minimumServiceCharge}
              onChange={(e) => set("minimumServiceCharge", e.target.value)}
            />
          </Field>
          <Field label="Background checks available?">
            <YesNoSelect
              value={value.backgroundChecks}
              onChange={(v) => set("backgroundChecks", v)}
            />
          </Field>
          <Field label="Previous clients / references" className="sm:col-span-2 md:col-span-3">
            <textarea
              className={`${inputClass} min-h-[64px]`}
              value={value.previousClients}
              onChange={(e) => set("previousClients", e.target.value)}
            />
          </Field>
          <Field label="Reference contact information" className="sm:col-span-2 md:col-span-3">
            <textarea
              className={`${inputClass} min-h-[64px]`}
              value={value.referenceContacts}
              onChange={(e) => set("referenceContacts", e.target.value)}
            />
          </Field>
          <Field label="Safety training / certifications" className="sm:col-span-2 md:col-span-3">
            <input
              className={inputClass}
              value={value.safetyTraining}
              onChange={(e) => set("safetyTraining", e.target.value)}
            />
          </Field>
        </div>
      </div>

      {/* 9b. Onboarding documents */}
      <div className={sectionClass}>
        <SectionTitle icon={SECTION_ICONS.attestation}>Documents to review</SectionTitle>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Open each document before signing. Version and effective date are shown from the current published legal record.
        </p>
        <ContractorApplicationLegalDocs />
      </div>

      {/* 10. Attestation */}
      <div className={sectionClass}>
        <SectionTitle icon={SECTION_ICONS.attestation}>10. Attestation</SectionTitle>
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={value.agreeAccurate}
            onChange={(e) => set("agreeAccurate", e.target.checked)}
            required={mode === "signup"}
            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-xs text-foreground leading-relaxed">
            I certify the information above is accurate and I am authorized to submit it on behalf of my
            company. <Req />
          </span>
        </label>
        {mode === "signup" ? (
          <p className="text-[11px] text-muted-foreground pl-6">
            FixBridge Contractor Agreement Package v4 acceptance is required in the Agreement &amp; Compliance
            section before submission.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ContractorApplicationLegalDocs() {
  const [meta, setMeta] = useState<Record<string, { version: string; effectiveDate?: string }>>({});

  useEffect(() => {
    for (const item of CONTRACTOR_APPLICATION_DOCUMENTS) {
      if (!item.key) continue;
      void fetchPublicLegalDocument(item.key).then((r) => {
        if (r.ok && r.document) {
          setMeta((prev) => ({
            ...prev,
            [item.key!]: { version: r.document!.version, effectiveDate: r.document!.effectiveDate },
          }));
        }
      });
    }
  }, []);

  return (
    <ul className="space-y-2">
      {CONTRACTOR_APPLICATION_DOCUMENTS.map((item) => {
        const href =
          item.key === "INSURANCE_REQUIREMENTS"
            ? FIXBRIDGE_INSURANCE_REQUIREMENTS_PDF_URL
            : item.key === "CONTRACTOR_AGREEMENT"
              ? FIXBRIDGE_CONTRACTOR_AGREEMENT_V4_PDF_URL
              : item.externalHref || (item.key ? LEGAL_ROUTES[item.key] : "#");
        const m = item.key ? meta[item.key] : null;
        return (
          <li
            key={`${item.label}-${item.key || item.externalHref}`}
            className="flex flex-col gap-1 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-medium">{item.label}</p>
              {m ? (
                <p className="text-[11px] text-muted-foreground">
                  Version {m.version}
                  {m.effectiveDate ? ` · Effective ${formatLegalDate(m.effectiveDate)}` : ""}
                </p>
              ) : item.key ? (
                <p className="text-[11px] text-muted-foreground">Loading version…</p>
              ) : null}
            </div>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Open <UilExternalLinkAlt className="h-3.5 w-3.5" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
