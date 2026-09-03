import { getStoredToken } from "./auth";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data as T;
}

export type ContractorAvailability = {
  contractorUserId: number;
  timezone: string;
  workingDays: Record<string, { enabled: boolean; start: string; end: string }>;
  sameDayAvailable: boolean;
  emergencyAvailable: boolean;
  maxJobsPerDay: number | null;
  temporaryUnavailable: boolean;
};

export async function fetchContractorAvailability(contractorUserId?: number) {
  const q = contractorUserId ? `?contractorUserId=${contractorUserId}` : "";
  return api<{ ok: boolean; availability: ContractorAvailability }>(`/api/contractor/availability${q}`);
}

export async function saveContractorAvailability(payload: Partial<ContractorAvailability>) {
  return api<{ ok: boolean }>("/api/contractor/availability", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchDispatchAvailability(contractorUserId: number, employeeId?: number) {
  const params = new URLSearchParams({ contractorUserId: String(contractorUserId) });
  if (employeeId) params.set("employeeId", String(employeeId));
  return api<{
    ok: boolean;
    contractor: { label: string; availableToday: boolean; assignedJobs: number };
    employee?: { name: string; label: string; assignedJobs: number } | null;
  }>(`/api/admin/dispatch/availability?${params}`);
}
