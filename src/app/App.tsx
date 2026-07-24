import { useEffect, useState, useRef } from "react";
import { motion } from "motion/react";
import { Sun, Moon, Menu, X, MapPin, ArrowRight } from "lucide-react";
import CustomerPage from "./CustomerPage";
import ContractorPage from "./ContractorPage";
import AboutPage from "./AboutPage";
import HomeownerLogin from "./HomeownerLogin";
import ContractorLogin from "./ContractorLogin";
import HomeownerDashboard from "./HomeownerDashboard";
import ContractorDashboard from "./ContractorDashboard";
import AdminPanel from "./AdminPanel";
import ResetPassword from "./ResetPassword";
import { getStoredUser, validateToken, clearSession, loadAllUsers, type AuthUser, type UserRole } from "./auth";

type Page =
  | "home"
  | "contractors"
  | "about"
  | "homeowner-login"
  | "contractor-login"
  | "homeowner-dashboard"
  | "contractor-dashboard"
  | "admin";

const APP_STATE_KEY = "fixbridge-app-state";

function canUseStorage() {
  if (typeof window === "undefined") return false;
  try {
    return typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function isValidPage(value: unknown): value is Page {
  return (
    value === "home" ||
    value === "contractors" ||
    value === "about" ||
    value === "homeowner-login" ||
    value === "contractor-login" ||
    value === "homeowner-dashboard" ||
    value === "contractor-dashboard" ||
    value === "admin"
  );
}

function loadInitialState(): {
  page: Page;
  marketingContext: "home" | "contractors";
  currentUser: AuthUser | null;
} {
  const fallback = {
    page: "home" as Page,
    marketingContext: "home" as const,
    currentUser: null as AuthUser | null,
  };

  if (!canUseStorage()) return fallback;

  try {
    const raw = window.localStorage.getItem(APP_STATE_KEY);
    const parsed = raw
      ? (JSON.parse(raw) as { page?: unknown; marketingContext?: unknown })
      : {};

    const page = isValidPage(parsed.page) ? parsed.page : fallback.page;
    const marketingContext =
      parsed.marketingContext === "contractors" ? "contractors" : "home";

    // Restore session from the secure token cache (no password stored here)
    const currentUser = getStoredUser();

    return { page, marketingContext, currentUser };
  } catch {
    return fallback;
  }
}

// ─── Shared Nav (marketing pages only) ───────────────────────────────────────

function Nav({
  page,
  onNavigate,
  marketingContext,
  isDark,
  onToggleDark,
  scrolled,
}: {
  page: Page;
  onNavigate: (p: Page) => void;
  marketingContext: "home" | "contractors";
  isDark: boolean;
  onToggleDark: () => void;
  scrolled: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-background/95 backdrop-blur-md border-b border-border shadow-sm" : ""
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
        {/* Logo */}
        <button onClick={() => onNavigate("home")} className="flex items-center gap-0.5 shrink-0">
          <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-xl sm:text-2xl tracking-wider text-foreground">
            FIX
          </span>
          <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-xl sm:text-2xl tracking-wider text-primary">
            BRIDGE
          </span>
          <span className="ml-1.5 font-mono text-[9px] tracking-widest bg-primary text-white px-1.5 py-0.5">
            AI
          </span>
        </button>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          <button
            onClick={() => onNavigate("home")}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              page === "home" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            For Homeowners
            {page === "home" && (
              <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-primary" />
            )}
          </button>
          <button
            onClick={() => onNavigate("contractors")}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              page === "contractors" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            For Contractors
            {page === "contractors" && (
              <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-primary" />
            )}
          </button>
          <button
            onClick={() => onNavigate("about")}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              page === "about" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            About
            {page === "about" && (
              <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-primary" />
            )}
          </button>
        </div>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={onToggleDark}
            className="w-9 h-9 flex items-center justify-center border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Sign in — context-aware */}
          <button
            onClick={() =>
              marketingContext === "contractors"
                ? onNavigate("contractor-login")
                : onNavigate("homeowner-login")
            }
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign In
          </button>

          <button
            onClick={() =>
              marketingContext === "contractors"
                ? onNavigate("contractor-login")
                : onNavigate("homeowner-login")
            }
            className="text-sm bg-primary text-white px-4 py-2 hover:bg-primary/90 transition-colors font-medium"
          >
            {marketingContext === "contractors" ? "Apply Now" : "Post a Repair"}
          </button>
        </div>

        {/* Mobile */}
        <div className="md:hidden flex items-center gap-2">
          <button
            onClick={onToggleDark}
            className="w-9 h-9 flex items-center justify-center border border-border text-muted-foreground"
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            className="w-9 h-9 flex items-center justify-center text-foreground"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden bg-background border-t border-border px-4 py-4 flex flex-col gap-3"
        >
          <button
            onClick={() => { onNavigate("home"); setMenuOpen(false); }}
            className={`text-sm text-left font-medium ${page === "home" ? "text-primary" : "text-muted-foreground"}`}
          >
            For Homeowners
          </button>
          <button
            onClick={() => { onNavigate("contractors"); setMenuOpen(false); }}
            className={`text-sm text-left font-medium ${page === "contractors" ? "text-primary" : "text-muted-foreground"}`}
          >
            For Contractors
          </button>
          <button
            onClick={() => { onNavigate("about"); setMenuOpen(false); }}
            className={`text-sm text-left font-medium ${page === "about" ? "text-primary" : "text-muted-foreground"}`}
          >
            About
          </button>
          <div className="pt-2 border-t border-border flex flex-col gap-2">
            <button
              onClick={() => { onNavigate("homeowner-login"); setMenuOpen(false); }}
            className="text-sm border border-border text-foreground px-4 py-2.5 text-left"
            >
              Sign In as Homeowner
            </button>
            <button
              onClick={() => { onNavigate("contractor-login"); setMenuOpen(false); }}
              className="text-sm bg-primary text-white px-4 py-2.5 text-left font-medium"
            >
              Sign In as Contractor
            </button>
          </div>
        </motion.div>
      )}
    </nav>
  );
}

// ─── Shared Footer ────────────────────────────────────────────────────────────

function Footer({ onNavigate }: { onNavigate: (p: Page) => void }) {
  return (
    <footer className="bg-card border-t border-border py-12 md:py-16 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 sm:gap-10 mb-10 md:mb-12">
          <div className="sm:col-span-2">
            <div className="flex items-center gap-0.5 mb-4">
              <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-xl tracking-wider text-foreground">FIX</span>
              <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-xl tracking-wider text-primary">BRIDGE</span>
              <span className="font-mono text-[9px] bg-primary text-white px-1 py-0.5 ml-1.5">AI</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-4">
              The middle layer between homeowners and licensed local contractors — handling
              matching, trust, and paperwork so neither side has to.
            </p>
            <div className="flex items-center gap-2">
              <MapPin size={11} className="text-primary shrink-0" />
              <span className="font-mono text-[11px] text-muted-foreground">NYC & Long Island</span>
            </div>
          </div>

          {[
            {
              title: "Homeowners",
              links: [
                { label: "Post a Job", page: "homeowner-login" as Page },
                { label: "How It Works", page: "home" as Page },
                { label: "AI Assessment", page: "home" as Page },
                { label: "Find a Contractor", page: "home" as Page },
                { label: "Pricing", page: "home" as Page },
              ],
            },
            {
              title: "Contractors",
              links: [
                { label: "Join the Network", page: "contractor-login" as Page },
                { label: "How Bidding Works", page: "contractors" as Page },
                { label: "Compliance Docs", page: "contractors" as Page },
                { label: "Contractor Portal", page: "contractor-login" as Page },
                { label: "FAQ", page: "contractors" as Page },
              ],
            },
            {
              title: "Company",
              links: [
                { label: "About FixBridge", page: "about" as Page },
                { label: "Blog", page: "home" as Page },
                { label: "Press", page: "home" as Page },
                { label: "Careers", page: "home" as Page },
                { label: "Contact", page: "home" as Page },
              ],
            },
          ].map(({ title, links }) => (
            <div key={title}>
              <p className="font-mono text-[11px] tracking-widest text-foreground uppercase mb-4">{title}</p>
              <ul className="space-y-2.5">
                {links.map(({ label, page }) => (
                  <li key={label}>
                    <button
                      onClick={() => {
                        onNavigate(page);
                        if (label === "Contact") {
                          requestAnimationFrame(() => {
                            document.querySelector<HTMLElement>("[data-scroll-root]")?.scrollTo({ top: 0, behavior: "smooth" });
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          });
                        }
                      }}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Cross-promo strip */}
        <div className="border border-border p-5 mb-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-background">
          <div>
            <p className="text-sm font-medium text-foreground mb-0.5">
              Are you a licensed contractor in NYC or Long Island?
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              Join 312+ pros getting matched with real jobs — zero monthly fees.
            </p>
          </div>
          <button
            onClick={() => onNavigate("contractor-login")}
            className="font-medium text-sm text-primary border border-primary/40 px-4 py-2 hover:bg-primary hover:text-white transition-all flex items-center gap-2 group shrink-0"
          >
            See Contractor Platform
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        <div className="border-t border-border pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-mono text-[11px] text-muted-foreground">
            © 2024 FixBridge AI, Inc. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center justify-center md:justify-end gap-4 md:gap-6">
            {["Privacy Policy", "Terms of Service", "Contractor Agreement"].map((item) => (
              <a key={item} href="#" className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                {item}
              </a>
            ))}
            <span className="font-mono text-[10px] text-primary/80 tracking-wider" title="Deploy build stamp — hard-refresh if this does not match the latest release">
              Build {typeof __FIXBRIDGE_BUILD__ !== "undefined" ? __FIXBRIDGE_BUILD__ : "dev"} · v0.0.2
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const initialState = loadInitialState();
  const [page, setPage] = useState<Page>(initialState.page);
  const [marketingContext, setMarketingContext] = useState<"home" | "contractors">(initialState.marketingContext);
  const [isDark, setIsDark] = useState(false); // light mode by default
  const [scrolled, setScrolled] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(initialState.currentUser);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [resetParams, setResetParams] = useState<{ token: string; role: UserRole } | null>(null);

  // Detect password-reset links: /?action=reset-password&token=...&role=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === "reset-password") {
      const token = params.get("token");
      const role = params.get("role");
      if (token && (role === "homeowner" || role === "contractor")) {
        setResetParams({ token, role });
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrolled(e.currentTarget.scrollTop > 48);
  };

  const navigate = (p: Page) => {
    if (p === "home" || p === "contractors") {
      setMarketingContext(p);
    }
    setPage(p);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const isMarketing = page === "home" || page === "contractors" || page === "about";
  const isDashboard = page === "homeowner-dashboard" || page === "contractor-dashboard";

  // Persist nav state (no user data — that lives in the secure token cache)
  useEffect(() => {
    if (!canUseStorage()) return;
    try {
      window.localStorage.setItem(
        APP_STATE_KEY,
        JSON.stringify({ page, marketingContext }),
      );
    } catch {
      // Ignore storage failures so UI remains functional.
    }
  }, [page, marketingContext]);

  // Validate the stored JWT and populate user list cache on startup
  useEffect(() => {
    // Refresh the public user list (for admin panel, contractor display)
    loadAllUsers();

    // Verify the token and update current user
    validateToken().then((result) => {
      if (result.ok) {
        setCurrentUser(result.user);
      } else if (result.reason === "invalid") {
        // Server rejected the JWT — clear the stale session
        clearSession();
        setCurrentUser(null);
        setPage("home");
      }
    });
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Guard against reloading into protected pages without a valid session.
    if (!currentUser && (page === "homeowner-dashboard" || page === "contractor-dashboard" || page === "admin")) {
      setPage("home");
    }
    // Admin page requires the isAdmin flag in the user's token.
    if (currentUser && page === "admin" && !currentUser.isAdmin) {
      setPage("contractor-dashboard");
    }
  }, [currentUser, page]);

  // Show reset-password page when the link is clicked
  if (resetParams) {
    return (
      <div className={`${isDark ? "dark" : ""} size-full`} style={{ colorScheme: isDark ? "dark" : "light" }}>
        <div className="size-full overflow-y-auto bg-background text-foreground [font-family:'DM_Sans',sans-serif]">
          <ResetPassword
            token={resetParams.token}
            role={resetParams.role}
            onDone={() => {
              setResetParams(null);
              navigate(resetParams.role === "homeowner" ? "homeowner-login" : "contractor-login");
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${isDark ? "dark" : ""} size-full`}
      style={{ colorScheme: isDark ? "dark" : "light" }}
    >
      <div
        ref={scrollRef}
        data-scroll-root
        className="size-full overflow-y-auto overflow-x-hidden bg-background text-foreground [font-family:'DM_Sans',sans-serif] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={handleScroll}
      >
        {/* Marketing Nav */}
        {isMarketing && (
          <Nav
            page={page}
            onNavigate={navigate}
            marketingContext={marketingContext}
            isDark={isDark}
            onToggleDark={() => setIsDark((d) => !d)}
            scrolled={scrolled}
          />
        )}

        {/* Page content */}
        <motion.div
          key={page}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          className={isMarketing ? "pt-2" : ""}
        >
          {page === "home" && <CustomerPage scrollContainer={scrollRef} onGetStarted={() => navigate("homeowner-login")} />}
          {page === "contractors" && (
            <ContractorPage
              scrollContainer={scrollRef}
              onApply={() => navigate("contractor-login")}
            />
          )}
          {page === "about" && (
            <AboutPage
              scrollContainer={scrollRef}
              onGoHomeowner={() => navigate("homeowner-login")}
              onGoContractor={() => navigate("contractor-login")}
            />
          )}

          {page === "homeowner-login" && (
            <HomeownerLogin
              onLogin={(user) => {
                setCurrentUser(user);
                loadAllUsers(); // populate contractor cache after sign-in
                navigate("homeowner-dashboard");
              }}
              onBack={() => navigate("home")}
              onGoContractor={() => navigate("contractor-login")}
            />
          )}

          {page === "contractor-login" && (
            <ContractorLogin
              onLogin={(user) => {
                setCurrentUser(user);
                loadAllUsers(); // populate contractor cache after sign-in
                navigate("contractor-dashboard");
              }}
              onBack={() => navigate("contractors")}
              onGoHomeowner={() => navigate("homeowner-login")}
            />
          )}

          {page === "homeowner-dashboard" && currentUser && (
            <HomeownerDashboard
              onLogout={() => {
                clearSession();
                setCurrentUser(null);
                navigate("home");
              }}
              user={currentUser}
              isDark={isDark}
              onToggleDark={() => setIsDark((d) => !d)}
              onUserUpdated={(u) => setCurrentUser(u)}
            />
          )}

          {page === "contractor-dashboard" && currentUser && (
            <ContractorDashboard
              onLogout={() => {
                clearSession();
                setCurrentUser(null);
                navigate("contractors");
              }}
              onOpenAdmin={() => {
                // Only allow navigation if the server has granted admin access
                if (currentUser?.isAdmin) navigate("admin");
              }}
              user={currentUser}
              isDark={isDark}
              onToggleDark={() => setIsDark((d) => !d)}
              onUserUpdated={(u) => setCurrentUser(u)}
            />
          )}
          {page === "admin" && (
            <AdminPanel
              onBack={() => navigate("contractor-dashboard")}
              onSignOut={() => {
                clearSession();
                setCurrentUser(null);
                navigate("contractors");
              }}
            />
          )}
        </motion.div>

        {/* Footer only on marketing pages */}
        {isMarketing && <Footer onNavigate={navigate} />}
      </div>
    </div>
  );
}
