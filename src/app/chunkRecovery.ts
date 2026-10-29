const CHUNK_RELOAD_KEY = "fixbridge-chunk-reload";

function isChunkLoadError(reason: unknown): boolean {
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : String((reason as { message?: string })?.message || reason || "");
  return (
    /ChunkLoadError/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Loading chunk [\d]+ failed/i.test(message) ||
    /Importing a module script failed/i.test(message)
  );
}

/** One controlled reload after deploy when a stale JS chunk fails to load. */
export function installChunkLoadRecovery() {
  if (typeof window === "undefined") return;

  const reloadOnce = (reason: unknown) => {
    if (!isChunkLoadError(reason)) return;
    try {
      if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1") return;
      sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  window.addEventListener("unhandledrejection", (event) => {
    reloadOnce(event.reason);
  });

  window.addEventListener("error", (event) => {
    reloadOnce(event.error || event.message);
  });
}

export function clearChunkReloadFlag() {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    /* ignore */
  }
}
