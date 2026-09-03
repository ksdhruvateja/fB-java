import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import {
  archiveReadNotifications,
  fetchNotifications,
  formatBadgeCount,
  formatRelativeTime,
  markAllNotificationsRead,
  markNotificationRead,
  type InAppNotification,
} from "./notificationsApi";

function escapeText(text: string) {
  return text;
}

export default function NotificationBell({
  unreadCount,
  onNavigate,
  onRefreshCounts,
}: {
  unreadCount: number;
  onNavigate?: (notification: InAppNotification) => void;
  onRefreshCounts?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchNotifications("all", 0);
      setItems((r.notifications || []).slice(0, 10));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const badge = formatBadgeCount(unreadCount);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-xl border border-border bg-card p-2.5 hover:bg-muted"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {badge ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF4D1C] px-1 text-[10px] font-bold text-white">
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button type="button" className="fixed inset-0 z-30" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-2xl border border-border bg-card shadow-xl sm:w-96">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="text-sm font-semibold">Notifications</p>
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            {loading ? (
              <p className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </p>
            ) : items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {items.map((n) => (
                  <li key={n.id} className="border-b border-border/60 last:border-0">
                    <button
                      type="button"
                      className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-muted ${!n.read ? "bg-primary/5" : ""}`}
                      onClick={async () => {
                        if (!n.read) {
                          await markNotificationRead(n.id);
                          onRefreshCounts?.();
                        }
                        onNavigate?.(n);
                        setOpen(false);
                      }}
                    >
                      <span className="text-sm font-medium">{escapeText(n.title)}</span>
                      <span className="text-xs text-muted-foreground line-clamp-2">{escapeText(n.message)}</span>
                      <span className="text-[10px] text-muted-foreground">{formatRelativeTime(n.createdAt)}</span>
                      {!n.read ? <span className="text-[10px] font-semibold text-primary">Unread</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline"
                onClick={async () => {
                  await markAllNotificationsRead();
                  onRefreshCounts?.();
                  await load();
                }}
              >
                Mark all as read
              </button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={async () => {
                  await archiveReadNotifications();
                  onRefreshCounts?.();
                  await load();
                }}
              >
                Clear read
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
