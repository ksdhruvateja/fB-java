import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import {
  archiveNotification,
  archiveReadNotifications,
  fetchNotifications,
  formatRelativeTime,
  markAllNotificationsRead,
  markNotificationRead,
  type InAppNotification,
} from "./notificationsApi";

type Filter = "all" | "unread" | "archived";

export default function NotificationsPage({
  onNavigate,
}: {
  onNavigate?: (notification: InAppNotification) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchNotifications(filter);
      setItems(r.notifications || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load notifications.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Service updates and messages from FixBridge.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-xl border border-border px-3 py-2 text-xs font-semibold"
            onClick={async () => {
              await markAllNotificationsRead();
              await load();
            }}
          >
            Mark all read
          </button>
          <button
            type="button"
            className="rounded-xl border border-border px-3 py-2 text-xs font-semibold"
            onClick={async () => {
              await archiveReadNotifications();
              await load();
            }}
          >
            Clear read
          </button>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {(["all", "unread", "archived"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold capitalize ${
              filter === f ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center">
          <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">You&apos;re all caught up.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id} className={`rounded-2xl border border-border bg-card p-4 ${!n.read ? "border-primary/30" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={async () => {
                    if (!n.read) await markNotificationRead(n.id);
                    onNavigate?.(n);
                    await load();
                  }}
                >
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{formatRelativeTime(n.createdAt)}</p>
                </button>
                <div className="flex shrink-0 flex-col gap-1">
                  {!n.read ? <span className="text-[10px] font-semibold text-primary">Unread</span> : null}
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:underline"
                    onClick={async () => {
                      await archiveNotification(n.id);
                      await load();
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
