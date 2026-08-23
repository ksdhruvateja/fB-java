/** Shared contractor application — Broadway-style vendor fields + FixBridge extras. */

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
  "Janitorial",
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
  "Snow",
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
export const COI_SAMPLE_URL = "https://vendors.broadwaynational.com/assets/samples/coi-sample.pdf";

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
    contactPhoneType: "Office",
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
    companySize: "2–5",
    licenseNumber: "",
    licenseState: "",
    licenseExpiration: "",
    generalLiability: "",
    coverageAmount: "",
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
    agreeAccurate: false,
    ...defaults,
  };
}

export function applicationFromUser(user: {
  name?: string;
  email?: string;
  phone?: string;
  trade?: string;
  licenseNumber?: string;
  companyName?: string;
  address?: string;
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
    licenseNumber: saved.licenseNumber || user.licenseNumber || "",
    primaryServices:
      Array.isArray(saved.primaryServices) && saved.primaryServices.length
        ? saved.primaryServices
        : user.trade
          ? [user.trade]
          : [],
    serviceStates: Array.isArray(saved.serviceStates) ? saved.serviceStates : [],
    standardHourlyRate:
      saved.standardHourlyRate ||
      (user.minimumLaborFee != null ? String(user.minimumLaborFee) : ""),
    tripFee: saved.tripFee || (user.visitFee != null ? String(user.visitFee) : ""),
    emergencyHourlyRate:
      saved.emergencyHourlyRate ||
      (user.emergencyVisitFee != null ? String(user.emergencyVisitFee) : ""),
    ...saved,
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
    app.serviceStates.length ? null : "Select at least one service state.",
    req(app.serviceZips, "Primary service ZIP codes"),
    req(app.maxServiceRadius, "Maximum service radius"),
    req(app.generalLiability, "General liability insurance status"),
    app.generalLiability === "yes" ? req(app.coverageAmount, "Coverage amount") : null,
    req(app.workersComp, "Workers' compensation status"),
    req(app.facilityYears, "Years of facility maintenance experience"),
    req(app.commercialExperience, "Commercial experience"),
    req(app.standardHourlyRate, "Standard hourly rate"),
    app.agreeAccurate
      ? null
      : "You must certify the information is accurate and you are authorized to submit it.",
    app.agreeTerms ? null : "You must agree to FixBridge Contractor Terms.",
  ];

  for (const msg of checks) {
    if (msg) return msg;
  }

  if (!docs.w9?.data && !docs.existingW9) {
    return "W-9 upload is required.";
  }
  if (!docs.insurance?.data && !docs.existingInsurance && app.generalLiability === "yes") {
    return "Certificate of Insurance (COI) upload is required when you carry general liability.";
  }
  if (app.licenseNumber.trim() && !docs.license?.data && !docs.existingLicense) {
    return "License document upload is required when a license number is provided.";
  }

  return null;
}

/** Map application into legacy user columns for jobs matching / invites. */
export function applicationToProfileFields(app: ContractorApplication) {
  const zips = app.serviceZips
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const street = [app.businessAddress, app.businessSuite].filter(Boolean).join(", ");
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
      app.serviceStates?.length && `States: ${app.serviceStates.join(", ")}`,
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
