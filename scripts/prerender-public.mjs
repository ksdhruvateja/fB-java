import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { PUBLIC_PAGES, PRIVATE_PATHS, SITE_ORIGIN, structuredData } from '../shared/public-seo.js';
const escape = value => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]);
export function withMeta(shell, meta, privatePage = false) {
  let html = shell.replace(/<title>[\s\S]*?<\/title>/, '').replace(/<link\b[^>]*rel="canonical"[^>]*>/g, '').replace(/<meta\b[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/g, '');
  const title = meta.title,
    description = meta.description,
    url = SITE_ORIGIN + meta.path,
    image = SITE_ORIGIN + '/fixbridge-authoritative.png';
  const tags = '<title>' + escape(title) + '</title><meta name="description" content="' + escape(description) + '"><meta name="robots" content="' + (privatePage ? 'noindex, follow' : 'index, follow') + '">' + (privatePage ? '' : '<link rel="canonical" href="' + escape(url) + '">') + ['og:title', 'og:description', 'og:url', 'og:image', 'og:type', 'og:site_name'].map((key, i) => '<meta property="' + key + '" content="' + escape([title, description, url, image, 'website', 'FixBridge'][i]) + '">').join('') + ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'].map((key, i) => '<meta name="' + key + '" content="' + escape(['summary', title, description, image][i]) + '">').join('') + (privatePage ? '' : '<script id="public-structured-data" type="application/ld+json">' + JSON.stringify(structuredData(meta.page)).replace(/</g, '\\u003c') + '</script>');
  return html.replace('</head>', tags + '</head>');
}
export async function prerenderPublic(outDir) {
  const output = path.resolve(outDir);
  const shell = await fs.readFile(path.join(output, 'index.html'), 'utf8');
  const vite = await createServer({
    server: {
      middlewareMode: true
    },
    appType: 'custom'
  });
  try {
    const {
      renderPublicPage
    } = await vite.ssrLoadModule('/src/app/seoRender.tsx');
    for (const meta of PUBLIC_PAGES) {
      const target = path.join(output, meta.path.slice(1), 'index.html');
      await fs.mkdir(path.dirname(target), {
        recursive: true
      });
      const html = withMeta(shell, meta).replace('<div id="root"></div>', '<div id="root">' + renderPublicPage(meta.page) + '</div>');
      await fs.writeFile(target, html);
    }
    const privateHtml = withMeta(shell, {
      title: 'Account & Legal Information | FixBridge',
      description: 'Sign in to access your FixBridge account or review legal information.',
      path: '/'
    }, true);
    await fs.writeFile(path.join(output, 'private.html'), privateHtml);
    for (const route of Object.values(PRIVATE_PATHS)) {
      const target = path.join(output, route.slice(1), 'index.html');
      await fs.mkdir(path.dirname(target), {
        recursive: true
      });
      await fs.writeFile(target, privateHtml);
    }
    await fs.writeFile(path.join(output, '404.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex, follow"><title>Page not found | FixBridge</title></head><body><main><h1>Page not found</h1><p>This address does not match a FixBridge page.</p><a href="/">Homeowners</a> · <a href="/contractors">Contractors</a> · <a href="/about">About Us</a></main></body></html>');
    await fs.writeFile(path.join(output, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + PUBLIC_PAGES.map(p => '<url><loc>' + SITE_ORIGIN + p.path + '</loc></url>').join('') + '</urlset>');
    await fs.writeFile(path.join(output, 'robots.txt'), 'User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ' + SITE_ORIGIN + '/sitemap.xml\n');
    const special = ['/reset-password', '/start', '/marketing/unsubscribe', '/legal', '/legal/*'];
    await fs.writeFile(path.join(output, '_redirects'), '/api/* /.netlify/functions/api/:splat 200!\n' + PUBLIC_PAGES.filter(p => p.path !== '/').map(p => p.path + ' /' + p.path.slice(1) + '/index.html 200').join('\n') + '\n' + Object.values(PRIVATE_PATHS).map(p => p + ' /private.html 200').join('\n') + '\n' + special.map(p => p + ' /private.html 200').join('\n') + '\n/* /404.html 404\n');
    await fs.appendFile(path.join(output, '_headers'), '\n/private.html\n  X-Robots-Tag: noindex, follow\n/404.html\n  X-Robots-Tag: noindex, follow\n');
    console.log('[SEO] Rendered ' + PUBLIC_PAGES.length + ' public pages; sitemap, private shells and 404 generated.');
  } finally {
    await vite.close();
  }
}
