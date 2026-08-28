import { useCallback, useEffect, useRef } from "react";
import {
  type NavFrame,
  type UserRole,
  canNavigateBack,
  loadNavFrame,
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
      if (state.fixbridgeNav && state.fixbridgeNav.role === role) {
        applyFrame(sanitizeNavFrame(state.fixbridgeNav) as T);
        return;
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [role, applyFrame]);

  const navigateTo = useCallback(
    (next: T) => {
      applyFrame(next);
      frameRef.current = next;
      saveNavFrame(role, next);
      pushAppHistory(appPage, next);
    },
    [applyFrame, appPage, role]
  );

  const goHome = useCallback(() => {
    navigateTo(roleHomeFrame(role) as T);
  }, [navigateTo, role]);

  const goBack = useCallback(() => {
    const parent = resolveParentFrame(frameRef.current);
    if (!parent) return;
    navigateTo(parent as T);
  }, [navigateTo]);

  const canBack = canNavigateBack(frame);

  return { goHome, goBack, canBack, navigateTo };
}
