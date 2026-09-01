import type { ReactNode } from "react";

/** Sticks to the bottom of the scroll area on mobile; normal flow on desktop. */
export function AuthMobileActions({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky bottom-0 z-30 -mx-5 mt-6 border-t border-neutral-100/90 bg-white/95 px-5 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur-md sm:-mx-8 sm:px-8 lg:static lg:z-auto lg:mx-0 lg:mt-4 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none lg:backdrop-blur-none"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      {children}
    </div>
  );
}
