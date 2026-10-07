import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PUBLIC_PAGES, SOLUTION_PAGES, CATALOG, SITE_ORIGIN } from '../shared/public-seo.js';
const dir = path.resolve(process.argv[2] || 'dist');
const titles = new Set(),
  descriptions = new Set();
for (const p of PUBLIC_PAGES) {
  const html = await fs.readFile(path.join(dir, p.path.slice(1), 'index.html'), 'utf8');
  const title = html.match(/<title>(.*?)<\/title>/)?.[1],
    description = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  assert.ok(title && description);
  assert.ok(!titles.has(title));
  assert.ok(!descriptions.has(description));
  titles.add(title);
  descriptions.add(description);
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  assert.ok(html.includes('href="' + SITE_ORIGIN + p.path + '"'));
  assert.ok(html.includes('content="index, follow"'));
  assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1);
  assert.ok(html.includes('id="root"><div'));
  const json = JSON.parse(html.match(/<script id="public-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(json['@context'], 'https://schema.org');
  assert.ok(!html.includes('%SITE_URL%'));
  for (const item of SOLUTION_PAGES.filter(g => g.page === p.page)) {
    for (const id of item.ids) assert.ok(html.includes('id="' + id + '"'));
  }
  if (p.page === 'about') {
    for (const group of SOLUTION_PAGES) for (const id of group.ids) assert.ok(html.includes('href="' + group.path + '#' + id + '"'));
  }
}
const sitemap = await fs.readFile(path.join(dir, 'sitemap.xml'), 'utf8');
assert.equal((sitemap.match(/<loc>/g) || []).length, PUBLIC_PAGES.length);
for (const p of PUBLIC_PAGES) assert.ok(sitemap.includes('<loc>' + SITE_ORIGIN + p.path + '</loc>'));
const robots = await fs.readFile(path.join(dir, 'robots.txt'), 'utf8');
assert.ok(robots.includes('Sitemap: ' + SITE_ORIGIN + '/sitemap.xml'));
assert.ok(!robots.includes('Disallow: /homeowner'));
const priv = await fs.readFile(path.join(dir, 'private.html'), 'utf8');
assert.ok(priv.includes('noindex, follow'));
assert.ok(!priv.includes('rel="canonical"'));
assert.ok(!priv.includes('public-structured-data'));
assert.ok(!sitemap.includes('login'));
console.log(JSON.stringify({
  publicPages: PUBLIC_PAGES.length,
  uniqueTitles: titles.size,
  uniqueDescriptions: descriptions.size,
  mappedServices: CATALOG.length,
  rawHtmlAndMetadata: 'passed',
  sitemapAndRobots: 'passed'
}));
