declare const __FIXBRIDGE_BUILD__: string | undefined;

export type ClientErrorPayload = {
  section: string;
  message: string;
  stack?: string;
  componentStack?: string | null;
  route?: string;
  tab?: string;
};

export function logClientError(payload: ClientErrorPayload) {
  const entry = {
    ...payload,
    build: typeof __FIXBRIDGE_BUILD__ !== "undefined" ? __FIXBRIDGE_BUILD__ : "dev",
    path: typeof window !== "undefined" ? window.location.pathname + window.location.search : "",
    ts: new Date().toISOString(),
  };
  console.error("[FixBridge]", entry);
}
