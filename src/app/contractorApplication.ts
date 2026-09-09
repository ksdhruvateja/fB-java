/** Shared contractor application — Broadway-style vendor fields + FixBridge extras. */

import { getContractorExpiryAlerts } from "./contractorExpiry";
import { normalizeContractorServiceName } from "./serviceCatalog";

export const BUSINESS_TYPES = [
  "LLC",
  "S-Corporation",
  "C-Corporation",
  "Sole Proprietor",
  "Partnership",
  "Non-Profit",
  "Other",
] as const;

/** Trades list aligned with commercial facility vendor onboarding. */
export const PRIMARY_SERVICES = [
  "Appliances",
  "Awnings",
  "Carpentry",
  "Concrete and Asphalt",
  "Doors and Hardware",
  "Electrical",
  "Environmental",
  "Equipment",
  "Finishes and Fixtures",
  "Fire Life Safety",
  "Flooring",
  "Gates and Fences",
  "General Contractor",
  "Handyman",
  "HVAC",
  "Cleaning",
  "Landscaping",
  "Lighting",
  "Locks",
  "Painting",
  "Pest Control",
  "Plumbing",
  "Professional Services",
  "Refrigeration",
  "Roofing and Siding",
  "Security",
  "Signage",
  "Snow Removal",
  "Technology",
  "Temporary Protection",
  "Waste Management",
  "Welding",
  "Windows and Glass",
] as const;

export const US_STATES: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "PR", name: "Puerto Rico" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

export const PHONE_TYPES = ["Office", "Mobile", "Other"] as const;
export const UNION_OPTIONS = ["Union", "Non-Union"] as const;

export const W9_FORM_URL = "https://www.irs.gov/pub/irs-pdf/fw9.pdf";
export const COI_SAMPLE_URL = "/samples/coi-sample.html";
/** Official FixBridge Insurance Requirements PDF (contractor / insurance agent guide). */
export const FIXBRIDGE_INSURANCE_REQUIREMENTS_PDF_URL = "/documents/fixbridge-insurance-requirements.pdf";
export const INSURANCE_REQUIREMENTS_URL = FIXBRIDGE_INSURANCE_REQUIREMENTS_PDF_URL;
/** Official FixBridge Contractor Agreement Package v4 PDF. */
export const FIXBRIDGE_CONTRACTOR_AGREEMENT_V4_PDF_URL =
  "/documents/fixbridge-contractor-agreement-package-v4.pdf";
export const CONTRACTOR_AGREEMENT_V4_LABEL = "FixBridge Contractor Agreement Package v4";

export type YesNo = "yes" | "no" | "";
export type TaxIdType = "ein" | "ssn";

export type ContractorApplication = {
  legalBusinessName: string;
  dbaTradeName: string;
  businessType: string;
  taxIdType: TaxIdType;
  ein: string;
  unionStatus: string;
  diversityClassifications: string;
  yearsInBusiness: string;

  businessAddress: string;
  businessSuite: string;
  businessCity: string;
  businessState: string;
  businessZip: string;
  addressVerified?: boolean;
  postalCodePlus4?: string | null;

  companyPhone: string;
  companyEmail: string;
  website: string;

  contactName: string;
  contactTitle: string;
  contactPhone: string;
  contactPhoneType: string;
  contactEmail: string;

  primaryServices: string[];
  serviceStates: string[];
  serviceZips: string;
  maxServiceRadius: string;
  availableDays: string;
  emergencyAvailability: string;
  servicesDescription: string;
  emergencyAfterHours: YesNo;
  preventiveMaintenance: YesNo;
  /** Field tech headcount band — set at signup or in Team */
  companySize: string;

  licenseNumber: string;
  licenseState: string;
  licenseExpiration: string;
  generalLiability: YesNo;
  coverageAmount: string;
  insuranceExpiration: string;
  workersComp: YesNo;

  facilityYears: string;
  commercialExperience: YesNo;
  propertyMgmtExperience: YesNo;
  previousClients: string;
  referenceContacts: string;

  standardHourlyRate: string;
  emergencyHourlyRate: string;
  tripFee: string;
  materialMarkup: string;
  minimumServiceCharge: string;

  backgroundChecks: YesNo;
  safetyTraining: string;
  certifications: string;
  agreeTerms: boolean;
  agreeContractorAgreementV4: boolean;
  agreeAccurate: boolean;
};

export type ApplicationDoc = { name: string; data: string } | null;

export function emptyContractorApplication(
  defaults?: Partial<ContractorApplication>
): ContractorApplication {
  return {
    legalBusinessName: "",
    dbaTradeName: "",
    businessType: "",
    taxIdType: "ein",
    ein: "",
    unionStatus: "",
    diversityClassifications: "",
    yearsInBusiness: "",
    businessAddress: "",
    businessSuite: "",
    businessCity: "",
    businessState: "",
    businessZip: "",
    companyPhone: "",
    companyEmail: "",
    website: "",
    contactName: "",
    contactTitle: "",
    contactPhone: "",
    contactPhoneType: "",
    contactEmail: "",
    primaryServices: [],
    serviceStates: [],
    serviceZips: "",
    maxServiceRadius: "",
    availableDays: "",
    emergencyAvailability: "",
    servicesDescription: "",
    emergencyAfterHours: "",
    preventiveMaintenance: "",
    companySize: "",
    licenseNumber: "",
    licenseState: "",
    licenseExpiration: "",
    generalLiability: "",
    coverageAmount: "",
    insuranceExpiration: "",
    workersComp: "",
    facilityYears: "",
    commercialExperience: "",
    propertyMgmtExperience: "",
    previousClients: "",
    referenceContacts: "",
    standardHourlyRate: "",
    emergencyHourlyRate: "",
    tripFee: "",
    materialMarkup: "",
    minimumServiceCharge: "",
    backgroundChecks: "",
    safetyTraining: "",
    certifications: "",
    agreeTerms: false,
    agreeContractorAgreementV4: false,
    agreeAccurate: false,
    ...defaults,
  };
}

function dateOnly(value?: string | null): string {
  if (!value) return "";
  return String(value).slice(0, 10);
}

export function applicationFromUser(user: {
  name?: string;
  email?: string;
  phone?: string;
  trade?: string;
  licenseNumber?: string;
  licenseExpiresAt?: string | null;
  insuranceExpiresAt?: string | null;
  companyName?: string;
  address?: string;
  addressVerified?: boolean;
  postalCodePlus4?: string | null;
  contactEmail?: string;
  serviceZips?: string[] | null;
  visitFee?: number | null;
  emergencyVisitFee?: number | null;
  minimumLaborFee?: number | null;
  contractorApplication?: Partial<ContractorApplication> | null;
}): ContractorApplication {
  const saved = user.contractorApplication || {};
  const zips =
    typeof saved.serviceZips === "string" && saved.serviceZips
      ? saved.serviceZips
      : Array.isArray(user.serviceZips)
        ? user.serviceZips.join(", ")
        : "";
  return emptyContractorApplication({
    legalBusinessName: saved.legalBusinessName || user.companyName || "",
    contactName: saved.contactName || user.name || "",
    contactEmail: saved.contactEmail || user.contactEmail || user.email || "",
    contactPhone: saved.contactPhone || user.phone || "",
    companyEmail: saved.companyEmail || user.email || "",
    companyPhone: saved.companyPhone || user.phone || "",
    businessAddress: saved.businessAddress || user.address || "",
    addressVerified: saved.addressVerified ?? user.addressVerified ?? false,
    postalCodePlus4: saved.postalCodePlus4 ?? user.postalCodePlus4 ?? null,
    primaryServices: (
      Array.isArray(saved.primaryServices) && saved.primaryServices.length
        ? saved.primaryServices
        : user.trade
          ? String(user.trade).split(/,\s*/)
          : []
    )
      .map((s) => normalizeContractorServiceName(String(s).trim()))
      .filter(Boolean)
      .filter((s, i, arr) => arr.indexOf(s) === i),
    serviceStates: Array.isArray(saved.serviceStates) ? saved.serviceStates : [],
    standardHourlyRate:
      saved.standardHourlyRate ||
      (user.minimumLaborFee != null ? String(user.minimumLaborFee) : ""),
    tripFee: saved.tripFee || (user.visitFee != null ? String(user.visitFee) : ""),
    emergencyHourlyRate:
      saved.emergencyHourlyRate ||
      (user.emergencyVisitFee != null ? String(user.emergencyVisitFee) : ""),
    ...saved,
    licenseNumber: saved.licenseNumber || user.licenseNumber || "",
    licenseExpiration: dateOnly(saved.licenseExpiration) || dateOnly(user.licenseExpiresAt),
    insuranceExpiration: dateOnly(saved.insuranceExpiration) || dateOnly(user.insuranceExpiresAt),
    serviceZips: zips || (typeof saved.serviceZips === "string" ? saved.serviceZips : "") || "",
  });
}

/** Mandatory fields for initial contractor application. */
export function validateContractorApplication(
  app: ContractorApplication,
  docs: {
    w9?: ApplicationDoc;
    license?: ApplicationDoc;
    insurance?: ApplicationDoc;
    businessRegistration?: ApplicationDoc;
    businessLicense?: ApplicationDoc;
    existingW9?: boolean;
    existingLicense?: boolean;
    existingInsurance?: boolean;
  } = {}
): string | null {
  const req = (v: string, label: string) => {
    if (!String(v || "").trim()) return `${label} is required.`;
    return null;
  };

  const checks = [
    req(app.legalBusinessName, "Legal company name"),
    req(app.businessType, "Entity type"),
    req(app.ein, "Tax ID"),
    req(app.unionStatus, "Union or Non-Union"),
    req(app.yearsInBusiness, "Years in business"),
    req(app.businessAddress, "Street address"),
    req(app.businessCity, "City"),
    req(app.businessState, "State"),
    req(app.businessZip, "ZIP"),
    req(app.contactName, "Primary contact name"),
    req(app.contactEmail, "Contact email"),
    req(app.contactPhone, "Contact phone"),
    req(app.contactPhoneType, "Phone type"),
    app.primaryServices.length ? null : "Select at least one trade.",
    req(app.serviceZips, "Primary service ZIP codes"),
    (() => {
      const zips = app.serviceZips
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!zips.length) return "Add at least one service ZIP code.";
      const bad = zips.find((z) => !/^\d{5}(-\d{4})?$/.test(z));
      return bad ? `Invalid ZIP code: ${bad}` : null;
    })(),
    req(app.maxServiceRadius, "Maximum service radius"),
    req(app.companySize, "Number of field technicians"),
    req(app.generalLiability, "General liability insurance status"),
    app.generalLiability === "yes" ? req(app.coverageAmount, "Coverage amount") : null,
    req(app.workersComp, "Workers' compensation status"),
    req(app.facilityYears, "Years of facility maintenance experience"),
    req(app.commercialExperience, "Commercial experience"),
    req(app.standardHourlyRate, "Standard hourly rate"),
    app.agreeAccurate
      ? null
      : "You must certify the information is accurate and you are authorized to submit it.",
    app.agreeContractorAgreementV4
      ? null
      : "You must review and accept the FixBridge Contractor Agreement Package v4.",
  ];

  for (const msg of checks) {
    if (msg) return msg;
  }

  if (app.licenseNumber.trim() && !app.licenseExpiration.trim()) {
    return "License expiration date is required when a license number is provided.";
  }
  if (app.generalLiability === "yes" && !app.insuranceExpiration.trim()) {
    return "Insurance expiration date is required when you carry general liability.";
  }

  return null;
}

/** Gaps admins can email contractors about (docs, required fields, credentials). */
export function listContractorMissingInfo(user: {
  name?: string;
  email?: string;
  phone?: string;
  licenseNumber?: string | null;
  licenseExpiresAt?: string | null;
  insuranceExpiresAt?: string | null;
  insuranceDocumentName?: string | null;
  licenseDocumentName?: string | null;
  w9DocumentName?: string | null;
  idDocumentName?: string | null;
  contractorApplication?: Partial<ContractorApplication> | null;
}): string[] {
  const app = applicationFromUser(user);
  const missing: string[] = [];

  const need = (ok: boolean, label: string) => {
    if (!ok) missing.push(label);
  };

  need(Boolean(app.legalBusinessName.trim()), "Legal company name");
  need(Boolean(app.businessType.trim()), "Entity type");
  need(Boolean(app.ein.trim()), "Tax ID (EIN/SSN)");
  need(Boolean(app.unionStatus.trim()), "Union / Non-Union status");
  need(Boolean(app.yearsInBusiness.trim()), "Years in business");
  need(Boolean(app.businessAddress.trim()), "Business street address");
  need(Boolean(app.businessCity.trim()), "Business city");
  need(Boolean(app.businessState.trim()), "Business state");
  need(Boolean(app.businessZip.trim()), "Business ZIP");
  need(Boolean(app.contactName.trim()), "Primary contact name");
  need(Boolean(app.contactEmail.trim() || user.email), "Contact email");
  need(Boolean(app.contactPhone.trim() || user.phone), "Contact phone");
  need(app.primaryServices.length > 0, "At least one trade");
  need(Boolean(String(app.serviceZips || "").trim()), "Service ZIP codes");
  need(Boolean(app.maxServiceRadius.trim()), "Maximum service radius");
  need(Boolean(app.companySize.trim()), "Number of field technicians");
  need(Boolean(app.generalLiability), "General liability insurance status");
  if (app.generalLiability === "yes") {
    need(Boolean(app.coverageAmount.trim()), "Insurance coverage amount");
    need(Boolean(app.insuranceExpiration.trim() || user.insuranceExpiresAt), "Insurance expiration date");
    need(Boolean(user.insuranceDocumentName), "Certificate of Insurance (COI) upload");
  }
  need(Boolean(app.workersComp), "Workers' compensation status");
  need(Boolean(app.facilityYears.trim()), "Facility maintenance experience (years)");
  need(Boolean(app.commercialExperience), "Commercial experience");
  need(Boolean(app.standardHourlyRate.trim()), "Standard hourly rate");
  need(Boolean(user.w9DocumentName), "W-9 upload");

  if (app.licenseNumber.trim() || user.licenseNumber) {
    need(Boolean(app.licenseExpiration.trim() || user.licenseExpiresAt), "License expiration date");
    need(Boolean(user.licenseDocumentName), "License document upload");
  }

  const expiryAlerts = getContractorExpiryAlerts({
    licenseNumber: user.licenseNumber || app.licenseNumber,
    licenseExpiresAt: user.licenseExpiresAt || app.licenseExpiration,
    insuranceExpiresAt: user.insuranceExpiresAt || app.insuranceExpiration,
    insuranceDocumentName: user.insuranceDocumentName,
    contractorApplication: app,
  });
  for (const item of expiryAlerts) {
    if (item.severity === "expired" || item.severity === "missing" || item.severity === "critical") {
      if (!missing.includes(item.message)) missing.push(item.message);
    }
  }

  return missing;
}

/** Map application into legacy user columns for jobs matching / invites. */
export function applicationToProfileFields(app: ContractorApplication) {
  const zips = app.serviceZips
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const street = [app.businessAddress, app.businessSuite].filter(Boolean).join(", ");
  // Prefer business state when the old statewide picker is unused
  const states =
    app.serviceStates?.length > 0
      ? app.serviceStates
      : app.businessState
        ? [app.businessState]
        : [];
  return {
    name: app.contactName.trim(),
    phone: app.contactPhone.trim() || app.companyPhone.trim(),
    address: [street, app.businessCity, app.businessState, app.businessZip].filter(Boolean).join(", "),
    contactEmail: app.contactEmail.trim() || app.companyEmail.trim(),
    companyName: app.legalBusinessName.trim(),
    companyDetails: [
      app.businessType && `Type: ${app.businessType}`,
      app.taxIdType && app.ein && `${app.taxIdType.toUpperCase()}: ${app.ein}`,
      app.dbaTradeName && `DBA: ${app.dbaTradeName}`,
      app.unionStatus && `Labor: ${app.unionStatus}`,
      app.diversityClassifications && `Diversity: ${app.diversityClassifications}`,
      app.yearsInBusiness && `Years: ${app.yearsInBusiness}`,
      states.length && `States: ${states.join(", ")}`,
      app.website && `Web: ${app.website}`,
    ]
      .filter(Boolean)
      .join(" · "),
    insuranceDetails: [
      app.generalLiability && `GL: ${app.generalLiability}`,
      app.coverageAmount && `Coverage: ${app.coverageAmount}`,
      app.workersComp && `WC: ${app.workersComp}`,
    ]
      .filter(Boolean)
      .join(" · "),
    trade: app.primaryServices.filter(Boolean).join(", ") || "",
    licenseNumber: app.licenseNumber.trim(),
    serviceZips: zips,
    travelRadiusMiles: Number(app.maxServiceRadius) || null,
    visitFee: Number(app.tripFee) || null,
    emergencyVisitFee: Number(app.emergencyHourlyRate) || null,
    minimumLaborFee: Number(app.standardHourlyRate) || null,
  };
}
