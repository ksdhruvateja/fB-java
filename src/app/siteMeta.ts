import { brand } from "../config/brand";

export type SiteMetaPage =
  | "home"
  | "contractors"
  | "about"
  | "go-pro"
  | "homeowner-login"
  | "contractor-login"
  | "admin-login"
  | "partner"
  | "homeowner-dashboard"
  | "contractor-dashboard"
  | "admin";

const PAGE_TITLES: Record<SiteMetaPage, string> = {
  home: "AI-Powered Home Repair & Property Care",
  contractors: "For Contractors",
  about: "About",
  "go-pro": "HomeCare Pro",
  "homeowner-login": "Homeowner Sign In",
  "contractor-login": "Contractor Sign In",
  "admin-login": "Admin Sign In",
  partner: "Partner Portal",
  "homeowner-dashboard": "Homeowner Dashboard",
  "contractor-dashboard": "Contractor Dashboard",
  admin: "Admin",
};

const DEFAULT_DESCRIPTION = brand.tagline;

function absoluteAssetUrl(pathname: string) {
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(pathname, window.location.origin).href;
  }
  const base = brand.siteUrl.replace(/\/$/, "");
  return base ? `${base}${pathname}` : pathname;
}

function setMetaTag(attr: "name" | "property", key: string, content: string) {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

/** Keep browser tab title and social preview meta in sync with the active page. */
export function applySiteMeta(page: SiteMetaPage) {
  if (typeof document === "undefined") return;

  const pageTitle = PAGE_TITLES[page] ?? brand.productName;
  const title = page === "home" ? `${brand.productName} — ${pageTitle}` : `${pageTitle} · ${brand.productName}`;
  const description = DEFAULT_DESCRIPTION;
  const image = absoluteAssetUrl("/og-image.png");
  const url = typeof window !== "undefined" ? window.location.href : brand.siteUrl || "/";

  document.title = title;
  setMetaTag("name", "description", description);
  setMetaTag("property", "og:title", title);
  setMetaTag("property", "og:description", description);
  setMetaTag("property", "og:image", image);
  setMetaTag("property", "og:url", url);
  setMetaTag("name", "twitter:title", title);
  setMetaTag("name", "twitter:description", description);
  setMetaTag("name", "twitter:image", image);
}
