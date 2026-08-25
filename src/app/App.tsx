import { useEffect, useState, useRef, Component, type ErrorInfo, type ReactNode } from "react";
import { motion } from "motion/react";
import { Sun, Moon, Menu, X, MapPin, ArrowRight } from "lucide-react";
import CustomerPage from "./CustomerPage";
import ContractorPage from "./ContractorPage";
import AboutPage from "./AboutPage";
import HomeownerLogin from "./HomeownerLogin";
import ContractorLogin from "./ContractorLogin";
import AdminLogin from "./AdminLogin";
import HomeownerDashboard from "./HomeownerDashboard";
import ContractorDashboard from "./ContractorDashboard";
import AdminPanel from "./AdminPanel";
import PartnerPortal from "./PartnerPortal";
import ResetPassword from "./ResetPassword";
import GoProPublicPage from "./GoProPublicPage";
import SubscriptionSuccessModal from "./SubscriptionSuccessModal";
import { getStoredUser, validateToken, clearSession, loadAllUsers, saveSession, type AuthUser, type UserRole } from "./auth";
import { brand } from "../config/brand";
import { BrandLogo } from "./BrandLogo";

type Page =
  | "home"
  | "contractors"
  | "about"
  | "go-pro"
  | "homeowner-login"
  | "contractor-login"
  | "admin-login"
  | "partner"
  | "homeowner-dashboard"
  | "contractor-dashboard"
  | "admin";

const APP_STATE_KEY = "fixbridge-app-state";
const THEME_KEY = "fixbridge-theme";

function canUseStorage() {
  if (typeof window === "undefined") return false;
  try {
    return typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function readStoredTheme(): boolean {
  if (!canUseStorage()) return false;
  try {
    return window.localStorage.getItem(THEME_KEY) === "dark";
  } catch {
    return false;
  }
}

function applyThemeClass(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

function isValidPage(value: unknown): value is Page {
  return (
    value === "home" ||
    value === "contractors" ||
    value === "about" ||
    value === "go-pro" ||
    value === "homeowner-login" ||
    value === "contractor-login" ||
    value === "admin-login" ||
    value === "partner" ||
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
  const overHero =
    (page === "home" || page === "contractors" || page === "about" || page === "go-pro") &&
    !scrolled &&
    !menuOpen;
  const ink = overHero ? "text-white" : "text-foreground";
  const muted = overHero ? "text-white/65 hover:text-white" : "text-muted-foreground hover:text-foreground";
  const active = overHero ? "text-white" : "text-foreground";
  const border = overHero ? "border-white/30" : "border-border";

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 pt-[env(safe-area-inset-top)] ${
        scrolled || menuOpen
          ? "bg-background/95 backdrop-blur-md border-b border-border shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between gap-3 min-h-[3.25rem]">
        {/* Logo */}
        <button
          onClick={() => onNavigate("home")}
          className="flex items-center shrink-0 min-w-0"
          aria-label={brand.productName}
        >
          <BrandLogo variant="nav" tone={overHero || isDark ? "white" : "black"} />
        </button>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          <button
            onClick={() => onNavigate("home")}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              page === "home" ? active : muted
            }`}
          >
            For Homeowners
            {page === "home" && (
              <span className={`absolute bottom-0 left-4 right-4 h-0.5 ${overHero ? "bg-white" : "bg-primary"}`} />
            )}
          </button>
          <button
            onClick={() => onNavigate("contractors")}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              page === "contractors" ? active : muted
            }`}
          >
            For Contractors
            {page === "contractors" && (
              <span className={`absolute bottom-0 left-4 right-4 h-0.5 ${overHero ? "bg-white" : "bg-primary"}`} />
            )}
          </button>
          <button
            onClick={() => onNavigate("about")}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              page === "about" ? active : muted
            }`}
          >
            About
            {page === "about" && (
              <span className={`absolute bottom-0 left-4 right-4 h-0.5 ${overHero ? "bg-white" : "bg-primary"}`} />
            )}
          </button>
        </div>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={onToggleDark}
            className={`w-9 h-9 flex items-center justify-center border transition-colors ${border} ${muted}`}
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
            className={`text-sm transition-colors ${muted}`}
          >
            Sign In
          </button>

          <button
            onClick={() =>
              marketingContext === "contractors"
                ? onNavigate("contractor-login")
                : onNavigate("homeowner-login")
            }
            className={`text-sm px-4 py-2 transition-colors font-medium ${
              overHero
                ? "bg-white text-black hover:bg-white/90"
                : "bg-primary text-white hover:bg-primary/90"
            }`}
          >
            {marketingContext === "contractors" ? "Apply Now" : "Post a Repair"}
          </button>
        </div>

        {/* Mobile */}
        <div className="md:hidden flex items-center gap-2">
          <button
            onClick={onToggleDark}
            className={`w-9 h-9 flex items-center justify-center border ${border} ${muted}`}
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            className={`w-9 h-9 flex items-center justify-center ${ink}`}
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
          className="md:hidden bg-background border-t border-border px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col gap-1 max-h-[min(80svh,520px)] overflow-y-auto"
        >
          <button
            onClick={() => { onNavigate("home"); setMenuOpen(false); }}
            className={`text-sm text-left font-medium py-3 ${page === "home" ? "text-primary" : "text-muted-foreground"}`}
          >
            For Homeowners
          </button>
          <button
            onClick={() => { onNavigate("contractors"); setMenuOpen(false); }}
            className={`text-sm text-left font-medium py-3 ${page === "contractors" ? "text-primary" : "text-muted-foreground"}`}
          >
            For Contractors
          </button>
          <button
            onClick={() => { onNavigate("about"); setMenuOpen(false); }}
            className={`text-sm text-left font-medium py-3 ${page === "about" ? "text-primary" : "text-muted-foreground"}`}
          >
            About
          </button>
          <div className="pt-3 mt-1 border-t border-border flex flex-col gap-2">
            <button
              onClick={() => { onNavigate("homeowner-login"); setMenuOpen(false); }}
              className="text-sm border border-border text-foreground px-4 py-3 text-left rounded-sm"
            >
              Sign In as Homeowner
            </button>
            <button
              onClick={() => { onNavigate("contractor-login"); setMenuOpen(false); }}
              className="text-sm bg-primary text-white px-4 py-3 text-left font-medium rounded-sm"
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

function Footer({ onNavigate, isDark }: { onNavigate: (p: Page) => void; isDark: boolean }) {
  const logoTone = isDark ? "white" : "black";
  const linkGroups = [
    {
      title: "Homeowners",
      links: [
        { label: "Post a Job", page: "homeowner-login" as Page },
        { label: "How It Works", page: "home" as Page },
        { label: "AI Assessment", page: "home" as Page },
        { label: "Find a Contractor", page: "home" as Page },
        { label: "Pricing", page: "go-pro" as Page },
        { label: "Go Pro Plans", page: "go-pro" as Page },
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
        { label: `About ${brand.productName}`, page: "about" as Page },
        { label: "Blog", page: "home" as Page },
        { label: "Press", page: "home" as Page },
        { label: "Careers", page: "home" as Page },
        { label: "Contact", page: "home" as Page },
        { label: "Staff login", page: "admin-login" as Page },
        { label: "Partner portal", page: "partner" as Page },
      ],
    },
  ];

  return (
    <footer className="bg-card border-t border-border py-10 sm:py-12 md:py-16 px-4 sm:px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="max-w-7xl mx-auto">
        {/* Brand */}
        <div className="pb-8 mb-8 border-b border-border lg:border-0 lg:pb-0 lg:mb-0">
          <div className="lg:hidden">
            <div className="mb-4">
              <BrandLogo variant="footer" tone={logoTone} />
            </div>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed mb-3">
              The middle layer between homeowners and licensed local contractors — handling
              matching, trust, and paperwork so neither side has to.
            </p>
            <div className="flex items-center gap-2">
              <MapPin size={11} className="text-primary shrink-0" />
              <span className="font-mono text-[11px] text-muted-foreground">NYC & Long Island</span>
            </div>
          </div>
        </div>

        {/* Desktop / tablet: brand + 3 columns · Mobile: 2-column link split */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-x-4 gap-y-8 sm:gap-x-8 sm:gap-y-10 mb-8 sm:mb-10 md:mb-12">
          <div className="hidden lg:block lg:col-span-2 pr-6">
            <div className="mb-4">
              <BrandLogo variant="footer" tone={logoTone} />
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

          {linkGroups.map(({ title, links }) => (
            <div key={title} className="min-w-0">
              <p className="font-mono text-[11px] tracking-widest text-foreground uppercase mb-3 sm:mb-4">
                {title}
              </p>
              <ul className="space-y-2 sm:space-y-2.5">
                {links.map(({ label, page }) => (
                  <li key={label}>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate(page);
                        if (label === "Contact") {
                          requestAnimationFrame(() => {
                            document.querySelector<HTMLElement>("[data-scroll-root]")?.scrollTo({ top: 0, behavior: "smooth" });
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          });
                        }
                      }}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left leading-snug"
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
        <div className="border border-border p-4 sm:p-5 mb-8 sm:mb-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 bg-background">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground mb-0.5">
              Are you a licensed contractor in NYC or Long Island?
            </p>
            <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">
              Join 312+ pros getting matched with real jobs — zero monthly fees.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("contractor-login")}
            className="font-medium text-sm text-primary border border-primary/40 px-4 py-2.5 hover:bg-primary hover:text-white transition-all flex items-center justify-center gap-2 group shrink-0 w-full sm:w-auto"
          >
            See Contractor Platform
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        <div className="border-t border-border pt-6 sm:pt-8 flex flex-col gap-4">
          <p className="font-mono text-[11px] text-muted-foreground text-center sm:text-left">
            © 2026 {brand.legalName} AI, Inc. All rights reserved.
          </p>
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-center justify-center sm:justify-start md:justify-end gap-3 sm:gap-4 md:gap-6">
            {["Privacy Policy", "Terms of Service", "Contractor Agreement"].map((item) => (
              <a
                key={item}
                href="#"
                className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {item}
              </a>
            ))}
            <span
              className="font-mono text-[10px] text-primary/80 tracking-wider"
              title="Deploy build stamp — hard-refresh if this does not match the latest release"
            >
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
  const [isDark, setIsDark] = useState(() => {
    const dark = readStoredTheme();
    if (typeof document !== "undefined") applyThemeClass(dark);
    return dark;
  });

  useEffect(() => {
    applyThemeClass(isDark);
    if (canUseStorage()) {
      try {
        window.localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
      } catch {
        /* ignore */
      }
    }
  }, [isDark]);

  const toggleDark = () => setIsDark((d) => !d);
  const [scrolled, setScrolled] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(initialState.currentUser);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [resetParams, setResetParams] = useState<{ token: string; role: UserRole } | null>(null);
  const [subscriptionSuccessPlan, setSubscriptionSuccessPlan] = useState<string | null>(null);
  const [showSubscriptionSuccess, setShowSubscriptionSuccess] = useState(false);
  const [postPaymentDashboard, setPostPaymentDashboard] = useState(false);

  // Detect password-reset links: /?action=reset-password&token=...&role=...
  // Partner intake: /start?partner=CODE or /?partner=CODE
  // Subscription return: /?paid=subscription&plan=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("go-pro") === "1" || params.get("subscribe") === "1") {
      setPage("go-pro");
      params.delete("go-pro");
      params.delete("subscribe");
      const next = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
    }

    if (params.get("paid") === "dispatch" || params.get("canceled") === "dispatch") {
      const jobId = params.get("job");
      if (jobId) {
        try {
          sessionStorage.setItem("fixbridge-stripe-active-job-id", jobId);
          if (params.get("paid") === "dispatch") {
            sessionStorage.setItem("fixbridge-dispatch-paid", "1");
          }
        } catch {
          /* ignore */
        }
      }
      validateToken().then((result) => {
        if (result.ok) {
          setCurrentUser(result.user);
          if (result.user.role === "homeowner") {
            setPage("homeowner-dashboard");
          }
        }
      });
      params.delete("paid");
      params.delete("canceled");
      params.delete("job");
      const nextDispatch = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${nextDispatch ? `?${nextDispatch}` : ""}`);
    }

    if (params.get("paid") === "subscription" || params.get("canceled") === "subscription") {
      const jobId = params.get("jobId");
      const planCode = params.get("plan");
      if (jobId) {
        sessionStorage.setItem("fixbridge-stripe-active-job-id", jobId);
        params.delete("jobId");
      }
      if (params.get("paid") === "subscription") {
        if (planCode) setSubscriptionSuccessPlan(planCode);
        setShowSubscriptionSuccess(true);
        setPostPaymentDashboard(true);
        validateToken().then((result) => {
          if (result.ok) {
            setCurrentUser(result.user);
            if (result.user.role === "homeowner") {
              setPage("homeowner-dashboard");
            }
          }
        });
      }
      if (params.get("canceled") === "subscription") {
        setPage("go-pro");
      }
      params.delete("paid");
      params.delete("canceled");
      params.delete("plan");
      const next = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
    }

    if (params.get("action") === "reset-password") {
      const token = params.get("token");
      const role = params.get("role");
      if (token && (role === "homeowner" || role === "contractor")) {
        setResetParams({ token, role });
        window.history.replaceState({}, "", window.location.pathname);
      }
    }

    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    const isStartPath = path === "/start" || path.endsWith("/start");
    const partner =
      params.get("partner") || params.get("ref") || params.get("code");
    const discountParam = params.get("discount") || params.get("promo");

    if (partner) {
      try {
        const code = partner.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
        if (code) {
          sessionStorage.setItem("fixbridge-partner-code", code);
          sessionStorage.setItem("fixbridge-partner-intake", "1");
        }
      } catch {
        // ignore
      }
    }

    if (discountParam) {
      try {
        const code = discountParam.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
        if (code) sessionStorage.setItem("fixbridge-discount-code", code);
      } catch {
        // ignore
      }
    }

    if (isStartPath || partner || discountParam) {
      // Open normal customer intake (login → report an issue)
      const user = getStoredUser();
      if (user?.role === "homeowner") {
        setPage("homeowner-dashboard");
      } else {
        setPage("homeowner-login");
      }
      params.delete("partner");
      params.delete("ref");
      params.delete("code");
      params.delete("discount");
      params.delete("promo");
      params.delete("portal");
      const next = params.toString();
      const cleanPath = isStartPath ? "/" : window.location.pathname;
      window.history.replaceState({}, "", `${cleanPath}${next ? `?${next}` : ""}`);
      return;
    }

    // Direct staff portal: /?portal=admin
    if (params.get("portal") === "admin") {
      setPage("admin-login");
      params.delete("portal");
      const next = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
    }

    // Stripe Connect return after payout account setup (contractor dashboard handles cleanup)
    const stripe = params.get("stripe");
    if (stripe === "return" || stripe === "refresh") {
      const user = getStoredUser();
      if (user?.role === "contractor") {
        setPage("contractor-dashboard");
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

  const handleSignOut = (nextPage: Page) => {
    clearSession();
    setCurrentUser(null);
    navigate(nextPage);
    void import("./auth0SignOut").then(({ runAuth0SignOut }) => runAuth0SignOut()).catch(() => {});
  };

  const isMarketing = page === "home" || page === "contractors" || page === "about" || page === "go-pro";
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
        const params = new URLSearchParams(window.location.search);
        const stripe = params.get("stripe");
        if (result.user.role === "contractor" && (stripe === "return" || stripe === "refresh")) {
          setPage("contractor-dashboard");
        }
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
      if (page === "admin") setPage("admin-login");
      else setPage("home");
    }
    // Admin Control requires a dedicated admin-role account (not contractor).
    if (currentUser && page === "admin" && currentUser.role !== "admin") {
      setPage(currentUser.role === "contractor" ? "contractor-dashboard" : "homeowner-dashboard");
    }
    // Admins landing on contractor/homeowner dashboards go to Control.
    if (currentUser?.role === "admin" && (page === "contractor-dashboard" || page === "homeowner-dashboard")) {
      setPage("admin");
    }
    // Already signed-in staff should skip the login screen.
    if (currentUser?.role === "admin" && page === "admin-login") {
      setPage("admin");
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
            onToggleDark={toggleDark}
            scrolled={scrolled}
          />
        )}

        {/* Page content */}
        <motion.div
          key={page}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          {page === "home" && (
            <CustomerPage
              scrollContainer={scrollRef}
              onGetStarted={() => navigate("homeowner-login")}
            />
          )}
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

          {page === "go-pro" && (
            <GoProPublicPage
              currentUser={currentUser}
              onBack={() => navigate("home")}
              onLoginSuccess={(user) => {
                setCurrentUser(user);
                navigate("homeowner-dashboard");
              }}
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
              onGoStaff={() => navigate("admin-login")}
            />
          )}

          {page === "admin-login" && (
            <AdminLogin
              onLogin={(user) => {
                setCurrentUser(user);
                navigate("admin");
              }}
              onBack={() => navigate("home")}
            />
          )}

          {page === "partner" && (
            <PartnerPortal onBack={() => navigate("home")} />
          )}

          {page === "homeowner-dashboard" && currentUser && (
            <HomeownerDashboard
              onLogout={() => handleSignOut("home")}
              user={currentUser}
              isDark={isDark}
              onToggleDark={toggleDark}
              onUserUpdated={(u) => setCurrentUser(u)}
              initialTab={postPaymentDashboard ? "go-pro" : undefined}
              showSubscriptionSuccess={showSubscriptionSuccess}
              subscriptionSuccessPlanCode={subscriptionSuccessPlan}
              onDismissSubscriptionSuccess={() => {
                setShowSubscriptionSuccess(false);
                setSubscriptionSuccessPlan(null);
                setPostPaymentDashboard(false);
              }}
            />
          )}

          {page === "contractor-dashboard" && currentUser && currentUser.role === "contractor" && (
            <ContractorDashboard
              onLogout={() => handleSignOut("contractors")}
              user={currentUser}
              isDark={isDark}
              onToggleDark={toggleDark}
              onUserUpdated={(u) => setCurrentUser(u)}
            />
          )}
          {page === "admin" && currentUser?.role === "admin" && (
            <ErrorBoundary>
              <AdminPanel
                onBack={() => navigate(marketingContext)}
                onSignOut={() => handleSignOut("admin-login")}
                user={currentUser}
                isDark={isDark}
                onToggleDark={toggleDark}
              />
            </ErrorBoundary>
          )}
        </motion.div>

        {/* Footer only on marketing pages */}
        {isMarketing && <Footer onNavigate={navigate} isDark={isDark} />}
      </div>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught admin error:", error, errorInfo);
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-2xl mx-auto my-12 bg-red-50 border border-red-200 rounded-3xl text-red-900 shadow-sm">
          <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
          <p className="text-sm mb-4">The Admin Panel crashed due to a frontend error. Please share this screenshot or error with the developer:</p>
          <pre className="p-4 bg-red-950 text-red-100 rounded-2xl overflow-auto text-xs font-mono max-h-96 whitespace-pre-wrap">
            {this.state.error?.stack || this.state.error?.toString()}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition"
          >
            Reload page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

