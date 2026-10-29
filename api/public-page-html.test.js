import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildSitemapXml, renderPublicPageHtml } from './public-page-html.js';

const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replaceAll('%SITE_URL%', 'https://fixbridge.us');

test('content pages get their own title, description and canonical URL', () => {
  const html = renderPublicPageHtml(indexHtml, '/contact', 'https://fixbridge.us');
  assert.match(html, /<title>Contact FixBridge · FixBridge<\/title>/);
  assert.match(html, /name="description"\s+content="Contact FixBridge for support/);
  assert.match(html, /<link rel="canonical" href="https:\/\/fixbridge.us\/contact"/);
  assert.match(html, /property="og:url" content="https:\/\/fixbridge.us\/contact"/);
});

test('blog articles are typed as articles; unknown paths are left alone', () => {
  const html = renderPublicPageHtml(indexHtml, '/blog/prevent-frozen-pipes/', 'https://fixbridge.us');
  assert.match(html, /<title>How to Prevent Frozen Pipes This Winter · FixBridge<\/title>/);
  assert.match(html, /property="og:type" content="article"/);
  assert.equal(renderPublicPageHtml(indexHtml, '/blog/not-a-real-post', 'https://fixbridge.us'), indexHtml);
  assert.equal(renderPublicPageHtml(indexHtml, '/', 'https://fixbridge.us'), indexHtml);
});

test('the sitemap lists the content pages and every article', () => {
  const xml = buildSitemapXml('https://fixbridge.us/');
  for (const path of ['/how-it-works', '/fixera-assessment', '/find-a-contractor', '/blog', '/press', '/careers', '/contact', '/blog/water-heater-basics']) {
    assert.ok(xml.includes(`<loc>https://fixbridge.us${path}</loc>`), path);
  }
});
