import { brand } from "../config/brand";
import { PUBLIC_CONTENT_PAGES, publicMetaForPath } from "../shared/publicSiteMeta.js";

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
  | "admin"
  | "blog"
  | "press"
  | "careers"
  | "contact"
  | "how-it-works"
  | "fixera-assessment"
  | "find-a-contractor";

const PAGE_TITLES: Record<SiteMetaPage, string> = {
  home: "AI-Powered Home Repair & Property Care",
  contractors: "For Contractors",
  about: "About FixBridge and Fixera",
  "go-pro": "HomeCare Pro",
  "homeowner-login": "Homeowner Sign In",
  "contractor-login": "Contractor Sign In",
  "admin-login": "Admin Sign In",
  partner: "Partner Portal",
  "homeowner-dashboard": "Homeowner Dashboard",
  "contractor-dashboard": "Contractor Dashboard",
  admin: "Admin",
  blog: PUBLIC_CONTENT_PAGES.blog.title,
  press: PUBLIC_CONTENT_PAGES.press.title,
  careers: PUBLIC_CONTENT_PAGES.careers.title,
  contact: PUBLIC_CONTENT_PAGES.contact.title,
  "how-it-works": PUBLIC_CONTENT_PAGES["how-it-works"].title,
  "fixera-assessment": PUBLIC_CONTENT_PAGES["fixera-assessment"].title,
  "find-a-contractor": PUBLIC_CONTENT_PAGES["find-a-contractor"].title,
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

  // Content pages (and blog articles) carry their own title and description.
  const pathMeta = page in PUBLIC_CONTENT_PAGES && typeof window !== "undefined" ? publicMetaForPath(window.location.pathname) : null;
  const pageTitle = pathMeta?.title ?? PAGE_TITLES[page] ?? brand.productName;
  const title = page === "home" ? `${brand.productName} — ${pageTitle}` : `${pageTitle} · ${brand.productName}`;
  const description = pathMeta?.description ?? DEFAULT_DESCRIPTION;
  const image = absoluteAssetUrl("/og-image.png");
  const url = typeof window !== "undefined" ? window.location.href : brand.siteUrl || "/";

  document.title = title;
  setMetaTag("name", "description", description);
  setMetaTag("property", "og:title", title);
  setMetaTag("property", "og:description", description);
  setMetaTag("property", "og:image", image);
  setMetaTag("property", "og:image:secure_url", image);
  setMetaTag("property", "og:image:type", "image/png");
  setMetaTag("property", "og:image:width", "1200");
  setMetaTag("property", "og:image:height", "630");
  setMetaTag("property", "og:image:alt", "FixBridge logo");
  setMetaTag("property", "og:url", url);
  setMetaTag("name", "twitter:card", "summary_large_image");
  setMetaTag("name", "twitter:title", title);
  setMetaTag("name", "twitter:description", description);
  setMetaTag("name", "twitter:image", image);
  setMetaTag("name", "twitter:image:alt", "FixBridge logo");
  const canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (canonical && typeof window !== "undefined") {
    const path = pathMeta?.path ?? "/";
    canonical.href = new URL(path, brand.siteUrl || window.location.origin).href;
  }
}

/** Refresh title/meta for the current URL path (blog articles change it without a page change). */
export function applyPublicPathMeta(pathname: string) {
  const meta = publicMetaForPath(pathname);
  if (!meta) return;
  const page = (Object.keys(PUBLIC_CONTENT_PAGES) as SiteMetaPage[]).find((key) =>
    meta.path === PUBLIC_CONTENT_PAGES[key as keyof typeof PUBLIC_CONTENT_PAGES].path || (key === "blog" && meta.path.startsWith("/blog/"))
  );
  if (page) applySiteMeta(page);
}
