import { getStoredToken } from "./auth";
import type { ManagedJob, Property } from "./managedJobs";

export type SupportChannel = "help" | "assistant";

export type SupportTicket = {
  id: number;
  ticketNumber: string;
  userId: number;
  userRole?: string;
  userName?: string;
  userEmail: string;
  userPhone?: string | null;
  channel: SupportChannel;
  subject: string;
  message: string;
  relatedJobId?: number | null;
  context?: SupportTicketContext;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type TicketDelivery = {
  id: number;
  ticketId: number;
  deliveryType: "email" | "sms";
  recipientRole: "homeowner" | "admin";
  recipientAddress: string;
  subject?: string | null;
  body: string;
  status: string;
  sentAt: string;
};

export type SupportTicketContext = {
  capturedAt: string;
  profile?: {
    id: number;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    planCode?: string | null;
    role?: string;
  };
  properties?: Array<{
    id: number;
    label?: string | null;
    addressLine1?: string;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  }>;
  recentJobs?: Array<{
    id: number;
    bookingId?: string | null;
    status?: string;
    category?: string | null;
    title?: string | null;
  }>;
};

async function supportApi<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...init, headers });
  const data = (await res.json()) as T & { message?: string; ok?: boolean };
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `Support API failed (${res.status})`);
  }
  return data;
}

export async function createSupportTicket(input: {
  channel: SupportChannel;
  subject: string;
  message: string;
  relatedJobId?: number | null;
}) {
  return supportApi<{
    ok: boolean;
    ticket: SupportTicket;
    deliveries: TicketDelivery[];
    context: SupportTicketContext;
    supportEmail: string;
  }>("/api/support/tickets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listMySupportTickets() {
  return supportApi<{ ok: boolean; tickets: SupportTicket[] }>("/api/support/tickets");
}

export async function getMySupportTicket(ticketNumber: string) {
  return supportApi<{
    ok: boolean;
    ticket: SupportTicket;
    deliveries: TicketDelivery[];
    context?: SupportTicketContext;
  }>(`/api/support/tickets/${encodeURIComponent(ticketNumber)}`);
}

export async function listAdminSupportTickets(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return supportApi<{ ok: boolean; tickets: SupportTicket[] }>(`/api/admin/support/tickets${q}`);
}

export async function getAdminSupportTicket(ticketNumber: string) {
  return supportApi<{
    ok: boolean;
    ticket: SupportTicket;
    deliveries: TicketDelivery[];
    context?: SupportTicketContext;
  }>(`/api/admin/support/tickets/${encodeURIComponent(ticketNumber)}`);
}

export async function updateAdminSupportTicketStatus(ticketNumber: string, status: string) {
  return supportApi<{ ok: boolean; ticket: SupportTicket }>(
    `/api/admin/support/tickets/${encodeURIComponent(ticketNumber)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }
  );
}

export function buildLocalContextPreview(
  user: { name?: string; email?: string; phone?: string | null; planCode?: string | null },
  properties: Property[],
  jobs: ManagedJob[]
): SupportTicketContext {
  return {
    capturedAt: new Date().toISOString(),
    profile: {
      id: 0,
      name: user.name,
      email: user.email,
      phone: user.phone,
      planCode: user.planCode,
      role: "homeowner",
    },
    properties: properties.slice(0, 10).map((p) => ({
      id: p.id,
      label: p.label,
      addressLine1: p.addressLine1,
      city: p.city,
      state: p.state,
      zip: p.zip,
    })),
    recentJobs: jobs.slice(0, 8).map((j) => ({
      id: j.id,
      bookingId: j.bookingId,
      status: String(j.status),
      category: j.category,
      title: j.title,
    })),
  };
}
