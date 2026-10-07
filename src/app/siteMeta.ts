import { pageMeta, structuredData, SITE_ORIGIN } from "../../shared/public-seo.js";
import type { AppPage } from "./navigation";
export type SiteMetaPage = AppPage;
function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector('meta[' + attr + '="' + key + '"]') as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}
export function applySiteMeta(page: SiteMetaPage, path = '', search = '') {
  if (typeof document === 'undefined') return;
  const meta = pageMeta(page);
  const special = path.startsWith('/legal') || path === '/reset-password' || path === '/marketing/unsubscribe' || new URLSearchParams(search).has('action') || new URLSearchParams(search).has('paid') || new URLSearchParams(search).has('portal');
  const privatePage = Boolean(meta.private || special);
  const title = special ? 'Account & Legal Information | FixBridge' : meta.title;
  const description = special ? 'FixBridge account and legal information.' : meta.description;
  const canonical = SITE_ORIGIN + meta.path;
  document.title = title;
  setMeta('name', 'description', description);
  setMeta('name', 'robots', privatePage ? 'noindex, follow' : 'index, follow');
  let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (privatePage) {
    link?.remove();
  } else {
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = canonical;
  }
  for (const key of ['og:title', 'twitter:title']) setMeta(key.startsWith('og:') ? 'property' : 'name', key, title);
  for (const key of ['og:description', 'twitter:description']) setMeta(key.startsWith('og:') ? 'property' : 'name', key, description);
  setMeta('property', 'og:url', canonical);
  setMeta('property', 'og:type', 'website');
  setMeta('name', 'twitter:card', 'summary');
  for (const key of ['og:image', 'og:image:secure_url', 'twitter:image']) setMeta(key.startsWith('og:') ? 'property' : 'name', key, SITE_ORIGIN + '/fixbridge-logo.png');
  document.head.querySelectorAll('meta[property="og:image:width"],meta[property="og:image:height"]').forEach(el => el.remove());
  let script = document.getElementById('public-structured-data');
  if (privatePage) {
    script?.remove();
  } else {
    if (!script) {
      script = document.createElement('script');
      script.id = 'public-structured-data';
      script.setAttribute('type', 'application/ld+json');
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(structuredData(page));
  }
}
