import { ChevronRight, LogOut, Moon, Sparkles, Sun } from "lucide-react";
import { MORE_MENU_SECTIONS, type DashTab } from "./homeownerNav";
import { isPaidHomeCarePlan } from "./subscriptionCatalog";
import LockedProBadge from "./LockedProBadge";

const PRO_LOCKED_MENU_TABS = new Set<DashTab>(["documents"]);

export default function HomeownerMoreMenu({
  userName,
  planCode,
  isDark,
  onNavigate,
  onToggleDark,
  onLogout,
  onGoPro,
  goProBusy,
  showGoPro,
}: {
  userName: string;
  planCode?: string | null;
  isDark: boolean;
  onNavigate: (tab: DashTab) => void;
  onToggleDark: () => void;
  onLogout: () => void;
  onGoPro?: () => void;
  goProBusy?: boolean;
  showGoPro?: boolean;
}) {
  return (
    <section className="mx-auto max-w-lg space-y-6 pb-4">
      <div>
        <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
          More
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{userName}</p>
      </div>

      {(showGoPro ?? true) && onGoPro && (
        <button
          type="button"
          disabled={goProBusy}
          onClick={onGoPro}
          className="flex w-full items-center gap-3 rounded-2xl border border-[#4A90D9]/30 bg-gradient-to-br from-[#4A90D9]/10 via-white to-[#FF6B2C]/10 p-4 text-left dark:from-[#4A90D9]/15 dark:via-transparent dark:to-[#FF6B2C]/10"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF6B2C]/15 text-[#FF6B2C]">
            <Sparkles size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <p className="text-sm font-semibold">HomeCare Pro</p>
            <p className="text-xs text-muted-foreground">Year-round maintenance, vault & priority routing</p>
          </span>
          <ChevronRight size={18} className="text-muted-foreground" />
        </button>
      )}

      {MORE_MENU_SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {section.title}
          </p>
          <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">
            {section.items.map((item, idx) => (
              <button
                key={`${section.title}-${item.label}-${idx}`}
                type="button"
                onClick={() => onNavigate(item.tab)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {item.label}
                    {PRO_LOCKED_MENU_TABS.has(item.tab) && !isPaidHomeCarePlan(planCode) ? (
                      <LockedProBadge compact />
                    ) : null}
                  </p>
                  {item.description ? (
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  ) : null}
                </span>
                <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">
        <button
          type="button"
          onClick={onToggleDark}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium hover:bg-muted/50"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
          {isDark ? "Light mode" : "Dark mode"}
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-red-600 hover:bg-muted/50 dark:text-red-400"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </section>
  );
}
