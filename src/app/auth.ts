export type UserRole = "homeowner" | "contractor";

export type AuthUser = {
  id?: string;
  role: UserRole;
  name: string;
  email: string;
  /** Not returned by the server after authentication. Kept for call-site compatibility. */
  password?: string;
  /** True only for users the server has granted admin access. */
  isAdmin?: boolean;
  trade?: string;
  licenseNumber?: string;
  licenseDocumentName?: string;
  insuranceDocumentName?: string;
  idDocumentName?: string;
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
  insuranceDocumentName?: string;
  idDocumentName?: string;
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
    return { ok: false, message: "Network error. Please check your connection and try again." };
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
  { ok: true; user: AuthUser } | { ok: false }
> {
  const token = getStoredToken();
  if (!token) return { ok: false };
  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data.ok) {
      clearSession();
      return { ok: false };
    }
    storeSession(token, data.user);
    return { ok: true, user: data.user };
  } catch {
    // Network error — keep cached user, don't force logout
    return { ok: false };
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

/** Fetch the public contractor list from the server and cache it locally.
 *  Requires a valid session token — skips silently if not logged in yet. */
export async function loadAllUsers(): Promise<void> {
  const token = getStoredToken();
  if (!token) return; // Not authenticated — skip
  try {
    const res = await fetch("/api/users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data.ok || !canUseStorage()) return;
    window.localStorage.setItem(ALL_USERS_CACHE_KEY, JSON.stringify(data.users));
  } catch {
    // Silently ignore — stale cache will be used
  }
}

// ── Demo credentials (shown in UI login hints) ────────────────────────────────

/** Sync helper — returns a plausible demo user object for pre-filling login forms. */
export function getDemoUser(role: UserRole): AuthUser {
  if (role === "homeowner") {
    return { role, name: "Maria Santos", email: "maria@example.com", password: "demo123" };
  }
  return { role, name: "James Park", email: "james@yourcompany.com", password: "demo123", trade: "Master Plumber", licenseNumber: "NY-00231847" };
}
