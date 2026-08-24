import type { ElementType } from "react";
import { Home, Briefcase, Plus, Inbox, MoreHorizontal } from "lucide-react";
import type { BottomNavId, DashTab } from "./homeownerNav";
import { bottomNavHighlight } from "./homeownerNav";

const ITEMS: {
  id: BottomNavId;
  label: string;
  icon: ElementType;
}[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "jobs", label: "Jobs", icon: Briefcase },
  { id: "request", label: "Request", icon: Plus },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "more", label: "More", icon: MoreHorizontal },
];

export default function HomeownerBottomNav({
  tab,
  onHome,
  onJobs,
  onRequest,
  onInbox,
  onMore,
}: {
  tab: DashTab;
  onHome: () => void;
  onJobs: () => void;
  onRequest: () => void;
  onInbox: () => void;
  onMore: () => void;
}) {
  const active = bottomNavHighlight(tab);

  const handlers: Record<BottomNavId, () => void> = {
    home: onHome,
    jobs: onJobs,
    request: onRequest,
    inbox: onInbox,
    more: onMore,
  };

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      aria-label="Main navigation"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5 items-end px-1 pt-1">
        {ITEMS.map((item) => {
          const isActive = active === item.id;
          const isCenter = item.id === "request";

          if (isCenter) {
            return (
              <li key={item.id} className="flex justify-center pb-1">
                <button
                  type="button"
                  onClick={handlers[item.id]}
                  aria-label="Request service"
                  aria-current={isActive ? "page" : undefined}
                  className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-[0_12px_28px_rgba(255,77,28,0.35)] transition active:scale-95"
                >
                  <Plus size={26} strokeWidth={2.5} />
                </button>
              </li>
            );
          }

          const Icon = item.icon;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={handlers[item.id]}
                aria-current={isActive ? "page" : undefined}
                className={`flex w-full flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.25 : 2} />
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
