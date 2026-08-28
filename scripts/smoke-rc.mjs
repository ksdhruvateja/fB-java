/**
 * Release candidate regression — P0 + P1 + security + finance checks.
 * Usage: node --env-file=.env scripts/smoke-rc.mjs
 */
import { spawnSync } from 'child_process';

const API = process.env.API_BASE || 'http://127.0.0.1:3001';
const suites = [
  'scripts/smoke-p0-remediation.mjs',
  'scripts/p0-tip-calculations.mjs',
  'scripts/smoke-stripe-e2e.mjs',
  'scripts/smoke-coupon-concurrency.mjs',
  'scripts/smoke-change-order.mjs',
  'scripts/smoke-zero-dollar.mjs',
  'scripts/smoke-rbac.mjs',
  'scripts/smoke-p1.mjs',
];

let failed = 0;
console.log(`\n=== FixBridge RC Smoke @ ${API} ===\n`);

for (const script of suites) {
  const r = spawnSync(process.execPath, ['--env-file=.env', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, API_BASE: API },
  });
  const pass = r.status === 0;
  if (!pass) failed++;
  const tail = (r.stdout || r.stderr || '').trim().split('\n').slice(-2).join(' | ');
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${script}${tail ? ` — ${tail}` : ''}`);
}

console.log(`\n--- RC: ${suites.length - failed}/${suites.length} suites passed ---\n`);
process.exit(failed ? 1 : 0);
