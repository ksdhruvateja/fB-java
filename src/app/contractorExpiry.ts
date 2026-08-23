/** Contractor credential expiry helpers. */

export type ExpirySeverity = "expired" | "critical" | "warning" | "ok" | "missing";

export type CredentialExpiryItem = {
  id: "license" | "insurance";
  label: string;
  expiresAt: string | null;
  daysLeft: number | null;
  severity: ExpirySeverity;
  message: string;
};

const WARN_DAYS = 45;
const CRITICAL_DAYS = 14;

function parseDateOnly(raw?: string | null): Date | null {
  if (!raw) return null;
  const s = String(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

export function formatExpiryDate(raw?: string | null): string {
  const d = parseDateOnly(raw);
  if (!d) return "Not set";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function evaluateCredentialExpiry(
  label: string,
  id: "license" | "insurance",
  expiresAt?: string | null,
  opts?: { required?: boolean }
): CredentialExpiryItem {
  const required = opts?.required !== false;
  const d = parseDateOnly(expiresAt);
  if (!d) {
    return {
      id,
      label,
      expiresAt: null,
      daysLeft: null,
      severity: required ? "missing" : "ok",
      message: required ? `${label} expiration date is missing.` : `${label} has no expiration on file.`,
    };
  }
  const daysLeft = daysUntil(d);
  const formatted = formatExpiryDate(expiresAt);
  if (daysLeft < 0) {
    return {
      id,
      label,
      expiresAt: String(expiresAt).slice(0, 10),
      daysLeft,
      severity: "expired",
      message: `${label} expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} ago (${formatted}).`,
    };
  }
  if (daysLeft <= CRITICAL_DAYS) {
    return {
      id,
      label,
      expiresAt: String(expiresAt).slice(0, 10),
      daysLeft,
      severity: "critical",
      message: `${label} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (${formatted}). Update it now.`,
    };
  }
  if (daysLeft <= WARN_DAYS) {
    return {
      id,
      label,
      expiresAt: String(expiresAt).slice(0, 10),
      daysLeft,
      severity: "warning",
      message: `${label} expires in ${daysLeft} days (${formatted}).`,
    };
  }
  return {
    id,
    label,
    expiresAt: String(expiresAt).slice(0, 10),
    daysLeft,
    severity: "ok",
    message: `${label} is current through ${formatted}.`,
  };
}

export function getContractorExpiryAlerts(user: {
  licenseNumber?: string | null;
  licenseExpiresAt?: string | null;
  insuranceExpiresAt?: string | null;
  insuranceDocumentName?: string | null;
  contractorApplication?: {
    licenseNumber?: string;
    licenseExpiration?: string;
    insuranceExpiration?: string;
    generalLiability?: string;
  } | null;
}): CredentialExpiryItem[] {
  const app = user.contractorApplication || {};
  const licenseNumber = String(app.licenseNumber || user.licenseNumber || "").trim();
  const licenseExp = app.licenseExpiration || user.licenseExpiresAt || null;
  const insuranceExp = app.insuranceExpiration || user.insuranceExpiresAt || null;
  const hasInsurance =
    app.generalLiability === "yes" || Boolean(user.insuranceDocumentName) || Boolean(insuranceExp);

  const items: CredentialExpiryItem[] = [];
  if (licenseNumber || licenseExp) {
    items.push(evaluateCredentialExpiry("Contractor license", "license", licenseExp, { required: true }));
  }
  if (hasInsurance) {
    items.push(evaluateCredentialExpiry("Liability insurance", "insurance", insuranceExp, { required: true }));
  }
  return items.filter((i) => i.severity === "expired" || i.severity === "critical" || i.severity === "warning" || i.severity === "missing");
}

export type AdminCredentialAlert = {
  contractorId: number;
  contractorName: string;
  contractorEmail?: string;
  company?: string;
  items: CredentialExpiryItem[];
  worst: ExpirySeverity;
};

const SEVERITY_RANK: Record<ExpirySeverity, number> = {
  expired: 0,
  missing: 1,
  critical: 2,
  warning: 3,
  ok: 4,
};

function worstSeverity(items: CredentialExpiryItem[]): ExpirySeverity {
  return items.reduce<ExpirySeverity>((worst, item) => {
    return SEVERITY_RANK[item.severity] < SEVERITY_RANK[worst] ? item.severity : worst;
  }, "ok");
}

/** Build admin-facing credential alerts across all contractors. */
export function listAdminCredentialAlerts(
  contractors: Array<{
    id?: string | number;
    name?: string;
    email?: string;
    companyName?: string;
    licenseNumber?: string | null;
    licenseExpiresAt?: string | null;
    insuranceExpiresAt?: string | null;
    insuranceDocumentName?: string | null;
    contractorApplication?: Record<string, unknown> | null;
  }>
): AdminCredentialAlert[] {
  const out: AdminCredentialAlert[] = [];
  for (const c of contractors) {
    const id = Number(c.id);
    if (!Number.isFinite(id)) continue;
    const app = (c.contractorApplication || {}) as {
      licenseNumber?: string;
      licenseExpiration?: string;
      insuranceExpiration?: string;
      generalLiability?: string;
      legalBusinessName?: string;
    };
    const items = getContractorExpiryAlerts({
      licenseNumber: c.licenseNumber,
      licenseExpiresAt: c.licenseExpiresAt,
      insuranceExpiresAt: c.insuranceExpiresAt,
      insuranceDocumentName: c.insuranceDocumentName,
      contractorApplication: app,
    });
    if (!items.length) continue;
    out.push({
      contractorId: id,
      contractorName: c.name || `Contractor #${id}`,
      contractorEmail: c.email,
      company:
        (typeof app.legalBusinessName === "string" && app.legalBusinessName) ||
        c.companyName ||
        undefined,
      items,
      worst: worstSeverity(items),
    });
  }
  return out.sort((a, b) => SEVERITY_RANK[a.worst] - SEVERITY_RANK[b.worst] || a.contractorName.localeCompare(b.contractorName));
}

export function expiryBadgeClass(severity: ExpirySeverity): string {
  switch (severity) {
    case "expired":
    case "missing":
      return "bg-red-500/15 text-red-700 dark:text-red-300";
    case "critical":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "warning":
      return "bg-orange-500/10 text-orange-800 dark:text-orange-300";
    default:
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
}

export function expiryLabel(severity: ExpirySeverity): string {
  switch (severity) {
    case "expired":
      return "Expired";
    case "missing":
      return "Missing date";
    case "critical":
      return "Expiring soon";
    case "warning":
      return "Renew soon";
    default:
      return "Current";
  }
}
