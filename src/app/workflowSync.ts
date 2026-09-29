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
const inflightGetRequests = new Map<string, Promise<Response>>();
const inflightMutationRequests = new Map<string, Promise<Response>>();

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

function emitMutation(method: string, url: string, status: number, payload: unknown) {
  if (typeof window === "undefined") return;
  try {
    const absolute = new URL(url, window.location.origin);
    if (absolute.origin !== window.location.origin || !absolute.pathname.startsWith("/api/")) return;
    if (/^\/api\/(auth|public|health)(?:\/|$)/i.test(absolute.pathname)) return;

    publish({
      method,
      path: `${absolute.pathname}${absolute.search}`,
      status,
      jobId: getJobId(absolute.pathname, payload),
      at: Date.now(),
      source: "api-mutation",
    });
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

    const url = request instanceof Request ? request.url : String(request);
    const body = init?.body == null ? "" : String(init.body);
    const requestKey = `${method} ${url} ${body}`;
    const isGetLike = method === "GET" || method === "HEAD" || method === "OPTIONS";
    const inflightMap = isGetLike ? inflightGetRequests : inflightMutationRequests;

    // Do not let React StrictMode, double-clicks, or two lifecycle effects send
    // the same request concurrently. The first network request owns the server
    // mutation; duplicates receive a clone of its response. This is especially
    // important for assignment/payment/complete actions and also reduces 429s.
    const existing = inflightMap.get(requestKey);
    if (existing) {
      const shared = await existing;
      return shared.clone();
    }

    const requestPromise = originalFetch!(...args);
    // Keep a pristine clone as the shared response for duplicate callers.
    // The first caller receives the original response and may consume its body;
    // duplicate callers always clone the pristine copy instead.
    const sharedResponsePromise = requestPromise.then((response) => response.clone());
    inflightMap.set(requestKey, sharedResponsePromise);

    try {
      const response = await requestPromise;
      logApiStatus(method, response.url, response.status);

      if (response.ok && !isGetLike) {
        // Clone before the caller consumes the original response body.
        void response.clone().json().then((payload) => {
          emitMutation(method, response.url, response.status, payload);
        }).catch(() => {
          emitMutation(method, response.url, response.status, null);
        });
      }

      // A duplicate caller must get an independent readable response body.
      if (!isGetLike) {
        // Keep the completed response briefly so an immediate double-click
        // cannot issue a second POST/PUT/PATCH/DELETE. The first caller already
        // receives `response`; duplicate callers use the original in-flight
        // promise above while it is active.
      }
      return response;
    } finally {
      // GETs are only deduplicated while the request is in flight. Mutations are
      // cleared shortly after completion so an intentional later action works.
      if (isGetLike) {
        inflightGetRequests.delete(requestKey);
      } else {
        window.setTimeout(() => inflightMutationRequests.delete(requestKey), 1200);
      }
    }
  };
}
