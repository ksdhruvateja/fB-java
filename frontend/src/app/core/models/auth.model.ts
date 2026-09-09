export type UserRole = 'homeowner' | 'contractor' | 'admin';
export type ResetRole = UserRole | 'partner';

/** Authoritative HomeCare Pro subscription state from the server (see /api/auth/me). */
export type HomeCareSubscription = {
  isPro: boolean;
  planCode?: string | null;
  status?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  paymentIssue?: boolean;
  memberLabel?: string | null;
  stripeSubscriptionId?: string;
  simulated?: boolean;
};

export type AuthUser = {
  id?: string | number;
  role: UserRole;
  name: string;
  email: string;
  /** Not returned by the server after authentication. Kept for call-site compatibility. */
  password?: string;
  /** True only for users the server has granted admin access. */
  isAdmin?: boolean;
  trade?: string;
  licenseNumber?: string;
  licenseExpiresAt?: string | null;
  insuranceExpiresAt?: string | null;
  complianceStatus?: string;
  dispatchEligible?: boolean;
  licenseDocumentName?: string;
  insuranceDocumentName?: string;
  idDocumentName?: string;
  licenseDocumentData?: string;
  insuranceDocumentData?: string;
  idDocumentData?: string;
  w9DocumentName?: string;
  w9DocumentData?: string;
  businessRegistrationName?: string;
  businessRegistrationData?: string;
  businessLicenseName?: string;
  businessLicenseData?: string;
  diversityDocumentName?: string;
  diversityDocumentData?: string;
  contractorApplication?: Record<string, unknown> | null;
  photoDataUrl?: string;
  phone?: string;
  address?: string;
  addressVerified?: boolean;
  postalCodePlus4?: string | null;
  addressVerificationProvider?: string | null;
  contactEmail?: string;
  companyName?: string;
  companyDetails?: string;
  insuranceDetails?: string;
  emails?: string[];
  phones?: string[];
  addresses?: string[];
  isBlocked?: boolean;
  isGoogleAccount?: boolean;
  isAppleAccount?: boolean;
  isAuth0Account?: boolean;
  planCode?: string | null;
  /** Server-synced subscription entitlement — authoritative for Pro UI gating. */
  homeCareSubscription?: HomeCareSubscription | null;
  serviceZips?: string[] | null;
  travelRadiusMiles?: number | null;
  visitFee?: number | null;
  emergencyVisitFee?: number | null;
  afterHoursFee?: number | null;
  weekendFee?: number | null;
  cancellationFee?: number | null;
  minimumLaborFee?: number | null;
  freeEstimate?: boolean;
  visitAppliesToRepair?: boolean;
  gender?: string | null;
  dob?: string | null;
  referralCode?: string | null;
  referredByCode?: string | null;
};

export type AuthResult =
  | { ok: true; user: AuthUser; mfaRequired?: boolean; token?: string }
  | { ok: false; message: string };

export type ValidateTokenResult =
  | { ok: true; user: AuthUser }
  | { ok: false; reason?: 'no-token' | 'invalid' | 'network' };

export const AUTH_TOKEN_KEY = 'fixbridge-auth-token';
export const AUTH_USER_CACHE_KEY = 'fixbridge-user-cache';
