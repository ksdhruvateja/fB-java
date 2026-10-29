// A database set up by an earlier release (schema version already recorded) must still receive new
// columns and tables on the next start. Needs FIXERA_TEST_DATABASE_URL (real PostgreSQL); the test works in
// its own scratch database so it never disturbs tables other test files are using.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import pg from 'pg';

const TEST_DB = process.env.FIXERA_TEST_DATABASE_URL;
const t = TEST_DB ? test : test.skip;
const run = promisify(execFile);
const SCRATCH_NAME = `fixera_schema_upgrade_${process.pid}`;
const scratchUrl = () => {
  const url = new URL(TEST_DB);
  url.pathname = `/${SCRATCH_NAME}`;
  return url.toString();
};
const startOnce = () => run('node', ['-e', "import('./api/app.js').then(async (m) => { await m.initDb(); await m.pool.end(); process.exit(0); })"], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, NEON_DATABASE_URL: scratchUrl(), SESSION_SECRET: 'schema-upgrade-test' },
  timeout: 240000,
});

t('an existing database marked with the previous schema version gets the new columns and tables', async () => {
  const admin = new pg.Pool({ connectionString: TEST_DB });
  await admin.query(`DROP DATABASE IF EXISTS ${SCRATCH_NAME}`);
  await admin.query(`CREATE DATABASE ${SCRATCH_NAME}`);
  const pool = new pg.Pool({ connectionString: scratchUrl() });
  try {
    await startOnce();
    // Recreate what production looked like: set up by the previous release, new objects missing.
    await pool.query(`ALTER TABLE users DROP COLUMN IF EXISTS password_login_enabled`);
    await pool.query(`ALTER TABLE media_objects DROP COLUMN IF EXISTS bytes`);
    await pool.query(`DROP TABLE IF EXISTS fixera_user_profiles`);
    await pool.query(`DROP TABLE IF EXISTS fixera_case_outcomes`);
    await pool.query(`UPDATE app_schema_meta SET version=20261001 WHERE id=1`);
    if (!(await pool.query(`SELECT 1 FROM users LIMIT 1`)).rows.length) {
      await pool.query(`INSERT INTO users (role,name,email,password) VALUES ('homeowner','x','schema-upgrade@example.org','x')`);
    }

    await startOnce();

    const col = async (table, column) => (await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`, [table, column])).rows.length === 1;
    const tbl = async (table) => (await pool.query(`SELECT to_regclass($1) AS t`, [table])).rows[0].t !== null;
    assert.equal(await col('users', 'password_login_enabled'), true);
    assert.equal(await col('media_objects', 'bytes'), true);
    assert.equal(await tbl('fixera_user_profiles'), true);
    assert.equal(await tbl('fixera_case_outcomes'), true);
    assert.ok((await pool.query(`SELECT version FROM app_schema_meta WHERE id=1`)).rows[0].version > 20261001);
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS ${SCRATCH_NAME}`);
    await admin.end();
  }
});
