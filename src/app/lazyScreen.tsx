import { Suspense, lazy, type ComponentType } from "react";

/** Full-screen placeholder while a lazily loaded area downloads. */
function ScreenLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/**
 * React.lazy plus its own Suspense boundary, so call sites use the component exactly as before.
 * Chunk-load failures are handled by chunkRecovery.ts (reloads once after a new deploy).
 */
export function lazyScreen<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  // Typed as the original component so call sites keep full prop checking.
  const Lazy = lazy(load) as unknown as ComponentType<P>;
  return function LazyScreen(props: P) {
    return (
      <Suspense fallback={<ScreenLoading />}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
