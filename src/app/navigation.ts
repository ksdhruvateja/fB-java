/** Role-aware navigation helpers for FixBridge (state-based routing, not react-router). */

import { sanitizeAdminTab } from "./adminNav";
import { sanitizeContractorTab } from "./contractorNav";
import { sanitizeDashTab, sanitizeJobsSegment } from "./homeownerNav";

export type AppPage =
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

export type UserRole = "homeowner" | "contractor" | "admin";

export const LOGIN_PAGES: AppPage[] = ["homeowner-login", "contractor-login", "admin-login"];

export const DASHBOARD_PAGES: AppPage[] = ["homeowner-dashboard", "contractor-dashboard", "admin"];

export function roleHomePage(role: string | undefined | null): AppPage {
  if (role === "contractor") return "contractor-dashboard";
  if (role === "admin") return "admin";
  return "homeowner-dashboard";
}

export type HomeownerNavFrame = {
  role: "homeowner";
  tab: string;
  jobId?: number | null;
  jobsSegment?: string;
  reportStep?: string;
  intakePhase?: string;
  reportPath?: "ai" | "experts" | null;
};

export type ContractorNavFrame = {
  role: "contractor";
  tab: string;
};

export type AdminNavFrame = {
  role: "admin";
  tab: string;
  selectedJobId?: number | null;
  selectedHomeownerProfileId?: number | null;
  homeownerRecordFocus?: unknown;
  expandedContractorId?: number | null;
  drawerOpen?: boolean;
  selectedSupportTicket?: string | null;
  mobileNav?: boolean;
  cmdOpen?: boolean;
  notifOpen?: boolean;
};

export type NavFrame = HomeownerNavFrame | ContractorNavFrame | AdminNavFrame;

export function roleHomeTab(role: UserRole): string {
  if (role === "contractor") return "dashboard";
  return "overview";
}

export function roleHomeFrame(role: UserRole): NavFrame {
  if (role === "homeowner") return { role: "homeowner", tab: "overview", jobId: null };
  if (role === "contractor") return { role: "contractor", tab: "dashboard" };
  return {
    role: "admin",
    tab: "overview",
    selectedJobId: null,
    drawerOpen: false,
    selectedHomeownerProfileId: null,
    homeownerRecordFocus: null,
    expandedContractorId: null,
    selectedSupportTicket: null,
    mobileNav: false,
    cmdOpen: false,
    notifOpen: false,
  };
}

function cloneFrame<T extends NavFrame>(frame: T): T {
  return JSON.parse(JSON.stringify(frame)) as T;
}

export function resolveParentFrame(frame: NavFrame): NavFrame | null {
  if (frame.role === "homeowner") {
    if (frame.jobId != null) {
      return { ...cloneFrame(frame), jobId: null };
    }
    if (frame.tab === "jobs") {
      return { role: "homeowner", tab: "overview" };
    }
    if (frame.tab === "report") {
      if (frame.reportStep === "assessment") {
        if (frame.reportPath === "experts") {
          return {
            role: "homeowner",
            tab: "report",
            reportStep: "experts",
            reportPath: "experts",
          };
        }
        return {
          role: "homeowner",
          tab: "report",
          reportStep: "intake",
          intakePhase: "details",
          reportPath: frame.reportPath ?? null,
        };
      }
      if (frame.reportStep === "experts") {
        return {
          role: "homeowner",
          tab: "report",
          reportStep: "intake",
          intakePhase: "details",
        };
      }
      if (frame.reportStep === "intake" && frame.intakePhase === "details") {
        return {
          role: "homeowner",
          tab: "report",
          reportStep: "intake",
          intakePhase: "describe",
        };
      }
      if (frame.reportStep === "intake" && frame.intakePhase === "describe") {
        return {
          role: "homeowner",
          tab: "report",
          reportStep: "intake",
          intakePhase: "location",
        };
      }
      if (frame.reportStep === "intake" && frame.intakePhase === "location") {
        return {
          role: "homeowner",
          tab: "report",
          reportStep: "intake",
          intakePhase: "trade",
        };
      }
      if (frame.reportStep === "intake" && frame.intakePhase === "trade") {
        return { role: "homeowner", tab: "overview" };
      }
      if (frame.reportStep === "intake") {
        return { role: "homeowner", tab: "overview" };
      }
      return { role: "homeowner", tab: "overview" };
    }
    if (frame.tab !== "overview") {
      return { role: "homeowner", tab: "overview" };
    }
    return null;
  }

  if (frame.role === "contractor") {
    if (frame.tab !== "dashboard") {
      return { role: "contractor", tab: "dashboard" };
    }
    return null;
  }

  const f = frame as AdminNavFrame;
  if (f.mobileNav) return { ...cloneFrame(f), mobileNav: false };
  if (f.cmdOpen) return { ...cloneFrame(f), cmdOpen: false };
  if (f.notifOpen) return { ...cloneFrame(f), notifOpen: false };
  if (f.drawerOpen) return { ...cloneFrame(f), drawerOpen: false };
  if (f.homeownerRecordFocus) {
    return { ...cloneFrame(f), homeownerRecordFocus: null };
  }
  if (f.selectedHomeownerProfileId != null) {
    return { ...cloneFrame(f), selectedHomeownerProfileId: null, homeownerRecordFocus: null };
  }
  if (f.expandedContractorId != null) {
    return { ...cloneFrame(f), expandedContractorId: null };
  }
  if (f.selectedSupportTicket) {
    return { ...cloneFrame(f), selectedSupportTicket: null };
  }
  if (
    f.selectedJobId != null &&
    (f.tab === "dispatch" || f.tab === "work-queue" || f.tab === "pricing")
  ) {
    return { ...cloneFrame(f), selectedJobId: null };
  }
  if (f.tab !== "overview") {
    return { ...cloneFrame(f), tab: "overview" };
  }
  return null;
}

export function canNavigateBack(frame: NavFrame): boolean {
  return resolveParentFrame(frame) !== null;
}

const STORAGE_PREFIX = "fixbridge-nav-frame-";
const NAV_FRAME_VERSION = 2;

function sanitizeHomeownerFrame(frame: HomeownerNavFrame): HomeownerNavFrame {
  return {
    role: "homeowner",
    tab: sanitizeDashTab(frame.tab),
    jobId: typeof frame.jobId === "number" && Number.isFinite(frame.jobId) ? frame.jobId : null,
    jobsSegment: frame.jobsSegment ? sanitizeJobsSegment(frame.jobsSegment) : undefined,
    reportStep: frame.reportStep,
    intakePhase: frame.intakePhase,
    reportPath: frame.reportPath ?? null,
  };
}

function sanitizeContractorFrame(frame: ContractorNavFrame): ContractorNavFrame {
  return {
    role: "contractor",
    tab: sanitizeContractorTab(frame.tab),
  };
}

function sanitizeAdminFrame(frame: AdminNavFrame): AdminNavFrame {
  return {
    ...frame,
    role: "admin",
    tab: sanitizeAdminTab(frame.tab),
    selectedJobId:
      typeof frame.selectedJobId === "number" && Number.isFinite(frame.selectedJobId)
        ? frame.selectedJobId
        : null,
    selectedHomeownerProfileId:
      typeof frame.selectedHomeownerProfileId === "number" &&
      Number.isFinite(frame.selectedHomeownerProfileId)
        ? frame.selectedHomeownerProfileId
        : null,
    expandedContractorId:
      typeof frame.expandedContractorId === "number" && Number.isFinite(frame.expandedContractorId)
        ? frame.expandedContractorId
        : null,
    selectedSupportTicket:
      typeof frame.selectedSupportTicket === "string" ? frame.selectedSupportTicket : null,
  };
}

export function sanitizeNavFrame(frame: NavFrame): NavFrame {
  if (frame.role === "homeowner") return sanitizeHomeownerFrame(frame);
  if (frame.role === "contractor") return sanitizeContractorFrame(frame);
  return sanitizeAdminFrame(frame as AdminNavFrame);
}

export function saveNavFrame(role: UserRole, frame: NavFrame) {
  try {
    sessionStorage.setItem(
      `${STORAGE_PREFIX}${role}`,
      JSON.stringify({ v: NAV_FRAME_VERSION, frame: sanitizeNavFrame(frame) })
    );
  } catch {
    /* ignore */
  }
}

export function loadNavFrame(role: UserRole): NavFrame | null {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${role}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; frame?: NavFrame } | NavFrame;
    const frame = "frame" in (parsed as object) && (parsed as { frame?: NavFrame }).frame
      ? (parsed as { frame: NavFrame }).frame
      : (parsed as NavFrame);
    if (!frame || frame.role !== role) return null;
    return sanitizeNavFrame(frame);
  } catch {
    return null;
  }
}

export function clearNavFrames() {
  for (const role of ["homeowner", "contractor", "admin"] as UserRole[]) {
    try {
      sessionStorage.removeItem(`${STORAGE_PREFIX}${role}`);
    } catch {
      /* ignore */
    }
  }
}

export type AppHistoryState = {
  fixbridgePage?: AppPage;
  fixbridgeNav?: NavFrame;
  fixbridgeAuth?: boolean;
};

export function pushAppHistory(page: AppPage, nav?: NavFrame) {
  const state: AppHistoryState = { fixbridgePage: page, fixbridgeAuth: true, fixbridgeNav: nav };
  window.history.pushState(state, "", window.location.pathname + window.location.search);
}

export function replaceAppHistory(page: AppPage, nav?: NavFrame) {
  const state: AppHistoryState = { fixbridgePage: page, fixbridgeAuth: true, fixbridgeNav: nav };
  window.history.replaceState(state, "", window.location.pathname + window.location.search);
}
