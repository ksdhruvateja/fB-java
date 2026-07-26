const { spawnSync } = require('child_process');
const fs = require('fs');
const cli = String.raw`C:\Users\bossd\AppData\Local\Temp\cursor-sandbox-cache\9b124843c2438d6ff6b7315521a3981f\npm\_npx\da5c1b6ea715e8b4\node_modules\netlify-cli\bin\run.js`;

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
  });
}

function getEnv(key) {
  const lines = fs.readFileSync('.env', 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const m = line.match(new RegExp('^\\s*' + key + '\\s*=\\s*(.*)$'));
    if (!m) continue;
    let v = m[1].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!v) throw new Error('Empty ' + key);
    return v;
  }
  throw new Error('Missing ' + key);
}

const keys = ['VITE_GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_ID', 'VITE_GEMINI_API_KEY'];
for (const key of keys) {
  const val = getEnv(key);
  console.log('SETTING_KEY=' + key);
  // Existing vars: do not pass --context/--scope together
  let r = run(['env:set', key, val, '--force']);
  let out = ((r.stdout || '') + (r.stderr || '')).split(val).join('[REDACTED]');
  if (r.status !== 0) {
    console.log('RETRY_UNSET=' + key);
    run(['env:unset', key, '--force']);
    r = run(['env:set', key, val, '--force']);
    out = ((r.stdout || '') + (r.stderr || '')).split(val).join('[REDACTED]');
  }
  console.log(out.slice(0, 600));
  if (r.status !== 0) {
    console.log('FAIL=' + key + ' status=' + r.status);
    process.exit(r.status || 1);
  }
  console.log('SET_OK=' + key);
}
console.log('ALL_ENV_SET_OK');
