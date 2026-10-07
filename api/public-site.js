import express from 'express';
import path from 'node:path';
import { PUBLIC_PAGES, PRIVATE_PATHS } from '../shared/public-seo.js';
export function registerPublicSite(app, distDir) {
  const publicPaths = new Set(PUBLIC_PAGES.map(p => p.path));
  const privatePaths = new Set([...Object.values(PRIVATE_PATHS), '/reset-password', '/start', '/marketing/unsubscribe', '/legal']);
  app.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) || req.path.startsWith('/api/') || req.path === '/api') return next();
    const clean = req.path.replace(/\/+$/, '') || '/';
    if ((publicPaths.has(clean) || privatePaths.has(clean)) && req.path !== clean) {
      return res.redirect(308, clean + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''));
    }
    const sensitiveQuery = ['token', 'action', 'paid', 'portal', 'stripe', 'session_id'].some(key => Object.hasOwn(req.query, key));
    if (publicPaths.has(clean) && sensitiveQuery) {
      res.set('X-Robots-Tag', 'noindex, follow');
      return res.sendFile(path.join(distDir, 'private.html'));
    }
    if (publicPaths.has(clean)) {
      return res.sendFile(path.join(distDir, clean.slice(1), 'index.html'));
    }
    if (privatePaths.has(clean) || clean.startsWith('/legal/')) {
      res.set('X-Robots-Tag', 'noindex, follow');
      return res.sendFile(path.join(distDir, 'private.html'));
    }
    return next();
  });
  app.use(express.static(distDir, {
    index: false,
    redirect: false
  }));
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
    res.set('X-Robots-Tag', 'noindex, follow');
    return res.status(404).sendFile(path.join(distDir, '404.html'));
  });
}
