export type UserRole = "homeowner" | "contractor" | "admin";

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
};

// ── Session storage keys ──────────────────────────────────────────────────────

const TOKEN_KEY = "fixbridge-auth-token";
const USER_CACHE_KEY = "fixbridge-user-cache";

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
    const raw = window.localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function storeSession(token: string, user: AuthUser) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } catch {
    // Storage can fail in restricted browser modes; keep app usable.
  }
}

export function clearSession() {
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
}): Promise<{ ok: true; user: AuthUser } | { ok: false; message: string }> {
  try {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, message: data.message };
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
): Promise<{ ok: true; user: AuthUser } | { ok: false; message: string }> {
  try {
    const res = await fetch("/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, email, password }),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, message: data.message };
    storeSession(data.token, data.user);
    return { ok: true, user: data.user };
  } catch {
    return { ok: false, message: "Network error. Please check your connection and try again." };
  }
}

// ── Google OAuth sign-in ──────────────────────────────────────────────────────

export async function signInWithGoogle(
  credential: string,
  role: UserRole,
): Promise<{ ok: true; user: AuthUser } | { ok: false; message: string }> {
  try {
    const data = await post<{ ok: boolean; token?: string; user?: AuthUser; message?: string }>(
      "/api/auth/google",
      { credential, role },
    );
    if (!data.ok || !data.token || !data.user) {
      return { ok: false, message: data.message ?? "Google sign-in failed." };
    }
    storeSession(data.token, data.user);
    return { ok: true, user: data.user };
  } catch {
    return { ok: false, message: "Network error. Please try again." };
  }
}

// ── Sign in with Apple ────────────────────────────────────────────────────────

export async function signInWithApple(
  idToken: string,
  role: UserRole,
  user?: { email?: string; name?: { firstName?: string; lastName?: string } },
): Promise<{ ok: true; user: AuthUser } | { ok: false; message: string }> {
  try {
    const data = await post<{ ok: boolean; token?: string; user?: AuthUser; message?: string }>(
      "/api/auth/apple",
      { idToken, role, user },
    );
    if (!data.ok || !data.token || !data.user) {
      return { ok: false, message: data.message ?? "Apple sign-in failed." };
    }
    storeSession(data.token, data.user);
    return { ok: true, user: data.user };
  } catch {
    return { ok: false, message: "Network error. Please try again." };
  }
}

// ── Auth0 sign-in ─────────────────────────────────────────────────────────────

export async function signInWithAuth0(
  accessToken: string,
  role: UserRole,
): Promise<{ ok: true; user: AuthUser } | { ok: false; message: string }> {
  try {
    const data = await post<{ ok: boolean; token?: string; user?: AuthUser; message?: string }>(
      "/api/auth/auth0",
      { accessToken, role },
    );
    if (!data.ok || !data.token || !data.user) {
      return { ok: false, message: data.message ?? "Auth0 sign-in failed." };
    }
    storeSession(data.token, data.user);
    return { ok: true, user: data.user };
  } catch {
    return { ok: false, message: "Network error. Please try again." };
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
    storeSession(typeof data.token === "string" && data.token ? data.token : token, data.user);
    return { ok: true, user: data.user };
  } catch {
    return { ok: false, message: "Network error. Please try again." };
  }
}

// ── Password reset ────────────────────────────────────────────────────────────

export async function forgotPassword(
  email: string,
  role: UserRole,
): Promise<{ ok: boolean; message?: string }> {
  return post("/api/auth/forgot-password", { email, role });
}

export async function resetPassword(
  token: string,
  role: UserRole,
  password: string,
): Promise<{ ok: boolean; message?: string }> {
  return post("/api/auth/reset-password", { token, role, password });
}

// ── Validate existing token (called on app startup) ──────────────────────────

export async function validateToken(): Promise<
  { ok: true; user: AuthUser } | { ok: false; reason?: "no-token" | "invalid" | "network" }
> {
  const token = getStoredToken();
  if (!token) return { ok: false, reason: "no-token" };
  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data.ok) {
      clearSession();
      return { ok: false, reason: "invalid" };
    }
    storeSession(token, data.user);
    return { ok: true, user: data.user };
  } catch {
    // Network / transient API failure — keep the cached session so a blip
    // does not wipe auth and bounce the user to the marketing home page.
    const cached = getStoredUser();
    if (cached) return { ok: true, user: cached };
    return { ok: false, reason: "network" };
  }
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

/** Sync helper — returns a plausible demo user object for pre-filling login forms. */
export function getDemoUser(role: UserRole): AuthUser {
  if (role === "homeowner") {
    return { role, name: "Maria Santos", email: "maria@example.com", password: "demo123" };
  }
  if (role === "admin") {
    return {
      role: "admin",
      name: "Ops Admin",
      email: "admin@fixbridge.local",
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
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  contactName: string;
  contactPhone: string;
  email: string;
}): Promise<{ ok: true; user: AuthUser; job: any } | { ok: false; message: string }> {
  try {
    const res = await fetch("/api/public/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobData),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, message: data.message };
    storeSession(data.token, data.user);
    return { ok: true, user: data.user, job: data.job };
  } catch {
    return { ok: false, message: "Network error. Please check your connection and try again." };
  }
}
