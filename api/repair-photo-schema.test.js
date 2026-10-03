import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

test('previously ready schema receives photo and property-cover columns without rerunning unrelated initialization', async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test', NEON_DATABASE_URL: '', SESSION_SECRET: 'local-schema-fixture',
    ENABLE_DEMO_USERS: 'false', ENABLE_DEMO_SEED: 'false', DISABLE_OUTBOUND_EMAIL: 'true',
    STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', GEMINI_API_KEY: '',
    OPENAI_API_KEY: '', OPENROUTER_API_KEY: '', ANTHROPIC_API_KEY: '',
  });
  const require = createRequire(import.meta.url);
  const pgMem = require('pg-mem');
  const originalNewDb = pgMem.newDb;
  pgMem.newDb = (options) => {
    const db = originalNewDb({ ...options, noAstCoverageCheck: true });
    for (const name of ['trim', 'btrim']) db.public.registerFunction({
      name, args: ['text'], returns: 'text', implementation: (value) => value.trim(),
    });
    return db;
  };
  const { pool, initDb } = await import('./app.js');
  try {
    await initDb();
    await pool.query('ALTER TABLE managed_jobs DROP COLUMN media_data_urls');
    await pool.query('ALTER TABLE pending_service_requests DROP COLUMN media_data_urls');
    for (const column of ['cover_kind', 'cover_stock_key', 'cover_image', 'cover_version']) {
      await pool.query(`ALTER TABLE properties DROP COLUMN ${column}`);
    }
    await pool.query('UPDATE app_schema_meta SET version=20261001 WHERE id=1');
    const query = pool.query.bind(pool);
    const statements = [];
    pool.query = (sql, ...args) => { statements.push(String(sql)); return query(sql, ...args); };
    initDb._done = false;
    await initDb();
    assert.equal(statements.filter((sql) => /^ALTER TABLE/.test(sql) && /media_data_urls/.test(sql)).length, 2);
    assert.ok(statements.every((sql) => !/CREATE TABLE/.test(sql) || /app_schema_meta/.test(sql)));
    assert.ok(statements.length < 20, 'warm upgrade must not rerun full initialization');
    await pool.query('SELECT media_data_urls FROM managed_jobs LIMIT 1');
    await pool.query('SELECT media_data_urls FROM pending_service_requests LIMIT 1');
    await pool.query('SELECT cover_kind, cover_stock_key, cover_image, cover_version FROM properties LIMIT 1');
    assert.equal(Number((await pool.query('SELECT version FROM app_schema_meta WHERE id=1')).rows[0].version), 20261003);
    statements.length = 0;
    initDb._done = false;
    await initDb();
    assert.equal(statements.filter((sql) => /^ALTER TABLE/.test(sql) && /media_data_urls/.test(sql)).length, 0);
  } finally {
    pgMem.newDb = originalNewDb;
    await pool.end();
  }
});
