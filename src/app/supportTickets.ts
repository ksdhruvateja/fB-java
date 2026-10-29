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
  category?: string | null;
  priority?: string;
  assignedTo?: string | null;
  relatedPropertyId?: number | null;
  relatedJobId?: number | null;
  relatedQuoteId?: number | null;
  relatedInvoiceId?: number | null;
  relatedPaymentId?: number | null;
  context?: SupportTicketContext;
  status: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  closedAt?: string | null;
};

export type TicketMessage = {
  id: number;
  ticketId: number;
  senderUserId?: number | null;
  senderRole: string;
  senderName?: string | null;
  message: string;
  isInternal: boolean;
  createdAt: string;
};

export type TicketActivity = {
  id: number;
  ticketId: number;
  actorUserId?: number | null;
  actorRole?: string | null;
  action: string;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: string;
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
  category?: string;
  priority?: string;
  relatedJobId?: number | null;
  relatedPropertyId?: number | null;
  relatedQuoteId?: number | null;
  relatedInvoiceId?: number | null;
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

export async function listMySupportTickets(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return supportApi<{ ok: boolean; tickets: SupportTicket[] }>(`/api/support/tickets${q}`);
}

export async function getMySupportTicket(ticketNumber: string) {
  return supportApi<{
    ok: boolean;
    ticket: SupportTicket;
    messages: TicketMessage[];
    deliveries: TicketDelivery[];
    context?: SupportTicketContext;
  }>(`/api/support/tickets/${encodeURIComponent(ticketNumber)}`);
}

export async function replySupportTicket(ticketNumber: string, message: string) {
  return supportApi<{ ok: boolean; message: TicketMessage }>(
    `/api/support/tickets/${encodeURIComponent(ticketNumber)}/reply`,
    { method: "POST", body: JSON.stringify({ message }) }
  );
}

export async function listAdminSupportTickets(status?: string, q?: string) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return supportApi<{ ok: boolean; tickets: SupportTicket[] }>(`/api/admin/support/tickets${qs}`);
}

export async function getAdminSupportTicket(ticketNumber: string) {
  return supportApi<{
    ok: boolean;
    ticket: SupportTicket;
    messages: TicketMessage[];
    activity: TicketActivity[];
    deliveries: TicketDelivery[];
    context?: SupportTicketContext;
  }>(`/api/admin/support/tickets/${encodeURIComponent(ticketNumber)}`);
}

export async function updateAdminSupportTicket(ticketNumber: string, fields: Record<string, unknown>) {
  return supportApi<{ ok: boolean; ticket: SupportTicket }>(
    `/api/admin/support/tickets/${encodeURIComponent(ticketNumber)}`,
    { method: "PATCH", body: JSON.stringify(fields) }
  );
}

export async function replyAdminSupportTicket(ticketNumber: string, message: string, internal = false) {
  return supportApi<{ ok: boolean; message: TicketMessage }>(
    `/api/admin/support/tickets/${encodeURIComponent(ticketNumber)}/reply`,
    { method: "POST", body: JSON.stringify({ message, internal }) }
  );
}

/** @deprecated use updateAdminSupportTicket */
export async function updateAdminSupportTicketStatus(ticketNumber: string, status: string) {
  return updateAdminSupportTicket(ticketNumber, { status });
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
