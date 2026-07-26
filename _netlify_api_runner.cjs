const { spawnSync } = require('child_process');
const fs = require('fs');
const cli = String.raw`C:\Users\bossd\AppData\Local\Temp\cursor-sandbox-cache\9b124843c2438d6ff6b7315521a3981f\npm\_npx\da5c1b6ea715e8b4\node_modules\netlify-cli\bin\run.js`;
const method = process.argv[2];
const dataPath = process.argv[3] || './_netlify_api_data.json';
const data = fs.readFileSync(dataPath, 'utf8');
const r = spawnSync(process.execPath, [cli, 'api', method, '--data', data], { encoding: 'utf8', env: { ...process.env, CI: 'true' } });
const out = (r.stdout || '') + (r.stderr || '');
fs.writeFileSync('.netlify-api-out.txt', out);
console.log('status=' + r.status + ' outLen=' + out.length);
const m = out.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
if (m) {
  try {
    const j = JSON.parse(m[0]);
    if (Array.isArray(j)) {
      console.log('COUNT=' + j.length);
      for (const d of j.slice(0, 8)) {
        console.log([d.created_at, d.state, d.context, d.branch, (d.commit_ref||'').slice(0,8), d.error_message||'', d.id].join(' | '));
      }
    } else {
      console.log(['BUILD', j.created_at||'', j.state||'', j.done||'', j.error||'', j.deploy_id||'', j.id||''].join(' | '));
    }
  } catch (e) {
    console.log('PARSE_FAIL ' + e.message);
    console.log(out.slice(0, 500));
  }
} else {
  console.log(out.slice(0, 800));
}
process.exit(r.status == null ? 1 : r.status);
