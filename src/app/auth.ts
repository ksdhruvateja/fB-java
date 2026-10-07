export type UserRole = "homeowner" | "contractor" | "admin";
export type ResetRole = UserRole | "partner";

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

// ── Session storage keys ──────────────────────────────────────────────────────

const TOKEN_KEY = "fixbridge-auth-token";
const USER_CACHE_KEY = "fixbridge-user-cache";
let sessionRevision = 0;
function validSessionUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== "object") return false;
  const user = value as AuthUser;
  return ["homeowner", "contractor", "admin"].includes(user.role) && !!user.id && typeof user.email === "string" && typeof user.name === "string";
}

function canUseStorage() {
  if (typeof window === "undefined") return false;
  try {
    return typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

export function getStoredToken(): string | null {
  if (!canUseStorage()) return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  if (!canUseStorage()) return null;
  try {
    if (!getStoredToken()) return null;
    const raw = window.localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw);
    return validSessionUser(user) ? user : null;
  } catch {
    return null;
  }
}

function storeSession(token: string, user: AuthUser) {
  if (typeof token !== "string" || !token.trim() || !validSessionUser(user)) return;
  sessionRevision++;
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } catch {
    // Storage can fail in restricted browser modes; keep app usable.
  }
}

export function saveSession(token: string, user: AuthUser) {
  storeSession(token, user);
}

export function clearSession() {
  sessionRevision++;
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_CACHE_KEY);
  } catch {
    // ignore
  }
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

// ── Sign up ──────────────────────────────────────────────────────────────────

export async function signUpUser(user: {
  role: UserRole;
  name: string;
  email: string;
  password: string;
  trade?: string;
  licenseNumber?: string;
  licenseDocumentName?: string;
  licenseDocumentData?: string;
  insuranceDocumentName?: string;
  insuranceDocumentData?: string;
  idDocumentName?: string;
  idDocumentData?: string;
  w9DocumentName?: string;
  w9DocumentData?: string;
  businessRegistrationName?: string;
  businessRegistrationData?: string;
  businessLicenseName?: string;
  businessLicenseData?: string;
  diversityDocumentName?: string;
  diversityDocumentData?: string;
  contractorApplication?: Record<string, unknown>;
  phone?: string;
  address?: string;
  contactEmail?: string;
  companyName?: string;
  companyDetails?: string;
  insuranceDetails?: string;
  serviceZips?: string[];
  travelRadiusMiles?: number | null;
  visitFee?: number | null;
  emergencyVisitFee?: number | null;
  minimumLaborFee?: number | null;
  afterHoursFee?: number | null;
  weekendFee?: number | null;
  cancellationFee?: number | null;
  freeEstimate?: boolean;
  visitAppliesToRepair?: boolean;
  referredByCode?: string;
  consents?: Record<string, boolean>;
  marketingConsent?: boolean;
  marketingEmailOptIn?: boolean;
  marketingSmsOptIn?: boolean;
}): Promise<{ ok: true; user: AuthUser } | { ok: false; message: string }> {
  try {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) return { ok: false, message: data.message || "Sign-in service is unavailable. Please try again; you do not need another account." };
    if (!validSessionUser(data.user) || typeof data.token !== "string" || !data.token.trim()) return { ok: false, message: "The server could not confirm your sign-in. Please retry." };
    storeSession(data.token, data.user);
    return { ok: true, user: data.user };
  } catch {
    return { ok: false, message: "Network error. Please check your connection and try again." };
  }
}

// ── Sign in ──────────────────────────────────────────────────────────────────

export async function signInUser(
  role: UserRole,
  email: string,
  password: string,
): Promise<
  | { ok: true; user: AuthUser; mfaRequired?: boolean }
  | { ok: false; message: string }
> {
  try {
    const res = await fetch("/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, email, password }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) return { ok: false, message: data.message || "Sign-in service is unavailable. Please try again; you do not need another account." };
    if (!validSessionUser(data.user) || typeof data.token !== "string" || !data.token.trim()) return { ok: false, message: "The server could not confirm your sign-in. Please retry." };
    // Admin MFA-pending tokens are stored so MFA start/verify can authenticate,
    // but they cannot call requireAdmin APIs until MFA completes.
    storeSession(data.token, data.user);
    return {
      ok: true,
      user: data.user,
      mfaRequired: data.mfaRequired === true || role === "admin",
    };
  } catch {
    return { ok: false, message: "Network error. Please check your connection and try again." };
  }
}

// ── Update My Profile ─────────────────────────────────────────────────────────

export async function updateUserProfile(
  fields: Record<string, unknown>,
): Promise<{ ok: true; user: AuthUser } | { ok: false; message: string }> {
  const token = getStoredToken();
  if (!token) return { ok: false, message: "Not signed in." };
  try {
    const res = await fetch("/api/auth/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(fields),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, message: data.message ?? "Could not save profile." };
    if (getStoredToken() !== token) return { ok: false, message: "Your sign-in changed. Reload before saving this profile." };
    storeSession(typeof data.token === "string" && data.token ? data.token : token, data.user);
    return { ok: true, user: data.user };
  } catch {
    return { ok: false, message: "Network error. Please try again." };
  }
}

export async function updateContractorServices(selectedServiceIds: string[]): Promise<{ ok: true; user: AuthUser } | { ok: false; message: string }> {
 const token = getStoredToken();
 if (!token) return { ok: false, message: 'Not signed in.' };
 try {
 const res = await fetch('/api/contractor/service-capabilities', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ selectedServiceIds }) });
 const data = await res.json();
 if (!res.ok || !data.ok) return { ok: false, message: data.message || 'Could not save services.' };
 if (getStoredToken() !== token) return { ok: false, message: 'Your sign-in changed. Reload before saving.' };
 storeSession(token, data.user);
 return { ok: true, user: data.user };
 } catch { return { ok: false, message: 'Network error. Your changes are retained; retry saving.' }; }
}

// ── Password reset ────────────────────────────────────────────────────────────

export async function forgotPassword(
  email: string,
  role: ResetRole,
): Promise<{ ok: boolean; message?: string }> {
  return post("/api/auth/forgot-password", { email, role });
}

export async function resetPassword(
  token: string,
  role: ResetRole,
  password: string,
): Promise<{ ok: boolean; message?: string; code?: string }> {
  return post("/api/auth/reset-password", { token, role, password });
}

// ── Validate existing token (called on app startup) ──────────────────────────

export async function validateToken(options?: { syncCheckout?: boolean }): Promise<
  { ok: true; user: AuthUser; source?: "server" | "cached" } | { ok: false; reason?: "no-token" | "invalid" | "network" | "superseded" }
> {
  const token = getStoredToken();
  if (!token) return { ok: false, reason: "no-token" };
  const revision = sessionRevision;
  const changed = () => sessionRevision !== revision || getStoredToken() !== token;
  const fallback = () => {
    if (changed()) return { ok: false as const, reason: "superseded" as const };
    const cached = getStoredUser();
    return cached ? { ok: true as const, user: cached, source: "cached" as const } : { ok: false as const, reason: "network" as const };
  };
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(options?.syncCheckout ? "/api/auth/me?sync=checkout" : "/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
    });
    if (changed()) return { ok: false, reason: "superseded" };
    // Authentication status is authoritative even when an error body is not JSON.
    if (res.status === 401 || res.status === 403) {
      clearSession();
      return { ok: false, reason: "invalid" };
    }
    if (!res.ok) return fallback();
    const data = await res.json();
    if (changed()) return { ok: false, reason: "superseded" };
    if (!data.ok || !validSessionUser(data.user)) return fallback();
    storeSession(token, data.user);
    return { ok: true, user: data.user, source: "server" };
  } catch { return fallback(); }
  finally { window.clearTimeout(timer); }
}

// ── User list cache (for admin panel and contractor display) ─────────────────

const ALL_USERS_CACHE_KEY = "fixbridge-users";

/** Sync read from the local cache populated by loadAllUsers(). */
export function getStoredUsers(): AuthUser[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(ALL_USERS_CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AuthUser[];
  } catch {
    return [];
  }
}

/** Fetch contractors (or all users for admin) and cache locally.
 *  Returns the loaded list so callers don't depend on a stale cache read. */
export async function loadAllUsers(): Promise<AuthUser[]> {
  const token = getStoredToken();
  if (!token) return getStoredUsers();
  try {
    const cached = getStoredUser();
    if (cached?.role === "homeowner") {
      return [];
    }
    const path = cached?.isAdmin || cached?.role === "admin" ? "/api/admin/users" : "/api/users";
    const res = await fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.users)) return getStoredUsers();
    if (canUseStorage()) {
      window.localStorage.setItem(ALL_USERS_CACHE_KEY, JSON.stringify(data.users));
    }
    return data.users as AuthUser[];
  } catch {
    return getStoredUsers();
  }
}

// ── Demo credentials (shown in UI login hints) ────────────────────────────────

/** Sync helper — returns demo login hints only in non-production dev builds. */
export function getDemoUser(role: UserRole): AuthUser {
  const demoEnabled =
    import.meta.env.DEV ||
    import.meta.env.VITE_ENABLE_DEMO_HINTS === "true" ||
    import.meta.env.VITE_ENABLE_DEMO_USERS === "true";
  if (!demoEnabled) {
    return { role, name: "", email: "", password: "" };
  }
  if (role === "homeowner") {
    return { role, name: "Maria Santos", email: "maria@example.com", password: "demo123" };
  }
  if (role === "admin") {
    return {
      role: "admin",
      name: "Ops Admin",
      email: "admin@fixbridge.com",
      password: "admin123",
      isAdmin: true,
    };
  }
  return { role, name: "James Park", email: "james@yourcompany.com", password: "demo123", trade: "Master Plumber", licenseNumber: "NY-00231847" };
}

export async function createPublicGuestJob(jobData: {
  category: string;
  title?: string;
  description: string;
  mediaDataUrl?: string | null;
  mediaType?: string | null;
  fullAddress?: string;
  streetAddress?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  contactName: string;
  contactPhone: string;
  email: string;
  consents?: Record<string, boolean>;
  marketingConsent?: boolean;
  marketingEmailOptIn?: boolean;
  marketingSmsOptIn?: boolean;
}): Promise<{ ok: true; user: AuthUser; job: any } | { ok: false; message: string }> {
  try {
    const res = await fetch("/api/public/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobData),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) return { ok: false, message: data.message || "Sign-in service is unavailable. Please try again; you do not need another account." };
    if (!validSessionUser(data.user) || typeof data.token !== "string" || !data.token.trim()) return { ok: false, message: "The server could not confirm your sign-in. Please retry." };
    storeSession(data.token, data.user);
    return { ok: true, user: data.user, job: data.job };
  } catch {
    return { ok: false, message: "Network error. Please check your connection and try again." };
  }
}
