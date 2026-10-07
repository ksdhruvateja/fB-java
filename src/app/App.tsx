import SolutionPage from "./ServiceSolutions";
import { PUBLIC_PAGES, SOLUTION_PAGES, PRIVATE_PATHS, publicPageForPath } from "../../shared/public-seo.js";
import { Nav, Footer } from "./MarketingLayout";
import "./portalDensity.css";
import { useEffect, useState, useRef } from "react";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
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
import { getStoredToken, getStoredUser, validateToken, clearSession, loadAllUsers, saveSession, type AuthUser, type UserRole, type ResetRole } from "./auth";
import { storePendingReferralCode } from "./referralSession";
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
  noteHistoryPop,
  pushAppHistory,
  replaceAppHistory,
  seedAppHistory,
  roleHomeFrame,
  roleHomePage,
} from "./navigation";
import LegalDocumentPage from "./LegalDocumentPage";
import MarketingUnsubscribePage from "./MarketingUnsubscribePage";
import { applySiteMeta } from "./siteMeta";
import LeadConnectorChatWidget, { shouldShowLeadConnectorChat } from "./LeadConnectorChatWidget";

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
  | "home-repair"
  | "appliance-repair"
  | "home-maintenance"
  | "property-care"
  | "broken-home-items"
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
    SOLUTION_PAGES.some(p => p.page === value) ||
    value === "homeowner-login" ||
    value === "contractor-login" ||
    value === "admin-login" ||
    value === "partner" ||
    value === "homeowner-dashboard" ||
    value === "contractor-dashboard" ||
    value === "admin"
  );
}

const DASHBOARD_PAGE_KEYS: Page[] = ["homeowner-dashboard", "contractor-dashboard", "admin"];

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

    const rawPage = isValidPage(parsed.page) ? parsed.page : fallback.page;
    const marketingContext =
      parsed.marketingContext === "contractors" ? "contractors" : "home";

    // Restore session from the secure token cache (no password stored here)
    const currentUser = getStoredUser();

    // Never restore a dashboard page without a cached user — prevents white screen
    // flash on first load after logout (clearSession removes the user but not the page).
    const page =
      DASHBOARD_PAGE_KEYS.includes(rawPage) && !currentUser ? fallback.page : rawPage;

    return { page, marketingContext, currentUser };
  } catch {
    const currentUser = getStoredUser();
    return currentUser ? { ...fallback, currentUser, page: roleHomePage(currentUser.role) as Page } : fallback;
  }
}

// ─── Shared Nav (marketing pages only) ───────────────────────────────────────

export default function App() {
  const savedState = loadInitialState();
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const explicitPage = publicPageForPath(path)?.page || Object.entries(PRIVATE_PATHS).find(([,url]) => url === path)?.[0];
  const initialState = { ...savedState, page: (explicitPage && (path !== "/" || !DASHBOARD_PAGE_KEYS.includes(savedState.page)) ? explicitPage : savedState.page) as Page };
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
    applySiteMeta(page, window.location.pathname, window.location.search);
  }, [page]);

  useEffect(() => {
    if (!window.location.hash) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  }, [page]);

  const toggleDark = () => setIsDark((d) => !d);
  const [scrolled, setScrolled] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(initialState.currentUser);
  // True while the startup JWT check is in-flight; prevents white-screen flash on
  // the first render when a cached user exists but the token hasn't been validated yet.
  // Cached session renders immediately. /api/auth/me refreshes in the background
  // and must not hide the dashboard behind a full-screen spinner.
  const [authLoading, setAuthLoading] = useState(() => Boolean(getStoredToken() && !initialState.currentUser));
  const lastSignedInRole = useRef<UserRole | null>(initialState.currentUser?.role || null);
  const [authRecoveryMessage, setAuthRecoveryMessage] = useState("");
  const [authRetry, setAuthRetry] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [resetParams, setResetParams] = useState<{ token: string; role: ResetRole } | null>(null);
  const [subscriptionSuccessPlan, setSubscriptionSuccessPlan] = useState<string | null>(null);
  const [showSubscriptionSuccess, setShowSubscriptionSuccess] = useState(false);
  const [confirmedSubscriptionUserId, setConfirmedSubscriptionUserId] = useState<string | null>(null);
  const [subscriptionActivating, setSubscriptionActivating] = useState(false);
  const [subscriptionConfirmationDelayed, setSubscriptionConfirmationDelayed] = useState(false);
  const [showSubscriptionCancel, setShowSubscriptionCancel] = useState(false);
  const [subscriptionCancelChecking, setSubscriptionCancelChecking] = useState(false);
  const [subscriptionCancelActive, setSubscriptionCancelActive] = useState(false);
  const [postPaymentDashboard, setPostPaymentDashboard] = useState(false);
  const [legalPath, setLegalPath] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const p = window.location.pathname.replace(/\/+$/, "") || "/";
    return p === "/legal" || p.startsWith("/legal/") ? p : null;
  });
  const [marketingUnsub, setMarketingUnsub] = useState<{ token: string; channel: string } | null>(() => {
    if (typeof window === "undefined") return null;
    const p = window.location.pathname.replace(/\/+$/, "") || "/";
    if (p !== "/marketing/unsubscribe") return null;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || "";
    if (!token) return null;
    return { token, channel: params.get("channel") || "email" };
  });

  useEffect(() => {
    const syncLegalPath = () => {
      const p = window.location.pathname.replace(/\/+$/, "") || "/";
      setLegalPath(p === "/legal" || p.startsWith("/legal/") ? p : null);
      if (p === "/marketing/unsubscribe") {
        const params = new URLSearchParams(window.location.search);
        const token = params.get("token") || "";
        setMarketingUnsub(
          token ? { token, channel: params.get("channel") || "email" } : null
        );
      } else {
        setMarketingUnsub(null);
      }
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

    const referralFromUrl = params.get("ref") || params.get("referral");
    if (referralFromUrl) {
      storePendingReferralCode(referralFromUrl);
    }

    if (params.get("go-pro") === "1" || params.get("subscribe") === "1") {
      setPage("go-pro");
      params.delete("go-pro");
      params.delete("subscribe");
      const next = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
    }

    if (params.get("paid") === "pending-professional" || params.get("canceled") === "pending-professional") {
      const pendingId = params.get("pendingServiceRequestId");
      if (pendingId) {
        try {
          sessionStorage.setItem("fixbridge-pending-service-request-id", pendingId);
          sessionStorage.setItem(
            "fixbridge-pending-service-request-result",
            params.get("paid") === "pending-professional" ? "paid" : "canceled"
          );
        } catch {
          /* ignore */
        }
      }
      validateToken({ syncCheckout: true }).then((result) => {
        if (result.ok) {
          setCurrentUser(result.user);
          if (result.user.role === "homeowner") {
            setPage("homeowner-dashboard");
          }
        }
      });
      params.delete("paid");
      params.delete("canceled");
      params.delete("pendingServiceRequestId");
      const nextPending = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${nextPending ? `?${nextPending}` : ""}`);
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
        const returnTo = params.get("returnTo");
        const upgradeOwner = sessionStorage.getItem("fixbridge.ai-after-plan");
        if (upgradeOwner && upgradeOwner === String(getStoredUser()?.id)) sessionStorage.setItem("fixbridge.ai-upgrade-return", upgradeOwner);
        if (returnTo) {
          try {
            sessionStorage.setItem("fixbridge-upgrade-return", returnTo);
          } catch {
            /* ignore */
          }
        }
        if (planCode) setSubscriptionSuccessPlan(planCode);
        setSubscriptionActivating(true);
        setSubscriptionConfirmationDelayed(false);
        setShowSubscriptionSuccess(true);
        setPostPaymentDashboard(returnTo !== "diy" && returnTo !== "report" && returnTo !== "hire");
        validateToken({ syncCheckout: true }).then((result) => {
          if (result.ok) {
            setCurrentUser(result.user);
            if (result.user.role === "homeowner") {
              setPage("homeowner-dashboard");
            }
            // Plan activates only after verified webhook — poll until plan_code matches.
            const expected = planCode || PAID_HOME_CARE_PLAN_CODE;
            if (
              result.source !== "cached" && hasProEntitlement(result.user.planCode, result.user.homeCareSubscription) &&
              (result.user.planCode === expected ||
                (isPaidHomeCarePlan(expected) && isPaidHomeCarePlan(result.user.planCode)))
            ) {
              setConfirmedSubscriptionUserId(String(result.user.id));
              setSubscriptionActivating(false);
            }
          }
        });
      }
      if (params.get("canceled") === "subscription") {
        sessionStorage.removeItem("fixbridge.ai-upgrade-return");
        setShowSubscriptionCancel(true);
        setSubscriptionCancelChecking(true);
        setSubscriptionCancelActive(false);
        setPage(getStoredUser()?.role === "homeowner" ? "homeowner-dashboard" : "go-pro");
        validateToken({ syncCheckout: true }).then(result => {
          if (result.ok) {
            setCurrentUser(result.user);
            if (result.user.role === "homeowner") setPage("homeowner-dashboard");
            setSubscriptionCancelActive(result.source !== "cached" && hasProEntitlement(result.user.planCode, result.user.homeCareSubscription));
          }
        }).finally(() => setSubscriptionCancelChecking(false));
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

  useEffect(() => {
    seedAppHistory(page as AppPage, currentUser ? roleHomeFrame(currentUser.role as UserRole) : undefined);
    // Seed once so the landing entry is FixBridge and the external referrer stays behind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrolled(e.currentTarget.scrollTop > 48);
  };

  const navigate = (p: Page, options?: { replace?: boolean; user?: AuthUser | null }) => {
    if (p === page && !options?.replace) return;
    if (p === "home" || p === "contractors") {
      setMarketingContext(p);
    }
    setPage(p);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;

    const actor = options?.user !== undefined ? options.user : currentUser;
    const historyPage = p as AppPage;
    const nav = DASHBOARD_PAGES.includes(historyPage) && actor
      ? roleHomeFrame(actor.role as UserRole)
      : undefined;
    if (options?.replace) replaceAppHistory(historyPage, nav);
    else pushAppHistory(historyPage, nav);
  };

  const handleSignOut = (nextPage: Page) => {
    clearSession();
    setAuthRecoveryMessage("");
    clearNavFrames();
    setCurrentUser(null);
    // Clear stored page so the next cold load doesn't start on a dashboard page
    // without a session (which would cause a white-screen flash).
    try { window.localStorage.removeItem(APP_STATE_KEY); } catch { /* ignore */ }
    replaceAppHistory(nextPage as AppPage);
    setPage(nextPage);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const isMarketing = PUBLIC_PAGES.some(p => p.page === page);
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

  // A refresh after checkout must reverify server entitlement, never trust the return URL.
  useEffect(() => {
    const owner = sessionStorage.getItem("fixbridge.ai-upgrade-return");
    if (owner && owner === String(getStoredUser()?.id)) {
      setShowSubscriptionSuccess(true);
      setSubscriptionActivating(true);
    }
  }, []);

  // After Stripe Checkout return, poll until webhook activates plan_code.
  useEffect(() => {
    if (!showSubscriptionSuccess || !subscriptionActivating) return;
    const expected = subscriptionSuccessPlan || PAID_HOME_CARE_PLAN_CODE;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      const result = await validateToken({ syncCheckout: true });
      if (cancelled) return;
      if (result.ok) {
        setCurrentUser(result.user);
        if (
          result.source !== "cached" && hasProEntitlement(result.user.planCode, result.user.homeCareSubscription) &&
          (result.user.planCode === expected ||
            (isPaidHomeCarePlan(expected) && isPaidHomeCarePlan(result.user.planCode)) ||
            attempts >= 20)
        ) {
          setConfirmedSubscriptionUserId(String(result.user.id));
          setSubscriptionActivating(false);
          return;
        }
      }
      if (attempts >= 20) {
        setSubscriptionConfirmationDelayed(true);
        return;
      }
      window.setTimeout(() => void tick(), 1500);
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [showSubscriptionSuccess, subscriptionActivating, subscriptionSuccessPlan]);

  // A failed refresh is not a missing account; stale requests never switch accounts.
  useEffect(() => {
    let cancelled = false;
    const cached = getStoredUser();
    if (getStoredToken() && !cached) setAuthLoading(true);
    validateToken().then(result => {
      if (cancelled) return;
      if (result.ok) {
        setCurrentUser(result.user);
        setAuthRecoveryMessage(result.source === "cached" ? "Your saved sign-in is available, but the server could not refresh it. Your account has not been removed." : "");
        if (!cached) setPage(roleHomePage(result.user.role));
        if (result.user.role === "admin" || result.user.role === "contractor") void loadAllUsers();
        const stripe = new URLSearchParams(window.location.search).get("stripe");
        if (result.user.role === "contractor" && (stripe === "return" || stripe === "refresh")) setPage("contractor-dashboard");
      } else if (result.reason === "invalid") {
        setCurrentUser(null);
        setAuthRecoveryMessage("Your sign-in expired. Sign in again to access your saved profile and properties.");
        setPage(cached?.role === "admin" ? "admin-login" : cached?.role === "contractor" ? "contractor-login" : "homeowner-login");
      } else if (result.reason === "network") {
        setAuthRecoveryMessage("We could not verify your saved sign-in. Retry when the connection returns; you do not need to create another account.");
      }
      setAuthLoading(false);
    });
    return () => { cancelled = true; };
  }, [authRetry]);

  useEffect(() => { if (currentUser) lastSignedInRole.current = currentUser.role; }, [currentUser]);

  useEffect(() => {
    const syncSession = (event: StorageEvent) => {
      if (event.key !== "fixbridge-auth-token" && event.key !== "fixbridge-user-cache" && event.key !== null) return;
      const cached = getStoredUser();
      setCurrentUser(cached);
      if (!getStoredToken()) { setAuthRecoveryMessage(""); setPage(lastSignedInRole.current === "admin" ? "admin-login" : lastSignedInRole.current === "contractor" ? "contractor-login" : "homeowner-login"); }
      else if (cached) setPage(roleHomePage(cached.role));
      setAuthRetry(attempt => attempt + 1);
    };
    window.addEventListener("storage", syncSession);
    return () => window.removeEventListener("storage", syncSession);
  }, []);

  useEffect(() => {
    // Wait until the stored session is checked. Treating "still loading" as signed-out
    // replaces history and makes browser Back jump to the external referrer.
    if (authLoading) return;
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
  }, [authLoading, currentUser, page]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const state = (event.state || {}) as AppHistoryState;
      noteHistoryPop(state);
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

  if (marketingUnsub) {
    return (
      <div className={`${isDark ? "dark" : ""} size-full`} style={{ colorScheme: isDark ? "dark" : "light" }}>
        <div className="size-full overflow-y-auto bg-background text-foreground [font-family:'DM_Sans',sans-serif]">
          <MarketingUnsubscribePage
            token={marketingUnsub.token}
            channel={marketingUnsub.channel}
            onManagePreferences={
              currentUser?.role === "homeowner"
                ? () => {
                    window.history.pushState({}, "", "/");
                    setMarketingUnsub(null);
                    setPage("homeowner-dashboard");
                  }
                : undefined
            }
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

        {authRecoveryMessage && <div role="status" className="relative z-50 flex flex-wrap items-center justify-center gap-3 border-b border-border bg-muted p-3 text-sm"><span>{authRecoveryMessage}</span><button type="button" disabled={authLoading} onClick={() => setAuthRetry(attempt => attempt + 1)} className="rounded-lg border border-border bg-background px-3 py-1.5 font-semibold disabled:opacity-50">Retry sign-in check</button></div>}
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

          {SOLUTION_PAGES.some(p => p.page === page) && <SolutionPage page={page} />}

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
            checking={subscriptionCancelChecking}
            membershipActive={subscriptionCancelActive}
            onClose={() => setShowSubscriptionCancel(false)}
            onTryAgain={() => {
              setShowSubscriptionCancel(false);
              setPage("go-pro");
            }}
          />

          {page === "homeowner-login" && (
            <AppErrorBoundary
              section="homeowner-login"
              homeLabel="Back to home"
              onGoHome={() => navigate("home")}
            >
              <HomeownerLogin
                onLogin={(user) => {
                  setCurrentUser(user);
                  loadAllUsers(); // populate contractor cache after sign-in
                  navigate("homeowner-dashboard", { replace: true, user });
                }}
                onBack={() => navigate("home")}
                onGoContractor={() => navigate("contractor-login")}
              />
            </AppErrorBoundary>
          )}

          {page === "contractor-login" && (
            <AppErrorBoundary
              section="contractor-login"
              homeLabel="Back to contractors"
              onGoHome={() => navigate("contractors")}
            >
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
            </AppErrorBoundary>
          )}

          {page === "admin-login" && (
            <AppErrorBoundary
              section="admin-login"
              homeLabel="Back to home"
              onGoHome={() => navigate("home")}
            >
              <AdminLogin
                onLogin={(user) => {
                  setCurrentUser(user);
                  navigate("admin", { replace: true, user });
                }}
                onBack={() => navigate("home")}
              />
            </AppErrorBoundary>
          )}

          {page === "partner" && (
            <PartnerPortal onBack={() => navigate("home")} />
          )}

          {/* Auth loading: show spinner instead of white screen while startup JWT check runs */}
          {authLoading && DASHBOARD_PAGE_KEYS.includes(page) && (
            <div className="flex h-screen items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {page === "homeowner-dashboard" && currentUser && !authLoading && (
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
              key={`homeowner-session-${currentUser.id}`}
              onLogout={() => handleSignOut("home")}
              user={currentUser}
              isDark={isDark}
              onToggleDark={toggleDark}
              onUserUpdated={setCurrentUser}
              initialTab={
                postPaymentDashboard
                  ? "go-pro"
                  : (() => {
                      try {
                        const back = sessionStorage.getItem("fixbridge-upgrade-return");
                        return back === "diy" || back === "report" || back === "hire" ? "report" : undefined;
                      } catch {
                        return undefined;
                      }
                    })()
              }
              showSubscriptionSuccess={showSubscriptionSuccess}
              subscriptionSuccessPlanCode={subscriptionSuccessPlan}
              confirmedSubscriptionUserId={confirmedSubscriptionUserId}
              subscriptionActivating={subscriptionActivating}
              subscriptionConfirmationDelayed={subscriptionConfirmationDelayed}
              onDismissSubscriptionSuccess={() => {
                setShowSubscriptionSuccess(false);
                setSubscriptionSuccessPlan(null);
                setSubscriptionActivating(false);
                setPostPaymentDashboard(false);
              }}
              />
            </AppErrorBoundary>
          )}

          {page === "contractor-dashboard" && currentUser && currentUser.role === "contractor" && !authLoading && (
            <AppErrorBoundary section="contractor-dashboard">
              <ContractorDashboard
              key={`contractor-session-${currentUser.id}`}
              onLogout={() => handleSignOut("contractors")}
              user={currentUser}
              isDark={isDark}
              onToggleDark={toggleDark}
              onUserUpdated={(u) => setCurrentUser(u)}
              />
            </AppErrorBoundary>
          )}
          {page === "admin" && currentUser?.role === "admin" && !authLoading && (
            <AppErrorBoundary section="admin-dashboard">
              <AdminPanel
                key={`admin-session-${currentUser.id}`}
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
      <LeadConnectorChatWidget
        enabled={shouldShowLeadConnectorChat({ page, role: currentUser?.role })}
        liftForNav={page === "homeowner-dashboard" || page === "contractor-dashboard"}
      />
    </div>
  );
}
