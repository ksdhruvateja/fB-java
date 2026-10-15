import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Building, CloudOff, FileText, Inbox, LayoutList, LogOut, Moon, Receipt, Settings, Sun, Sunrise, Users } from "lucide-react";
import { api, tokens, type CUser, type Company } from "../api";
import { CommercialLogo } from "../CommercialLogo";
import { flushOutbox, installOutboxSync, outbox } from "../outbox";
import { Link, navigate } from "../router";
import { Spinner, cx, display, eyebrow } from "../ui";

interface Session {
  user: CUser;
  company: Company;
  isOffice: boolean;
  canSeeMoney: boolean;
  refresh: () => Promise<void>;
}
const SessionContext = createContext<Session | null>(null);
export const useSession = () => useContext(SessionContext)!;

/** Same light/dark preference as the main FixBridge site. */
const THEME_KEY = "fixbridge-theme";

export function useDark() {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === "dark";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }, [dark]);
  return [dark, setDark] as const;
}

/** The sign-in page this person used last (owner, office or technician). */
function loginPath() {
  try {
    const role = localStorage.getItem("fixbridge-commercial-role");
    if (role === "owner" || role === "office" || role === "technician") return `/commercial/login/${role}`;
  } catch {
    /* ignore */
  }
  return "/commercial/login";
}

export function signOut() {
  tokens.setUser("");
  navigate(loginPath(), { replace: true });
}

export function PortalShell({ path, children }: { path: string; children: ReactNode }) {
  const [session, setSession] = useState<Omit<Session, "refresh"> | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(outbox.count());
  const [online, setOnline] = useState(navigator.onLine);
  const [dark, setDark] = useDark();

  const load = async () => {
    try {
      const me = await api.get<{ user: CUser; company: Company }>("/me");
      const isOffice = me.user.role === "owner" || me.user.role === "office";
      setSession({ user: me.user, company: me.company, isOffice, canSeeMoney: isOffice || me.user.can_view_financials });
    } catch (e: any) {
      if (e?.status === 401 || e?.status === 403) {
        tokens.setUser("");
        navigate(loginPath(), { replace: true });
      } else setError(e?.message || "Could not load your account.");
    }
  };

  useEffect(() => {
    if (!tokens.user()) {
      navigate(loginPath(), { replace: true });
      return;
    }
    void load();
    installOutboxSync();
    const onOutbox = () => setPending(outbox.count());
    const onOnline = () => setOnline(navigator.onLine);
    window.addEventListener("commercial-outbox", onOutbox);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    return () => {
      window.removeEventListener("commercial-outbox", onOutbox);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
    };
  }, []);

  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!session) return <Spinner label="Opening FixBridge Commercial…" />;

  const { user, company, isOffice, canSeeMoney } = session;
  const nav = [
    { to: "/commercial/app", label: "Today", icon: Sunrise, show: true, group: "Work" },
    { to: "/commercial/app/jobs", label: "Jobs", icon: LayoutList, show: true, group: "Work" },
    { to: "/commercial/app/intake", label: "Intake", icon: Inbox, show: isOffice, group: "Work" },
    { to: "/commercial/app/exceptions", label: "Exceptions", icon: AlertTriangle, show: true, group: "Work" },
    { to: "/commercial/app/invoices", label: "Invoices", icon: Receipt, show: isOffice && canSeeMoney, group: "Billing" },
    { to: "/commercial/app/customers", label: "Customers & sites", icon: Building, show: isOffice, group: "Setup" },
    { to: "/commercial/app/team", label: "Team", icon: Users, show: isOffice, group: "Setup" },
    { to: "/commercial/app/settings", label: "Settings", icon: Settings, show: true, group: "Setup" },
  ].filter((n) => n.show);
  const mobileNav = nav.filter((n) => ["Today", "Jobs", isOffice ? "Intake" : "Exceptions", "Settings"].includes(n.label));
  const isActive = (to: string) => (to === "/commercial/app" ? path === to : path === to || path.startsWith(`${to}/`));

  return (
    <SessionContext.Provider value={{ ...session, refresh: load }}>
      <div className="min-h-svh bg-background text-foreground">
        <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-[#fbfbfd]/90 backdrop-blur-xl dark:bg-[#1c1c1e]/90 lg:flex">
          <div className="border-b border-border px-4 py-4">
            <Link to="/commercial/app" aria-label="FixBridge Commercial home"><CommercialLogo /></Link>
            <p className="mt-2 truncate text-sm font-semibold">{company.name}</p>
            <p className="truncate text-xs capitalize text-muted-foreground">{user.name} · {user.role}</p>
          </div>
          <nav className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
            {["Work", "Billing", "Setup"].map((group) => {
              const items = nav.filter((n) => n.group === group);
              if (!items.length) return null;
              return (
                <div key={group}>
                  <p className="mb-1 px-3 text-[12px] font-semibold text-muted-foreground">{group}</p>
                  <div className="flex flex-col gap-0.5">
                    {items.map((n) => (
                      <Link
                        key={n.to}
                        to={n.to}
                        className={cx(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-[14px]",
                          isActive(n.to) ? "bg-black/[0.06] font-medium text-foreground dark:bg-white/10 [&>svg]:text-primary" : "text-foreground/80 hover:bg-black/[0.04] dark:hover:bg-white/5"
                        )}
                      >
                        <n.icon className="h-4 w-4 shrink-0" /> {n.label}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>
          <div className="space-y-1 border-t border-border p-3">
            <button type="button" onClick={() => setDark(!dark)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {dark ? "Light mode" : "Dark mode"}
            </button>
            <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </aside>

        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
          <Link to="/commercial/app" aria-label="FixBridge Commercial home"><CommercialLogo small /></Link>
          <span className="ml-auto truncate text-xs text-muted-foreground">{company.name}</span>
          <button type="button" onClick={() => setDark(!dark)} className="rounded-full p-2 hover:bg-muted" aria-label="Toggle dark mode">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </header>

        <div className="lg:pl-64">
          {!online || pending ? (
            <div className={cx("flex items-center gap-2 px-4 py-2 text-sm font-medium", online ? "bg-amber-100 text-amber-900" : "bg-foreground text-background")} role="status">
              <CloudOff className="h-4 w-4" />
              {online ? `${pending} field update${pending === 1 ? "" : "s"} waiting to sync.` : `You are offline.${pending ? ` ${pending} update${pending === 1 ? "" : "s"} saved on this phone.` : " Field actions will be saved and sent later."}`}
              {online && pending ? <button type="button" className="ml-auto underline" onClick={() => void flushOutbox()}>Sync now</button> : null}
            </div>
          ) : null}
          <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden" style={{ gridTemplateColumns: `repeat(${mobileNav.length + 1}, minmax(0, 1fr))` }}>
          {mobileNav.map((n) => (
            <Link key={n.to} to={n.to} className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", isActive(n.to) ? "text-primary" : "text-muted-foreground")}>
              <n.icon className="h-5 w-5" /> {n.label}
            </Link>
          ))}
          <MoreMenu items={nav.filter((n) => !mobileNav.includes(n))} />
        </nav>
      </div>
    </SessionContext.Provider>
  );
}

function MoreMenu({ items }: { items: { to: string; label: string; icon: any }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground" aria-expanded={open}>
        <FileText className="h-5 w-5" /> More
      </button>
      {open ? (
        <div className="absolute bottom-full right-1 mb-2 w-56 rounded-2xl bg-card p-1 shadow-xl ">
          {items.map((n) => (
            <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted">
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
          <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function PageTitle({ title, subtitle, actions, label }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; label?: string }) {
  useEffect(() => {
    if (typeof title === "string") document.title = `${title} · FixBridge Commercial`;
  }, [title]);
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {label ? <span className={`mb-2 block ${eyebrow} text-primary`}>{label}</span> : null}
        <h1 className={`${display} text-3xl leading-none sm:text-4xl`}>{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
