/**
 * Full dispatch lifecycle regression orchestrator.
 * Runs focused smokes in sequence — extend as fixtures mature.
 */
import { spawn } from 'node:child_process';
import { resolveSmokeApiBase } from './smoke-api-base.mjs';

const API = resolveSmokeApiBase();
const scripts = [
  'smoke-dispatch-quotes-team.mjs',
  'smoke-inapp-communications.mjs',
  'smoke-disputes.mjs',
  'smoke-availability.mjs',
  'smoke-quote-alternatives.mjs',
  'smoke-universal-search.mjs',
];

function run(script) {
  return new Promise((resolve) => {
    console.log(`\n── ${script} ──\n`);
    const child = spawn(process.execPath, ['--env-file=.env', `scripts/${script}`, API], {
      stdio: 'inherit',
      shell: false,
      env: { ...process.env, API_BASE: API, API_BASE_URL: API },
    });
    child.on('close', (code) => resolve(code === 0));
  });
}

async function main() {
  console.log(`\nFixBridge dispatch lifecycle @ ${API}\n`);
  let passed = 0;
  for (let i = 0; i < scripts.length; i++) {
    const s = scripts[i];
    const ok = await run(s);
    if (ok) passed += 1;
    else process.exitCode = 1;
    // Cool down between suites to avoid auth rate-limit collisions.
    if (i < scripts.length - 1) {
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  console.log(`\nLifecycle summary: ${passed}/${scripts.length} suites passed\n`);
}

main();
