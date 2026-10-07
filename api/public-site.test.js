import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { registerPublicSite } from './public-site.js';
import { PUBLIC_PAGES, PRIVATE_PATHS, SOLUTION_PAGES, CATALOG } from '../shared/public-seo.js';
test('public routes preserve API behavior, redirect canonical paths, noindex private shells and return real 404s', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fixbridge-seo-'));
  for (const p of PUBLIC_PAGES) {
    const target = path.join(dir, p.path.slice(1), 'index.html');
    await fs.mkdir(path.dirname(target), {
      recursive: true
    });
    await fs.writeFile(target, '<h1>' + p.page + '</h1>');
  }
  await fs.writeFile(path.join(dir, 'private.html'), '<meta name="robots" content="noindex, follow">');
  await fs.writeFile(path.join(dir, '404.html'), '<h1>Page not found</h1>');
  const app = express();
  app.get('/api/test', (_, r) => r.json({
    ok: true
  }));
  registerPublicSite(app, dir);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const p of PUBLIC_PAGES) {
      const r = await fetch(base + p.path);
      assert.equal(r.status, 200);
      assert.match(await r.text(), new RegExp(p.page));
    }
    for (const p of ['/?portal=admin', '/?paid=subscription', '/?action=reset-password', ...Object.values(PRIVATE_PATHS), '/reset-password', '/start', '/legal/terms', '/marketing/unsubscribe']) {
      const r = await fetch(base + p);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('x-robots-tag'), 'noindex, follow');
      assert.match(await r.text(), /noindex/);
    }
    const redirected = await fetch(base + '/about/?ref=sample', {
      redirect: 'manual'
    });
    assert.equal(redirected.status, 308);
    assert.equal(redirected.headers.get('location'), '/about?ref=sample');
    assert.equal((await fetch(base + '/unknown-page')).status, 404);
    assert.equal((await fetch(base + '/missing.js')).status, 404);
    assert.deepEqual(await (await fetch(base + '/api/test')).json(), {
      ok: true
    });
    assert.equal((await fetch(base + '/api/missing')).status, 404);
  } finally {
    await new Promise(r => server.close(r));
    await fs.rm(dir, {
      recursive: true,
      force: true
    });
  }
});
test('every canonical service maps once to a guide section', () => {
  const ids = SOLUTION_PAGES.flatMap(p => p.ids);
  assert.equal(ids.length, 28);
  assert.equal(new Set(ids).size, 28);
  assert.deepEqual([...ids].sort(), CATALOG.map(s => s.id).sort());
  assert.equal(CATALOG.filter(s => !s.active || !s.homeownerVisible).length, 0);
});
