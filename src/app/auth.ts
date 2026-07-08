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

const STORAGE_KEY = "fixbridge-users";

const DEMO_USERS: AuthUser[] = [
  {
    role: "homeowner",
    name: "Maria Santos",
    email: "maria@example.com",
    password: "demo123",
  },
  {
    role: "contractor",
    name: "James Park",
    email: "james@yourcompany.com",
    password: "demo123",
    trade: "Master Plumber",
    licenseNumber: "NY-00231847",
  },
];

function canUseStorage() {
  if (typeof window === "undefined") return false;
  try {
    return typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

export function getStoredUsers(): AuthUser[] {
  if (!canUseStorage()) return DEMO_USERS;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return DEMO_USERS;
  }
  if (!raw) {
    saveUsers(DEMO_USERS);
    return DEMO_USERS;
  }

  try {
    const parsed = JSON.parse(raw) as AuthUser[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      saveUsers(DEMO_USERS);
      return DEMO_USERS;
    }
    return parsed;
  } catch {
    saveUsers(DEMO_USERS);
    return DEMO_USERS;
  }
}

function saveUsers(users: AuthUser[]) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  } catch {
    // Storage can fail in restricted browser modes; keep app usable.
  }
}

export function signUpUser(user: AuthUser): { ok: true; user: AuthUser } | { ok: false; message: string } {
  const users = getStoredUsers();
  const existing = users.find(
    (item) => item.role === user.role && item.email.toLowerCase() === user.email.toLowerCase(),
  );

  if (existing) {
    return { ok: false, message: "An account with that email already exists." };
  }

  const normalized = {
    ...user,
    email: user.email.trim().toLowerCase(),
    name: user.name.trim(),
    trade: user.trade?.trim(),
    licenseNumber: user.licenseNumber?.trim(),
  };

  saveUsers([...users, normalized]);
  return { ok: true, user: normalized };
}

export function signInUser(
  role: UserRole,
  email: string,
  password: string,
): { ok: true; user: AuthUser } | { ok: false; message: string } {
  const users = getStoredUsers();
  const match = users.find(
    (user) =>
      user.role === role &&
      user.email.toLowerCase() === email.trim().toLowerCase() &&
      user.password === password,
  );

  if (!match) {
    return {
      ok: false,
      message: "Incorrect email or password. Use the demo login or sign up first.",
    };
  }

  return { ok: true, user: match };
}

export function getDemoUser(role: UserRole) {
  return (
    DEMO_USERS.find((user) => user.role === role) ?? {
      role,
      name: role === "contractor" ? "Contractor Demo" : "Homeowner Demo",
      email: role === "contractor" ? "contractor@example.com" : "homeowner@example.com",
      password: "demo123",
    }
  );
}
