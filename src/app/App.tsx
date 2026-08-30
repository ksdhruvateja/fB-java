import { useEffect, useState, useRef } from "react";
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
import AppErrorBoundary from "./AppErrorBoundary";
import PartnerPortal from "./PartnerPortal";
import ResetPassword from "./ResetPassword";
import GoProPublicPage from "./GoProPublicPage";
import SubscriptionSuccessModal from "./SubscriptionSuccessModal";
import SubscriptionCancelModal from "./SubscriptionCancelModal";
import { getStoredUser, validateToken, clearSession, loadAllUsers, saveSession, type AuthUser, type UserRole, type ResetRole } from "./auth";
import { brand } from "../config/brand";
import { PAID_HOME_CARE_PLAN_CODE, isPaidHomeCarePlan } from "./subscriptionCatalog";
import { hasProEntitlement } from "./proFeatures";
import { BrandLogo } from "./BrandLogo";
import {
  type AppHistoryState,
  type AppPage,
  clearNavFrames,
  DASHBOARD_PAGES,
  LOGIN_PAGES,
  pushAppHistory,
  replaceAppHistory,
  roleHomeFrame,
  roleHomePage,
} from "./navigation";
import LegalDocumentPage from "./LegalDocumentPage";
import { PUBLIC_FOOTER_LEGAL_LINKS, PUBLIC_CONTRACTOR_LEGAL_LINKS } from "./legalDocuments";
import { applySiteMeta } from "./siteMeta";

function isResetRole(role: string | null): role is ResetRole {
  return role === "homeowner" || role === "contractor" || role === "admin" || role === "partner";
}

function loginPageForResetRole(role: ResetRole): Page {
  if (role === "homeowner") return "homeowner-login";
  if (role === "contractor") return "contractor-login";
  if (role === "admin") return "admin-login";
  return "partner";
}

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
  const navLogoTone = !overHero && !isDark ? "black" : "color";

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-transparent pt-[env(safe-area-inset-top)] transition-colors duration-300">
      <div className="relative w-full px-5 sm:px-6 lg:px-10 xl:px-12 2xl:px-16 py-2.5 sm:py-3.5 min-h-[3.25rem] flex items-center">
        <button
          onClick={() => onNavigate("home")}
          className="relative z-10 flex shrink-0 items-center min-w-0"
          aria-label={brand.productName}
        >
          <BrandLogo
            variant="nav"
            tone={navLogoTone}
            className="transition-opacity duration-300 shrink-0"
          />
        </button>

        {/* Desktop center links — truly centered in the viewport */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 hidden -translate-y-1/2 justify-center lg:flex">
          <div className="pointer-events-auto flex items-center gap-1">
            <button
              onClick={() => onNavigate("home")}
              className={`relative px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
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
              className={`relative px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
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
              className={`relative px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                page === "about" ? active : muted
              }`}
            >
              About
              {page === "about" && (
                <span className={`absolute bottom-0 left-4 right-4 h-0.5 ${overHero ? "bg-white" : "bg-primary"}`} />
              )}
            </button>
          </div>
        </div>

        {/* Right actions — flush right within page gutters */}
        <div className="relative z-10 ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={onToggleDark}
              className={`w-9 h-9 flex items-center justify-center border transition-colors ${border} ${muted}`}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            <button
              onClick={() =>
                marketingContext === "contractors"
                  ? onNavigate("contractor-login")
                  : onNavigate("homeowner-login")
              }
              className={`text-sm font-medium transition-colors whitespace-nowrap ${muted}`}
            >
              Sign In
            </button>

            <button
              onClick={() =>
                marketingContext === "contractors"
                  ? onNavigate("contractor-login")
                  : onNavigate("homeowner-login")
              }
              className={`text-sm px-4 py-2 transition-colors font-medium whitespace-nowrap ${
                overHero
                  ? "bg-white text-black hover:bg-white/90"
                  : "bg-primary text-white hover:bg-primary/90"
              }`}
            >
              {marketingContext === "contractors" ? "Apply Now" : "Post a Repair"}
            </button>
          </div>

          {/* Mobile menu (below md) */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={onToggleDark}
              className={`w-9 h-9 flex items-center justify-center border ${border} ${muted}`}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button
              className={`w-9 h-9 flex items-center justify-center ${ink}`}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>

          {/* Tablet: page links menu while center nav is hidden (md–lg) */}
          <button
            type="button"
            className={`hidden md:flex lg:hidden w-9 h-9 items-center justify-center ${ink}`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
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
          className="lg:hidden bg-background border-t border-border px-5 sm:px-6 lg:px-10 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col gap-1 max-h-[min(80svh,520px)] overflow-y-auto"
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

function Footer({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const linkGroups = [
    {
      title: "Homeowners",
      links: [
        { label: "Post a Job", page: "homeowner-login" as Page },
        { label: "How It Works", page: "home" as Page },
        { label: "AI Assessment", page: "home" as Page },
        { label: "Find a Contractor", page: "home" as Page },
        { label: "Pricing", page: "go-pro" as Page },
        { label: "HomeCare Plans", page: "go-pro" as Page },
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
    <footer className="border-t border-border bg-background px-4 py-10 sm:px-6 sm:py-12 md:py-16 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="max-w-7xl mx-auto">
        {/* Brand */}
        <div className="pb-8 mb-8 border-b border-border/70 lg:border-0 lg:pb-0 lg:mb-0">
          <div className="lg:hidden">
            <div className="mb-4">
              <BrandLogo variant="nav" />
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
              <BrandLogo variant="nav" />
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Legal</p>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-4">
                {PUBLIC_FOOTER_LEGAL_LINKS.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-4 mb-2">
                Contractors
              </p>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-4">
                {PUBLIC_CONTRACTOR_LEGAL_LINKS.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
            <span
              className="font-mono text-[10px] text-primary/80 tracking-wider self-center sm:self-auto"
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

  useEffect(() => {
    applySiteMeta(page);
  }, [page]);

  const toggleDark = () => setIsDark((d) => !d);
  const [scrolled, setScrolled] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(initialState.currentUser);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [resetParams, setResetParams] = useState<{ token: string; role: ResetRole } | null>(null);
  const [subscriptionSuccessPlan, setSubscriptionSuccessPlan] = useState<string | null>(null);
  const [showSubscriptionSuccess, setShowSubscriptionSuccess] = useState(false);
  const [subscriptionActivating, setSubscriptionActivating] = useState(false);
  const [showSubscriptionCancel, setShowSubscriptionCancel] = useState(false);
  const [postPaymentDashboard, setPostPaymentDashboard] = useState(false);
  const [legalPath, setLegalPath] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const p = window.location.pathname.replace(/\/+$/, "") || "/";
    return p === "/legal" || p.startsWith("/legal/") ? p : null;
  });

  useEffect(() => {
    const syncLegalPath = () => {
      const p = window.location.pathname.replace(/\/+$/, "") || "/";
      setLegalPath(p === "/legal" || p.startsWith("/legal/") ? p : null);
    };
    syncLegalPath();
    window.addEventListener("popstate", syncLegalPath);
    return () => window.removeEventListener("popstate", syncLegalPath);
  }, []);

  // Detect password-reset links: /reset-password?token=...&role=... or /?action=reset-password&...
  // Partner intake: /start?partner=CODE or /?partner=CODE
  // Subscription return: /?paid=subscription&plan=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    const isResetPath = path === "/reset-password" || path.endsWith("/reset-password");

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
          // P0-17: never treat return-URL alone as payment success — only mark pending confirmation
          if (params.get("paid") === "dispatch") {
            sessionStorage.setItem("fixbridge-dispatch-confirming", "1");
          } else if (params.get("canceled") === "dispatch") {
            sessionStorage.setItem("fixbridge-dispatch-canceled", "1");
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

    const invoicePaidNum = params.get("invoicePaid");
    const invoiceCanceledNum = params.get("invoice");
    if (invoicePaidNum) {
      try {
        sessionStorage.setItem("fixbridge-invoice-confirming", invoicePaidNum);
      } catch {
        /* ignore */
      }
      validateToken().then((result) => {
        if (result.ok && result.user.role === "homeowner") {
          setCurrentUser(result.user);
          setPage("homeowner-dashboard");
        }
      });
      params.delete("invoicePaid");
      const nextInv = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${nextInv ? `?${nextInv}` : ""}`);
    } else if (invoiceCanceledNum) {
      try {
        sessionStorage.setItem("fixbridge-invoice-canceled", invoiceCanceledNum);
      } catch {
        /* ignore */
      }
      validateToken().then((result) => {
        if (result.ok && result.user.role === "homeowner") {
          setCurrentUser(result.user);
          setPage("homeowner-dashboard");
        }
      });
      params.delete("invoice");
      const nextInvCancel = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${nextInvCancel ? `?${nextInvCancel}` : ""}`);
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
        setSubscriptionActivating(true);
        setShowSubscriptionSuccess(true);
        setPostPaymentDashboard(true);
        validateToken().then((result) => {
          if (result.ok) {
            setCurrentUser(result.user);
            if (result.user.role === "homeowner") {
              setPage("homeowner-dashboard");
            }
            // Plan activates only after verified webhook — poll until plan_code matches.
            const expected = planCode || PAID_HOME_CARE_PLAN_CODE;
            if (
              hasProEntitlement(result.user.planCode, result.user.homeCareSubscription) &&
              (result.user.planCode === expected ||
                (isPaidHomeCarePlan(expected) && isPaidHomeCarePlan(result.user.planCode)))
            ) {
              setSubscriptionActivating(false);
            }
          }
        });
      }
      if (params.get("canceled") === "subscription") {
        setShowSubscriptionCancel(true);
        setPage("go-pro");
      }
      params.delete("paid");
      params.delete("canceled");
      params.delete("plan");
      const next = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
    }

    if (isResetPath || params.get("action") === "reset-password") {
      const token = params.get("token");
      const role = params.get("role");
      if (token && isResetRole(role)) {
        setResetParams({ token, role });
        window.history.replaceState({}, "", "/");
      }
    }

    const partner =
      params.get("partner") || params.get("ref") || params.get("code");
    const discountParam = params.get("discount") || params.get("promo");
    const isStartPath = path === "/start" || path.endsWith("/start");

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

  const navigate = (p: Page, options?: { replace?: boolean; user?: AuthUser | null }) => {
    if (p === "home" || p === "contractors") {
      setMarketingContext(p);
    }
    setPage(p);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;

    const actor = options?.user !== undefined ? options.user : currentUser;
    const historyPage = p as AppPage;
    if (options?.replace) {
      if (DASHBOARD_PAGES.includes(historyPage) && actor) {
        replaceAppHistory(historyPage, roleHomeFrame(actor.role as UserRole));
      } else {
        replaceAppHistory(historyPage);
      }
    } else if (DASHBOARD_PAGES.includes(historyPage) && actor) {
      pushAppHistory(historyPage, roleHomeFrame(actor.role as UserRole));
    }
  };

  const handleSignOut = (nextPage: Page) => {
    clearSession();
    clearNavFrames();
    setCurrentUser(null);
    replaceAppHistory(nextPage as AppPage);
    setPage(nextPage);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
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

  // After Stripe Checkout return, poll until webhook activates plan_code.
  useEffect(() => {
    if (!showSubscriptionSuccess || !subscriptionActivating) return;
    const expected = subscriptionSuccessPlan || PAID_HOME_CARE_PLAN_CODE;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      const result = await validateToken();
      if (cancelled) return;
      if (result.ok) {
        setCurrentUser(result.user);
        if (
          hasProEntitlement(result.user.planCode, result.user.homeCareSubscription) &&
          (result.user.planCode === expected ||
            (isPaidHomeCarePlan(expected) && isPaidHomeCarePlan(result.user.planCode)) ||
            attempts >= 20)
        ) {
          setSubscriptionActivating(false);
          return;
        }
      }
      window.setTimeout(() => void tick(), 1500);
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [showSubscriptionSuccess, subscriptionActivating, subscriptionSuccessPlan]);

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
    // Signed-in users should not land on login screens (browser back / stale state).
    if (currentUser && LOGIN_PAGES.includes(page)) {
      const home = roleHomePage(currentUser.role);
      setPage(home);
      replaceAppHistory(home, roleHomeFrame(currentUser.role as UserRole));
    }
  }, [currentUser, page]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const state = (event.state || {}) as AppHistoryState;
      if (!state.fixbridgePage) return;

      if (currentUser && LOGIN_PAGES.includes(state.fixbridgePage)) {
        const home = roleHomePage(currentUser.role);
        replaceAppHistory(home, roleHomeFrame(currentUser.role as UserRole));
        setPage(home);
        return;
      }

      if (!currentUser && DASHBOARD_PAGES.includes(state.fixbridgePage)) {
        const login =
          state.fixbridgePage === "admin"
            ? "admin-login"
            : state.fixbridgePage === "contractor-dashboard"
              ? "contractor-login"
              : "homeowner-login";
        replaceAppHistory(login as AppPage);
        setPage(login);
        return;
      }

      setPage(state.fixbridgePage);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [currentUser]);

  // Show reset-password page when the link is clicked
  if (resetParams) {
    return (
      <div className={`${isDark ? "dark" : ""} size-full`} style={{ colorScheme: isDark ? "dark" : "light" }}>
        <div className="size-full overflow-y-auto bg-background text-foreground [font-family:'DM_Sans',sans-serif]">
          <ResetPassword
            token={resetParams.token}
            role={resetParams.role}
            onDone={() => {
              const next = loginPageForResetRole(resetParams.role);
              setResetParams(null);
              navigate(next);
            }}
            onRequestNew={() => {
              const next = loginPageForResetRole(resetParams.role);
              setResetParams(null);
              navigate(next);
            }}
          />
        </div>
      </div>
    );
  }

  if (legalPath) {
    return (
      <div className={`${isDark ? "dark" : ""} size-full`} style={{ colorScheme: isDark ? "dark" : "light" }}>
        <LegalDocumentPage
          pathname={legalPath}
          onNavigateHome={() => {
            window.history.pushState({}, "", "/");
            setLegalPath(null);
            setPage("home");
          }}
        />
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
                navigate("homeowner-dashboard", { replace: true, user });
              }}
            />
          )}

          <SubscriptionCancelModal
            open={showSubscriptionCancel}
            onClose={() => setShowSubscriptionCancel(false)}
            onTryAgain={() => {
              setShowSubscriptionCancel(false);
              setPage("go-pro");
            }}
          />

          {page === "homeowner-login" && (
            <HomeownerLogin
              onLogin={(user) => {
                setCurrentUser(user);
                loadAllUsers(); // populate contractor cache after sign-in
                navigate("homeowner-dashboard", { replace: true, user });
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
                navigate("contractor-dashboard", { replace: true, user });
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
                navigate("admin", { replace: true, user });
              }}
              onBack={() => navigate("home")}
            />
          )}

          {page === "partner" && (
            <PartnerPortal onBack={() => navigate("home")} />
          )}

          {page === "homeowner-dashboard" && currentUser && (
            <AppErrorBoundary
              section="homeowner-dashboard"
              onGoHome={() => {
                window.history.replaceState(
                  { fixbridgePage: "homeowner-dashboard", fixbridgeAuth: true },
                  "",
                  window.location.pathname + window.location.search
                );
                window.location.reload();
              }}
            >
              <HomeownerDashboard
              onLogout={() => handleSignOut("home")}
              user={currentUser}
              isDark={isDark}
              onToggleDark={toggleDark}
              onUserUpdated={(u) => setCurrentUser(u)}
              initialTab={postPaymentDashboard ? "go-pro" : undefined}
              showSubscriptionSuccess={showSubscriptionSuccess}
              subscriptionSuccessPlanCode={subscriptionSuccessPlan}
              subscriptionActivating={subscriptionActivating}
              onDismissSubscriptionSuccess={() => {
                setShowSubscriptionSuccess(false);
                setSubscriptionSuccessPlan(null);
                setSubscriptionActivating(false);
                setPostPaymentDashboard(false);
              }}
              />
            </AppErrorBoundary>
          )}

          {page === "contractor-dashboard" && currentUser && currentUser.role === "contractor" && (
            <AppErrorBoundary section="contractor-dashboard">
              <ContractorDashboard
              onLogout={() => handleSignOut("contractors")}
              user={currentUser}
              isDark={isDark}
              onToggleDark={toggleDark}
              onUserUpdated={(u) => setCurrentUser(u)}
              />
            </AppErrorBoundary>
          )}
          {page === "admin" && currentUser?.role === "admin" && (
            <AppErrorBoundary section="admin-dashboard">
              <AdminPanel
                onBack={() => navigate(marketingContext)}
                onSignOut={() => handleSignOut("admin-login")}
                user={currentUser}
                isDark={isDark}
                onToggleDark={toggleDark}
              />
            </AppErrorBoundary>
          )}
        </motion.div>

        {/* Footer only on marketing pages */}
        {isMarketing && <Footer onNavigate={navigate} />}
      </div>
    </div>
  );
}