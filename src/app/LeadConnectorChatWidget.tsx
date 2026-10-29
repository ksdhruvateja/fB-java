import { useEffect } from "react";

/**
 * Temporary HighLevel / LeadConnector chat widget integration.
 * Loads the vendor script as provided. No custom chatbot, CRM API, or user-data push.
 *
 * The widget stays out of the way: its script loads only when someone asks for help
 * (openHelpChat), and the vendor element is hidden by CSS whenever the chat panel is not
 * open, so its greeting bubble and floating launcher never cover forms or navigation.
 * Conversation history is kept by the vendor, so reopening continues the same chat.
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

const PUBLIC_CHAT_PAGES = [
  "home",
  "about",
  "contractors",
  "go-pro",
  "blog",
  "press",
  "careers",
  "contact",
  "how-it-works",
  "fixera-assessment",
  "find-a-contractor",
];

export function shouldShowLeadConnectorChat(input: {
  page: string;
  role?: string | null;
}): boolean {
  if (input.role === "admin") return false;
  if (input.page === "admin" || input.page === "admin-login") return false;
  if (isBlockedBrowserLocation()) return false;
  // Public marketing and content pages, where the nav offers "Help".
  if (PUBLIC_CHAT_PAGES.includes(input.page)) return true;
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

type VendorChatApi = { isLoaded?: () => boolean; openWidget?: () => void; closeWidget?: () => void };

function vendorChat(): VendorChatApi | null {
  const api = (window as unknown as { leadConnector?: { chatWidget?: VendorChatApi } }).leadConnector?.chatWidget;
  return api || null;
}

/**
 * Opens the support chat, loading the vendor widget first if needed.
 * Resolves false when the chat could not be loaded (blocked network, ad blocker, timeout).
 */
export async function openHelpChat(timeoutMs = 12000): Promise<boolean> {
  if (typeof window === "undefined") return false;
  injectWidget();
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const api = vendorChat();
    const ready = api?.openWidget && (typeof api.isLoaded !== "function" || api.isLoaded());
    if (ready && document.querySelector("chat-widget")) {
      api!.openWidget!();
      return true;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }
  return false;
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
      vendorChat()?.closeWidget?.();
      setWidgetVisible(false);
      return;
    }

    // The script is not loaded here; it loads on the first openHelpChat() call.
    setWidgetVisible(true);
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
