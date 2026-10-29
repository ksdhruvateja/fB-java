import { getStoredToken } from "./auth";

export type InAppNotification = {
  id: number;
  userId: number;
  userRole?: string | null;
  jobId?: number | null;
  type: string;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: number | null;
  actionUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  read: boolean;
  readAt?: string | null;
  archivedAt?: string | null;
  createdAt: string;
};

async function commsApi<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...init, headers });
  const data = (await res.json()) as T & { message?: string; ok?: boolean };
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `Request failed (${res.status})`);
  }
  return data;
}

export async function fetchUnreadNotificationCount() {
  return commsApi<{ ok: boolean; count: number }>("/api/notifications/unread-count");
}

export async function fetchNotifications(filter: "all" | "unread" | "archived" = "all", offset = 0) {
  const q = new URLSearchParams({ filter, offset: String(offset) });
  return commsApi<{ ok: boolean; notifications: InAppNotification[] }>(`/api/notifications?${q}`);
}

export async function markNotificationRead(id: number) {
  return commsApi<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: "POST", body: "{}" });
}

export async function markAllNotificationsRead() {
  return commsApi<{ ok: boolean }>("/api/notifications/read-all", { method: "POST", body: "{}" });
}

export async function archiveNotification(id: number) {
  return commsApi<{ ok: boolean }>(`/api/notifications/${id}/archive`, { method: "POST", body: "{}" });
}

export async function archiveReadNotifications() {
  return commsApi<{ ok: boolean }>("/api/notifications/archive-read", { method: "POST", body: "{}" });
}

export function formatBadgeCount(count: number) {
  if (count <= 0) return null;
  if (count > 9) return "9+";
  return String(count);
}

export function formatRelativeTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
