import { useCallback, useEffect, useRef } from "react";
import {
  type NavFrame,
  type UserRole,
  canNavigateBack,
  loadNavFrame,
  framesEqual,
  hasInternalHistory,
  noteHistoryPop,
  pushAppHistory,
  replaceAppHistory,
  resolveParentFrame,
  roleHomeFrame,
  saveNavFrame,
  type AppHistoryState,
  sanitizeNavFrame,
} from "./navigation";

export function useDashboardNavigation<T extends NavFrame>(
  role: UserRole,
  appPage: "homeowner-dashboard" | "contractor-dashboard" | "admin",
  frame: T,
  applyFrame: (next: T) => void
) {
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const bootedRef = useRef(false);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    const saved = loadNavFrame(role);
    if (saved && saved.role === role) {
      applyFrame(saved as T);
      frameRef.current = saved as T;
    }
    replaceAppHistory(appPage, frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appPage, role]);

  useEffect(() => {
    saveNavFrame(role, frame);
  }, [role, frame]);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const state = (event.state || {}) as AppHistoryState;
      noteHistoryPop(state);
      if (state.fixbridgeNav && state.fixbridgeNav.role === role) {
        const next = sanitizeNavFrame(state.fixbridgeNav) as T;
        frameRef.current = next;
        applyFrame(next);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [role, applyFrame]);

  const navigateTo = useCallback(
    (next: T) => {
      const clean = sanitizeNavFrame(next) as T;
      if (framesEqual(frameRef.current, clean)) return;
      applyFrame(clean);
      frameRef.current = clean;
      saveNavFrame(role, clean);
      pushAppHistory(appPage, clean);
    },
    [applyFrame, appPage, role]
  );

  const goHome = useCallback(() => {
    navigateTo(roleHomeFrame(role) as T);
  }, [navigateTo, role]);

  const goBack = useCallback(() => {
    if (hasInternalHistory()) {
      window.history.back();
      return;
    }
    const parent = resolveParentFrame(frameRef.current);
    const fallback = (parent || roleHomeFrame(role)) as T;
    if (framesEqual(frameRef.current, fallback)) return;
    applyFrame(fallback);
    frameRef.current = fallback;
    saveNavFrame(role, fallback);
    replaceAppHistory(appPage, fallback);
  }, [applyFrame, appPage, role]);

  const canBack = canNavigateBack(frame);

  return { goHome, goBack, canBack, navigateTo };
}
