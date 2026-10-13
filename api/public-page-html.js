/**
 * Server-side page metadata for the public content pages, so crawlers and link previews see the
 * right title and description without running the app. Also builds sitemap.xml.
 */
import { publicMetaForPath, publicSitemapPaths } from '../src/shared/publicSiteMeta.js';

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function replaceMeta(html, attr, key, content) {
  const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`);
  const reMultiline = new RegExp(`(<meta\\s+${attr}="${key}"\\s*\\n\\s*content=")[^"]*(")`);
  if (re.test(html)) return html.replace(re, `$1${content}$2`);
  return html.replace(reMultiline, `$1${content}$2`);
}

/** Returns index.html with the page's title/description/canonical, or the original for other paths. */
export function renderPublicPageHtml(indexHtml, pathname, siteUrl, productName = 'FixBridge') {
  const meta = publicMetaForPath(pathname);
  if (!meta) return indexHtml;
  const base = String(siteUrl || '').replace(/\/+$/, '');
  const url = `${base}${meta.path}`;
  const title = escapeHtml(`${meta.title} · ${productName}`);
  const description = escapeHtml(meta.description);
  let html = indexHtml.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
  html = replaceMeta(html, 'name', 'description', description);
  html = replaceMeta(html, 'property', 'og:title', title);
  html = replaceMeta(html, 'property', 'og:description', description);
  html = replaceMeta(html, 'property', 'og:url', escapeHtml(url));
  html = replaceMeta(html, 'property', 'og:type', meta.type === 'article' ? 'article' : 'website');
  html = replaceMeta(html, 'name', 'twitter:title', title);
  html = replaceMeta(html, 'name', 'twitter:description', description);
  html = html.replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/, `$1${escapeHtml(url)}$2`);
  return html;
}

export function buildSitemapXml(siteUrl) {
  const base = String(siteUrl || '').replace(/\/+$/, '');
  const urls = publicSitemapPaths()
    .map((path) => `  <url><loc>${escapeHtml(`${base}${path === '/' ? '/' : path}`)}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
