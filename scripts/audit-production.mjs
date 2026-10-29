#!/usr/bin/env node
/**
 * Master production-readiness runner.
 * Usage: npm run audit:production
 *        node --env-file=.env scripts/audit-production.mjs
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = process.env.API_BASE || 'http://127.0.0.1:3001';

const suites = [
  ['AUTH / IDOR', 'scripts/smoke-security-idor.mjs'],
  ['HARDENING', 'scripts/smoke-production-hardening.mjs'],
  ['WIRING', 'scripts/smoke-wiring-audit.mjs'],
  ['FULL', 'scripts/smoke-full.js'],
  ['ADMIN_OPS', 'scripts/smoke-admin-ops.js'],
  ['DISPATCH', 'scripts/smoke-dispatch.js'],
  ['NEON', 'scripts/smoke-neon-wiring.mjs'],
];

const results = [];

console.log(`\n=== FixBridge audit:production @ ${API} ===\n`);

for (const [name, script] of suites) {
  const r = spawnSync(process.execPath, ['--env-file=.env', script], {
    cwd: root,
    env: { ...process.env, API_BASE: API },
    encoding: 'utf8',
    shell: false,
  });
  const pass = r.status === 0;
  results.push({ name, pass, status: r.status });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} (exit ${r.status})`);
  if (!pass && r.stdout) console.log(r.stdout.slice(-1500));
  if (!pass && r.stderr) console.log(r.stderr.slice(-800));
}

console.log('\n── SUMMARY ──');
const labels = {
  AUTH: results.find((x) => x.name.includes('AUTH'))?.pass,
  HOMEOWNER: results.find((x) => x.name === 'WIRING')?.pass,
  CONTRACTOR: results.find((x) => x.name === 'FULL')?.pass,
  ADMIN: results.find((x) => x.name === 'ADMIN_OPS')?.pass,
  RBAC: results.find((x) => x.name === 'HARDENING')?.pass,
  IDOR: results.find((x) => x.name.includes('IDOR') || x.name.includes('AUTH'))?.pass,
  'PRICING PRIVACY': results.find((x) => x.name === 'HARDENING')?.pass,
  REVIEWS: results.find((x) => x.name === 'HARDENING')?.pass,
  PAYMENTS: results.find((x) => x.name === 'FULL')?.pass,
  'STRIPE WEBHOOKS': 'BLOCKED_EXTERNAL_CONFIG',
  PAYOUTS: results.find((x) => x.name === 'DISPATCH')?.pass,
  PARTNERS: results.find((x) => x.name === 'HARDENING')?.pass,
  DATABASE: results.find((x) => x.name === 'NEON')?.pass,
  'MOBILE BUILD': 'PARTIAL',
  'PRODUCTION CONFIG': results.find((x) => x.name === 'HARDENING')?.pass,
};

for (const [k, v] of Object.entries(labels)) {
  const status = v === true ? 'PASS' : v === false ? 'FAIL' : v;
  console.log(`${k}\n${status}\n`);
}

const hardFail = results.some((r) => !r.pass);
process.exit(hardFail ? 1 : 0);
