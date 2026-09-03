/**
 * Full dispatch lifecycle regression orchestrator.
 * Runs focused smokes in sequence — extend as fixtures mature.
 */
import { spawn } from 'node:child_process';

const API = process.argv[2] || process.env.API_BASE || 'http://127.0.0.1:3001';
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
      env: process.env,
    });
    child.on('close', (code) => resolve(code === 0));
  });
}

async function main() {
  console.log(`\nFixBridge dispatch lifecycle @ ${API}\n`);
  let passed = 0;
  for (const s of scripts) {
    const ok = await run(s);
    if (ok) passed += 1;
    else process.exitCode = 1;
  }
  console.log(`\nLifecycle summary: ${passed}/${scripts.length} suites passed\n`);
}

main();
