import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";

/** Tiny path router for the /commercial site (kept separate from the main app's page state). */
export function navigate(to: string, { replace = false } = {}) {
  if (replace) window.history.replaceState({}, "", to);
  else window.history.pushState({}, "", to);
  window.dispatchEvent(new Event("commercial-navigate"));
  window.scrollTo({ top: 0 });
}

export function usePath() {
  const [path, setPath] = useState(() => window.location.pathname.replace(/\/+$/, "") || "/");
  useEffect(() => {
    const sync = () => setPath(window.location.pathname.replace(/\/+$/, "") || "/");
    window.addEventListener("popstate", sync);
    window.addEventListener("commercial-navigate", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("commercial-navigate", sync);
    };
  }, []);
  return path;
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      href={to}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    />
  );
}
