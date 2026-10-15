/** FixBridge Commercial API client. Its tokens live under their own keys, apart from the main site's. */

const USER_TOKEN_KEY = "fixbridge-commercial-token";
const ADMIN_TOKEN_KEY = "fixbridge-commercial-admin-token";

function read(key: string) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}
function write(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export const tokens = {
  user: () => read(USER_TOKEN_KEY),
  setUser: (t: string) => write(USER_TOKEN_KEY, t),
  admin: () => read(ADMIN_TOKEN_KEY),
  setAdmin: (t: string) => write(ADMIN_TOKEN_KEY, t),
};

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, message: string, body: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** Thrown when the request never reached the server (offline). */
export class NetworkError extends Error {}

async function request<T = any>(method: string, path: string, body: unknown, token: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/commercial${path}`, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new NetworkError("You appear to be offline.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    if (res.status === 401) window.dispatchEvent(new CustomEvent("commercial-signed-out", { detail: path.startsWith("/admin") ? "admin" : "user" }));
    throw new ApiError(res.status, data?.message || `Request failed (${res.status})`, data);
  }
  return data as T;
}

export const api = {
  get: <T = any>(path: string) => request<T>("GET", path, undefined, tokens.user()),
  post: <T = any>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}, tokens.user()),
  patch: <T = any>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}, tokens.user()),
  public: <T = any>(method: string, path: string, body?: unknown) => request<T>(method, path, body, ""),
};

export const adminApi = {
  get: <T = any>(path: string) => request<T>("GET", `/admin${path}`, undefined, tokens.admin()),
  post: <T = any>(path: string, body?: unknown) => request<T>("POST", `/admin${path}`, body ?? {}, tokens.admin()),
  patch: <T = any>(path: string, body?: unknown) => request<T>("PATCH", `/admin${path}`, body ?? {}, tokens.admin()),
};

export type Role = "owner" | "office" | "technician";
export interface CUser {
  id: number;
  company_id: number;
  email: string;
  name: string;
  phone: string;
  role: Role;
  can_view_financials: boolean;
  active: boolean;
  invited: boolean;
}
export interface Company {
  id: number;
  name: string;
  email: string;
  phone: string;
  timezone: string;
  plan: "network" | "essentials" | "team";
  status: string;
  founding_member: boolean;
  default_assignee_user_id: number | null;
  labor_rate?: number | null;
  service_area?: string;
  billing?: any;
}
export interface Flag {
  code: string;
  field: string;
  severity: "blocking" | "warning";
  message: string;
  resolved: boolean;
  resolution?: string;
}
export interface Job {
  id: number;
  job_number: string;
  external_wo_number: string;
  po_number: string;
  dispatcher_name: string;
  dispatcher_email: string;
  customer_id: number | null;
  billing_customer: string;
  site_id: number | null;
  site_name: string;
  site_address: string;
  contacts: { name: string; phone: string; email: string; role: string }[];
  scope: string;
  trade: string;
  priority: string;
  due_at: string | null;
  due_text: string;
  timezone: string;
  nte_amount?: number | null;
  authorized_amount?: number | null;
  approval_conditions: string;
  billing_instructions: string;
  access_instructions: string;
  checkin_method: string;
  checkin_instructions: string;
  status: string;
  review_status: string;
  flags: Flag[];
  assigned_user_ids: number[];
  eta_at: string | null;
  accepted_at: string | null;
  completion_finalized_at: string | null;
  completion_summary: string;
  signoff_name: string;
  money_hidden?: boolean;
  updated_at: string;
  created_at: string;
  visit_count?: number;
}
export interface Visit {
  id: number;
  job_id: number;
  visit_number: number;
  technician_user_id: number;
  technician_name?: string;
  status: "scheduled" | "en_route" | "on_site" | "completed" | "cancelled";
  en_route_at: string | null;
  arrived_at: string | null;
  departed_at: string | null;
  arrival_lat: number | null;
  arrival_lng: number | null;
  arrival_location_note: string;
  external_checkin_status: string;
  external_checkin_reference: string;
  external_checkin_note: string;
  external_checkout_status: string;
  external_checkout_reference: string;
  external_checkout_note: string;
  outcome: string;
  work_performed: string;
  notes: string;
  parts_needed: string;
}

export const STATUS_LABEL: Record<string, string> = {
  received: "Received — not accepted",
  accepted: "Accepted",
  in_progress: "In progress",
  proposal_needed: "Proposal needed",
  awaiting_approval: "Awaiting approval",
  return_visit_needed: "Return visit needed",
  work_complete: "Work complete",
  completed: "Completed — ready to bill",
  invoiced: "Invoiced",
  paid: "Paid",
  declined: "Declined",
  cancelled: "Cancelled",
};

export const OUTCOME_LABEL: Record<string, string> = {
  completed: "Completed",
  diagnosis_only: "Diagnosis only",
  parts_needed: "Parts needed",
  return_visit: "Return visit needed",
  no_access: "No access",
  awaiting_approval: "Awaiting approval",
};

export const CHECKIN_LABEL: Record<string, string> = {
  none: "No customer check-in",
  phone_ivr: "Phone / IVR",
  portal: "Customer portal or app",
  code: "Check-in code",
  email: "Email",
  other: "Other",
};
