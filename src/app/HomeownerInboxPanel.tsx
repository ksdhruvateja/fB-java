import { useEffect, useState } from "react";
import { Bell, MessageSquare } from "lucide-react";
import type { InboxSegment } from "./homeownerNav";
import MessagesPanel from "./MessagesPanel";
import NotificationsPage from "./NotificationsPage";
import type { InAppNotification } from "./notificationsApi";
import type { ManagedJob } from "./managedJobs";
import { formatBadgeCount } from "./notificationsApi";
import { resolveNotificationTarget } from "./navigateFromNotification";

const SEGMENTS: { id: InboxSegment; label: string; icon: React.ElementType }[] = [
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "notifications", label: "Notifications", icon: Bell },
];

export default function HomeownerInboxPanel({
  onOpenJob,
  onRefreshCounts,
  unreadMessages = 0,
  unreadNotifications = 0,
  onNavigateNotification,
  initialConversationId = null,
}: {
  jobs?: ManagedJob[];
  homeUpdates?: unknown[];
  onOpenJob: (jobId: number) => void;
  onRequestService?: () => void;
  onOpenHomeUpdates?: () => void;
  onRefreshCounts?: () => void;
  unreadMessages?: number;
  unreadNotifications?: number;
  onNavigateNotification?: (n: InAppNotification) => void;
  initialConversationId?: number | null;
}) {
  const [segment, setSegment] = useState<InboxSegment>(initialConversationId ? "messages" : "messages");

  useEffect(() => {
    if (initialConversationId) setSegment("messages");
  }, [initialConversationId]);

  const handleNotificationNavigate = (n: InAppNotification) => {
    if (onNavigateNotification) {
      onNavigateNotification(n);
      return;
    }
    const target = resolveNotificationTarget(n, "homeowner");
    if (target.kind === "homeowner_job" || target.kind === "homeowner_assessment") {
      onOpenJob(target.jobId);
      return;
    }
    if (n.jobId) onOpenJob(n.jobId);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
            Inbox
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Messages and updates from FixBridge.</p>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {SEGMENTS.map((s) => {
          const Icon = s.icon;
          const badge =
            s.id === "messages" ? formatBadgeCount(unreadMessages) : formatBadgeCount(unreadNotifications);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSegment(s.id)}
              className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                segment === s.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {s.label}
              {badge ? (
                <span className="rounded-full bg-[#FF4D1C] px-1.5 py-0.5 text-[10px] font-bold text-white">{badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {segment === "messages" ? (
        <MessagesPanel role="homeowner" initialConversationId={initialConversationId} onUnreadChange={onRefreshCounts} />
      ) : (
        <NotificationsPage onNavigate={handleNotificationNavigate} />
      )}
    </section>
  );
}
