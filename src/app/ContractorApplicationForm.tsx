import type { ReactNode } from "react";
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
  COI_SAMPLE_URL,
  PHONE_TYPES,
  PRIMARY_SERVICES,
  UNION_OPTIONS,
  US_STATES,
  W9_FORM_URL,
  type ApplicationDoc,
  type ContractorApplication,
  type TaxIdType,
  type YesNo,
} from "./contractorApplication";

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
}: {
  label: string;
  required?: boolean;
  file: ApplicationDoc;
  existingName?: string | null;
  onChange: (doc: ApplicationDoc) => void;
  sampleLink?: { href: string; text: string };
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`${labelClass} inline-flex items-center gap-1.5`}>
          <UilFileUploadAlt size={14} color="currentColor" className="text-primary" />
          {label} {required ? <Req /> : null}
        </span>
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
};

export type ExistingDocs = {
  w9?: string | null;
  license?: string | null;
  insurance?: string | null;
  businessRegistration?: string | null;
  businessLicense?: string | null;
  idDoc?: string | null;
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
              type="number"
              min={0}
              placeholder="Years"
              value={value.yearsInBusiness}
              onChange={(e) => set("yearsInBusiness", e.target.value)}
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
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Street address" required className="sm:col-span-2">
            <input
              className={inputClass}
              value={value.businessAddress}
              onChange={(e) => set("businessAddress", e.target.value)}
              required
            />
          </Field>
          <Field label="Suite / unit">
            <input
              className={inputClass}
              value={value.businessSuite}
              onChange={(e) => set("businessSuite", e.target.value)}
            />
          </Field>
          <Field label="City" required>
            <input
              className={inputClass}
              value={value.businessCity}
              onChange={(e) => set("businessCity", e.target.value)}
              required
            />
          </Field>
          <Field label="State" required>
            <select
              className={inputClass}
              value={value.businessState}
              onChange={(e) => set("businessState", e.target.value)}
              required
            >
              <option value="">…</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ZIP" required>
            <input
              className={inputClass}
              value={value.businessZip}
              onChange={(e) => set("businessZip", e.target.value)}
              required
            />
          </Field>
        </div>
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
              value={value.contactPhone}
              onChange={(e) => set("contactPhone", e.target.value)}
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
          PDF or image, under ~3.5 MB each. Upload your W-9 and Certificate of Insurance now
          {mode === "profile" ? " or replace existing files anytime." : "."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <DocUpload
            label="W-9"
            required={mode === "signup"}
            file={docs.w9}
            existingName={existingDocs?.w9}
            onChange={(d) => onDocsChange({ ...docs, w9: d })}
            sampleLink={{ href: W9_FORM_URL, text: "Download blank W-9 (IRS) →" }}
          />
          <DocUpload
            label="Certificate of Insurance"
            required={mode === "signup" && value.generalLiability === "yes"}
            file={docs.insurance}
            existingName={existingDocs?.insurance}
            onChange={(d) => onDocsChange({ ...docs, insurance: d })}
            sampleLink={{ href: COI_SAMPLE_URL, text: "View a sample marked-up COI →" }}
          />
          <DocUpload
            label="Business registration"
            file={docs.businessRegistration}
            existingName={existingDocs?.businessRegistration}
            onChange={(d) => onDocsChange({ ...docs, businessRegistration: d })}
          />
          <DocUpload
            label="Business license"
            file={docs.businessLicense}
            existingName={existingDocs?.businessLicense}
            onChange={(d) => onDocsChange({ ...docs, businessLicense: d })}
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
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={value.agreeTerms}
            onChange={(e) => set("agreeTerms", e.target.checked)}
            required={mode === "signup"}
            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-xs text-foreground leading-relaxed">
            I agree to {brand.productName} Contractor Terms. <Req />
          </span>
        </label>
      </div>
    </div>
  );
}
