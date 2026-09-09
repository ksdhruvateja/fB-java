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

export function formatBadgeCount(count: number): string | null {
  if (count <= 0) return null;
  if (count > 9) return '9+';
  return String(count);
}

export function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
