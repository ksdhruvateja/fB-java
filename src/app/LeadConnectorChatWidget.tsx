import { useEffect } from "react";

/**
 * Temporary HighLevel / LeadConnector chat widget integration.
 * Loads the vendor script as provided. No custom chatbot, CRM API, or user-data push.
 */

const WIDGET_ID = "6a9a2d893e2c598c61263c0c";
const LOADER_SRC = "https://widgets.leadconnectorhq.com/loader.js";
const SCRIPT_SELECTOR = `script[src*="widgets.leadconnectorhq.com/loader.js"], script[data-widget-id="${WIDGET_ID}"]`;

const UI_SELECTOR = [
  `iframe[src*="leadconnectorhq.com"]`,
  `iframe[src*="leadconnector"]`,
  `[id*="chat-widget"]`,
  `[id*="lc_text"]`,
  `[class*="lc_text-widget"]`,
  `[class*="lc-chat"]`,
].join(", ");

export function shouldShowLeadConnectorChat(input: {
  page: string;
  role?: string | null;
}): boolean {
  if (input.role === "admin") return false;
  if (input.page === "admin" || input.page === "admin-login") return false;
  if (isBlockedBrowserLocation()) return false;
  if (input.page === "home" || input.page === "about") return true;
  if (input.page === "homeowner-dashboard" && input.role === "homeowner") return true;
  if (input.page === "contractor-dashboard" && input.role === "contractor") return true;
  return false;
}

function isBlockedBrowserLocation() {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname.toLowerCase();
  if (
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path.includes("/reset-password") ||
    path.includes("/auth") ||
    path.includes("/callback") ||
    path.includes("/oauth") ||
    path.includes("/checkout") ||
    path.includes("/error")
  ) {
    return true;
  }
  const params = new URLSearchParams(window.location.search);
  if (
    params.has("paid") ||
    params.has("canceled") ||
    params.get("stripe") ||
    params.get("error") ||
    params.get("session_id") ||
    params.get("payment_intent")
  ) {
    return true;
  }
  if (params.get("code") && params.get("state")) return true;
  return false;
}

function existingScript() {
  return document.querySelector(SCRIPT_SELECTOR);
}

function widgetUiNodes() {
  return Array.from(document.querySelectorAll(UI_SELECTOR)).filter(
    (el) => el.tagName !== "SCRIPT"
  ) as HTMLElement[];
}

function setWidgetVisible(visible: boolean) {
  document.documentElement.dataset.fbChat = visible ? document.documentElement.dataset.fbChat || "on" : "off";
  for (const node of widgetUiNodes()) {
    if (visible) {
      if (node.dataset.fbWidgetHidden === "1") {
        node.style.removeProperty("display");
        delete node.dataset.fbWidgetHidden;
      }
    } else {
      node.dataset.fbWidgetHidden = "1";
      node.style.setProperty("display", "none", "important");
    }
  }
}

function injectWidget() {
  if (existingScript()) return;
  const script = document.createElement("script");
  script.src = LOADER_SRC;
  script.async = true;
  script.setAttribute("data-resources-url", "https://widgets.leadconnectorhq.com/chat-widget/loader.js");
  script.setAttribute("data-widget-id", WIDGET_ID);
  script.setAttribute("data-source", "WEB_USER");
  script.addEventListener("error", () => {
    if (import.meta.env.DEV) {
      console.warn("LeadConnector chat widget failed to load. FixBridge will continue without it.");
    }
  });
  document.body.appendChild(script);
}

export default function LeadConnectorChatWidget({
  enabled,
  liftForNav,
}: {
  enabled: boolean;
  liftForNav?: boolean;
}) {
  useEffect(() => {
    document.documentElement.dataset.fbChat = enabled ? (liftForNav ? "portal" : "on") : "off";
    if (!enabled) {
      setWidgetVisible(false);
      return;
    }

    let cancelled = false;
    const start = window.setTimeout(() => {
      if (cancelled) return;
      injectWidget();
      setWidgetVisible(true);
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(start);
    };
  }, [enabled, liftForNav]);

  useEffect(() => {
    if (enabled) return;
    const hideLateNodes = () => setWidgetVisible(false);
    const observer = new MutationObserver(hideLateNodes);
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, [enabled]);

  return null;
}
