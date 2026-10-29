/**
 * Global FixBridge workflow synchronization.
 *
 * - Every successful same-origin workflow mutation emits one local event.
 * - BroadcastChannel/localStorage propagates the event to other tabs.
 * - Other devices are covered by lightweight role-specific job polling in the
 *   Admin/Homeowner/Contractor dashboards. We deliberately do NOT poll every
 *   API endpoint continuously.
 * - 401/403/429 responses are logged centrally so auth/permission/throttle
 *   problems are visible in the browser console without forcing a logout.
 */
let installed = false;
let originalFetch: typeof window.fetch | null = null;
let channel: BroadcastChannel | null = null;

const CHANNEL_NAME = "fixbridge-workflow-sync-v1";
const STORAGE_KEY = "fixbridge-workflow-sync-event";

function getJobId(path: string, payload: unknown): number | null {
  const match = path.match(/\/api\/(?:admin\/|contractor\/|homeowner\/|)?managed\/jobs\/(\d+)/i);
  if (match) return Number(match[1]);

  if (payload && typeof payload === "object") {
    const row = payload as Record<string, unknown>;
    const candidates = [
      row.jobId,
      row.job_id,
      row.invoiceJobId,
      (row.job as Record<string, unknown> | undefined)?.id,
      (row.invoice as Record<string, unknown> | undefined)?.jobId,
      (row.invoice as Record<string, unknown> | undefined)?.job_id,
    ];
    for (const value of candidates) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function publish(detail: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("fixbridge:workflow-mutated", { detail }));

  try {
    channel?.postMessage(detail);
  } catch {
    // BroadcastChannel can be unavailable in some browser privacy modes.
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...detail,
      nonce: `${Date.now()}-${Math.random()}`,
    }));
  } catch {
    // localStorage is only a fallback; the in-window event already fired.
  }
}

function isWorkflowMutationPath(pathname: string) {
  return (
    /^\/api\/(?:admin\/)?managed\//i.test(pathname) ||
    /^\/api\/admin\/(?:quotes|invoices)\//i.test(pathname) ||
    /^\/api\/homeowner\/invoices\//i.test(pathname) ||
    /^\/api\/contractor\/(?:managed|bids|invitations)\//i.test(pathname)
  );
}

let lastMutationKey = '';
let lastMutationAt = 0;

function emitMutation(method: string, url: string, status: number, payload: unknown = null) {
  if (typeof window === "undefined") return;
  try {
    const absolute = new URL(url, window.location.origin);
    if (absolute.origin !== window.location.origin || !absolute.pathname.startsWith("/api/")) return;
    if (/^\/api\/(auth|public|health)(?:\/|$)/i.test(absolute.pathname)) return;
    if (!isWorkflowMutationPath(absolute.pathname)) return;

    const pathJobId = getJobId(absolute.pathname, null);
    const detail = {
      method,
      path: `${absolute.pathname}${absolute.search}`,
      status,
      jobId: pathJobId ?? getJobId(absolute.pathname, payload),
      at: Date.now(),
      source: "api-mutation",
    };

    // One mutation -> one browser event. The managedJobs API wrapper used to
    // emit the same event as this global fetch monitor, causing two refreshes
    // for one click. Deduplicate the tiny overlap window here.
    const key = `${method}:${absolute.pathname}:${status}:${detail.jobId ?? "none"}`;
    const now = Date.now();
    if (key === lastMutationKey && now - lastMutationAt < 750) return;
    lastMutationKey = key;
    lastMutationAt = now;

    publish(detail);
  } catch {
    // Synchronization is non-critical to the API response.
  }
}

function logApiStatus(method: string, url: string, status: number) {
  if (![401, 403, 429].includes(status)) return;
  const label = status === 401 ? "AUTHENTICATION" : status === 403 ? "AUTHORIZATION" : "RATE_LIMIT";
  console.warn(`[FixBridge API ${status} ${label}]`, {
    method,
    url,
    status,
    at: new Date().toISOString(),
  });

  try {
    window.dispatchEvent(new CustomEvent("fixbridge:api-status", {
      detail: { method, url, status, at: Date.now() },
    }));
  } catch {
    // ignore
  }
}

export function installWorkflowMutationSync() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  originalFetch = window.fetch.bind(window);

  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener("message", (event) => {
      const detail = event.data;
      if (!detail || typeof detail !== "object") return;
      window.dispatchEvent(new CustomEvent("fixbridge:workflow-mutated", { detail }));
    });
  } catch {
    channel = null;
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const detail = JSON.parse(event.newValue);
      if (detail && typeof detail === "object") {
        window.dispatchEvent(new CustomEvent("fixbridge:workflow-mutated", { detail }));
      }
    } catch {
      // ignore malformed fallback events
    }
  });

  window.fetch = async (...args) => {
    const request = args[0];
    const init = args[1];
    const method = String(
      (init && init.method) ||
      (request instanceof Request ? request.method : "GET"),
    ).toUpperCase();

    const response = await originalFetch!(...args);
    logApiStatus(method, response.url, response.status);

    if (response.ok && method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      // Publish immediately when the mutation URL identifies the exact job.
      // For endpoints such as bid/invitation responses that do not contain a
      // job id, wait for the response JSON so we still publish one job-scoped
      // event rather than an unscoped refresh followed by a second refresh.
      if (getJobId(response.url, null) != null) {
        emitMutation(method, response.url, response.status);
      } else {
        void response.clone().json().then((payload) => {
          emitMutation(method, response.url, response.status, payload);
        }).catch(() => undefined);
      }
    }
    return response;
  };
}
