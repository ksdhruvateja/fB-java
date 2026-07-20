export type UserRole = "homeowner" | "contractor";

export type AuthUser = {
  role: UserRole;
  name: string;
  email: string;
  password: string;
  trade?: string;
  licenseNumber?: string;
  licenseDocumentName?: string;
  insuranceDocumentName?: string;
  idDocumentName?: string;
};

// ── API helpers ───────────────────────────────────────────────────────────────

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function signInUser(
  role: UserRole,
  email: string,
  password: string,
): Promise<{ ok: true; user: AuthUser } | { ok: false; message: string }> {
  return post("/api/auth/signin", { role, email, password });
}

export async function signUpUser(
  user: AuthUser,
): Promise<{ ok: true; user: AuthUser } | { ok: false; message: string }> {
  return post("/api/auth/signup", user);
}

export async function getStoredUsers(): Promise<AuthUser[]> {
  const res = await fetch("/api/users");
  return res.json();
}

export async function signInWithGoogle(
  credential: string,
  role: UserRole,
): Promise<{ ok: true; user: AuthUser } | { ok: false; message: string }> {
  return post("/api/auth/google", { credential, role });
}

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

/** Sync helper — returns a plausible demo user object for pre-filling login forms. */
export function getDemoUser(role: UserRole): AuthUser {
  if (role === "homeowner") {
    return { role, name: "Maria Santos", email: "maria@example.com", password: "demo123" };
  }
  return { role, name: "James Park", email: "james@yourcompany.com", password: "demo123", trade: "Master Plumber", licenseNumber: "NY-00231847" };
}
