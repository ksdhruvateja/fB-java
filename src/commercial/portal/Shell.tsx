import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Building, CloudOff, FileText, Inbox, LayoutList, LogOut, Moon, Receipt, Settings, Sun, Sunrise, Users } from "lucide-react";
import { api, tokens, type CUser, type Company } from "../api";
import { CommercialLogo } from "../CommercialLogo";
import { flushOutbox, installOutboxSync, outbox } from "../outbox";
import { Link, navigate } from "../router";
import { Spinner, cx } from "../ui";

interface Session {
  user: CUser;
  company: Company;
  isOffice: boolean;
  canSeeMoney: boolean;
  refresh: () => Promise<void>;
}
const SessionContext = createContext<Session | null>(null);
export const useSession = () => useContext(SessionContext)!;

export function useDark() {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("fixbridge-commercial-theme") === "dark";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("fixbridge-commercial-theme", dark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }, [dark]);
  return [dark, setDark] as const;
}

export function signOut() {
  tokens.setUser("");
  navigate("/commercial/login", { replace: true });
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
        navigate("/commercial/login", { replace: true });
      } else setError(e?.message || "Could not load your account.");
    }
  };

  useEffect(() => {
    if (!tokens.user()) {
      navigate("/commercial/login", { replace: true });
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
    { to: "/commercial/app", label: "Today", icon: Sunrise, show: true },
    { to: "/commercial/app/jobs", label: "Jobs", icon: LayoutList, show: true },
    { to: "/commercial/app/intake", label: "Intake", icon: Inbox, show: isOffice },
    { to: "/commercial/app/invoices", label: "Invoices", icon: Receipt, show: isOffice && canSeeMoney },
    { to: "/commercial/app/exceptions", label: "Exceptions", icon: AlertTriangle, show: true },
    { to: "/commercial/app/customers", label: "Customers & sites", icon: Building, show: isOffice },
    { to: "/commercial/app/team", label: "Team", icon: Users, show: isOffice },
    { to: "/commercial/app/settings", label: "Settings", icon: Settings, show: true },
  ].filter((n) => n.show);
  const mobileNav = nav.filter((n) => ["Today", "Jobs", isOffice ? "Intake" : "Exceptions", "Settings"].includes(n.label));
  const isActive = (to: string) => (to === "/commercial/app" ? path === to : path === to || path.startsWith(`${to}/`));

  return (
    <SessionContext.Provider value={{ ...session, refresh: load }}>
      <div className="min-h-svh bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex">
          <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
            <Link to="/commercial/app"><CommercialLogo /></Link>
            <p className="mt-3 truncate text-sm font-semibold">{company.name}</p>
            <p className="truncate text-xs capitalize text-slate-500">{user.name} · {user.role}</p>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={cx(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                  isActive(n.to) ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                )}
              >
                <n.icon className="h-4 w-4" /> {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1 border-t border-slate-200 p-2 dark:border-slate-800">
            <button type="button" onClick={() => setDark(!dark)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Toggle dark mode">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button type="button" onClick={signOut} className="ml-auto flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </aside>

        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 lg:hidden">
          <Link to="/commercial/app"><CommercialLogo small /></Link>
          <span className="ml-auto truncate text-xs text-slate-500">{company.name}</span>
          <button type="button" onClick={() => setDark(!dark)} className="rounded-md p-2 text-slate-600 dark:text-slate-300" aria-label="Toggle dark mode">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </header>

        <div className="lg:pl-60">
          {!online || pending ? (
            <div className={cx("flex items-center gap-2 px-4 py-2 text-sm font-medium", online ? "bg-amber-100 text-amber-900" : "bg-slate-800 text-white")} role="status">
              <CloudOff className="h-4 w-4" />
              {online ? `${pending} field update${pending === 1 ? "" : "s"} waiting to sync.` : `You are offline.${pending ? ` ${pending} update${pending === 1 ? "" : "s"} saved on this phone.` : " Field actions will be saved and sent later."}`}
              {online && pending ? <button type="button" className="ml-auto underline" onClick={() => void flushOutbox()}>Sync now</button> : null}
            </div>
          ) : null}
          <main className="mx-auto max-w-7xl px-3 pb-28 pt-4 sm:px-6 lg:pb-10 lg:pt-6">{children}</main>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-900 lg:hidden" style={{ gridTemplateColumns: `repeat(${mobileNav.length + 1}, minmax(0, 1fr))` }}>
          {mobileNav.map((n) => (
            <Link key={n.to} to={n.to} className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", isActive(n.to) ? "text-primary" : "text-slate-600 dark:text-slate-400")}>
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
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-600 dark:text-slate-400" aria-expanded={open}>
        <FileText className="h-5 w-5" /> More
      </button>
      {open ? (
        <div className="absolute bottom-full right-1 mb-2 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {items.map((n) => (
            <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
          <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    if (typeof title === "string") document.title = `${title} · FixBridge Commercial`;
  }, [title]);
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
