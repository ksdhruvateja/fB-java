import { getStoredToken } from "./auth";

export type SearchHit = {
  id: number;
  label: string;
  subtitle?: string | null;
  status?: string;
  jobId?: number;
  href: Record<string, unknown>;
};

export type AdminSearchResults = {
  jobs: SearchHit[];
  homeowners: SearchHit[];
  contractors: SearchHit[];
  quotes: SearchHit[];
  invoices: SearchHit[];
  payments: SearchHit[];
  payouts: SearchHit[];
  tickets: SearchHit[];
  technicians: SearchHit[];
};

export async function adminUniversalSearch(q: string) {
  const token = getStoredToken();
  const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Search failed");
  return data as { ok: boolean; query: string; results: AdminSearchResults };
}
