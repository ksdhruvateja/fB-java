import { useCallback, useEffect, useRef, useState } from "react";
import { fetchUnreadNotificationCount } from "./notificationsApi";
import { fetchUnreadMessageCount } from "./messagingApi";

const POLL_MS = 15_000;

export function useInAppComms(enabled = true) {
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<number | null>(null);

  const lastRefreshAt = useRef(0);

  const refresh = useCallback(async (force = false) => {
    if (!enabled) return;
    const now = Date.now();
    if (!force && now - lastRefreshAt.current < 20_000) return;
    lastRefreshAt.current = now;
    try {
      const [n, m] = await Promise.all([fetchUnreadNotificationCount(), fetchUnreadMessageCount()]);
      setUnreadNotifications(n.count || 0);
      setUnreadMessages(m.count || 0);
    } catch {
      /* keep last counts */
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh(true);

    const schedule = () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      const hidden = document.visibilityState === "hidden";
      timerRef.current = window.setInterval(() => {
        if (document.visibilityState === "visible") void refresh(true);
      }, hidden ? POLL_MS * 3 : POLL_MS);
    };

    schedule();
    const onFocus = () => void refresh();
    const onVis = () => schedule();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, refresh]);

  return { unreadNotifications, unreadMessages, loading, refresh };
}
