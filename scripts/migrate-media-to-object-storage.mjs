// Moves case photos already stored in the database into object storage.
//
//   NEON_DATABASE_URL=... MEDIA_STORAGE=s3 S3_BUCKET=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
//   [S3_ENDPOINT=... S3_REGION=auto] node scripts/migrate-media-to-object-storage.mjs [--dry-run] [--batch=100]
//
// Safe to re-run and to stop at any time: each row is switched to its object reference only after
// the upload succeeded, and only if it still holds the same photo. A cover photo that is also a
// case photo is uploaded once and both rows point to it.
import pg from 'pg';
import { objectStorageConfig, putDataUrl } from '../api/object-storage.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const dryRun = 'dry-run' in args;
const batch = Math.max(1, Math.min(500, Number(args.batch || 100)));
objectStorageConfig(); // fails fast if the bucket settings are missing

const pool = new pg.Pool({
  connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
  ssl: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false' ? { rejectUnauthorized: false } : undefined,
  max: 4,
});

const totals = { covers: 0, casePhotos: 0, bytes: 0, failed: 0 };

async function migrateCovers(table, caseType, mediaColumn) {
  for (;;) {
    const { rows } = await pool.query(
      `SELECT id, media_data_url FROM ${table} WHERE media_data_url LIKE 'data:%' ORDER BY id LIMIT $1`, [batch]);
    if (!rows.length) return;
    for (const row of rows) {
      try {
        totals.bytes += row.media_data_url.length;
        if (dryRun) { totals.covers += 1; continue; }
        const ref = await putDataUrl(row.media_data_url, { prefix: `cases/${caseType}/${row.id}` });
        await pool.query(`UPDATE ${table} SET media_data_url=$1 WHERE id=$2 AND media_data_url=$3`, [ref, row.id, row.media_data_url]);
        // The same photo in media_objects points to the same object.
        await pool.query(
          `UPDATE media_objects SET data_url=$1 WHERE ${mediaColumn}=$2 AND kind='fixera_repair_case' AND data_url=$3`,
          [ref, row.id, row.media_data_url]);
        totals.covers += 1;
      } catch (e) {
        totals.failed += 1;
        console.error(`[migrate] ${table} ${row.id}: ${e.message}`);
      }
    }
    if (dryRun) return;
  }
}

async function migrateCasePhotos() {
  let lastId = 0;
  for (;;) {
    const { rows } = await pool.query(
      `SELECT id, case_type, job_id, pending_service_request_id, data_url FROM media_objects
        WHERE kind='fixera_repair_case' AND data_url LIKE 'data:%' AND id > $1 ORDER BY id LIMIT $2`, [lastId, batch]);
    if (!rows.length) return;
    for (const row of rows) {
      lastId = Number(row.id);
      try {
        totals.bytes += row.data_url.length;
        if (dryRun) { totals.casePhotos += 1; continue; }
        const caseId = row.job_id || row.pending_service_request_id;
        const ref = await putDataUrl(row.data_url, { prefix: `cases/${row.case_type || 'managed_job'}/${caseId}` });
        await pool.query(`UPDATE media_objects SET data_url=$1 WHERE id=$2 AND data_url=$3`, [ref, row.id, row.data_url]);
        totals.casePhotos += 1;
      } catch (e) {
        totals.failed += 1;
        console.error(`[migrate] media_objects ${row.id}: ${e.message}`);
      }
    }
  }
}

await migrateCovers('managed_jobs', 'managed_job', 'job_id');
await migrateCovers('pending_service_requests', 'pending_service_request', 'pending_service_request_id');
await migrateCasePhotos();
console.log(JSON.stringify({ dryRun, ...totals, megabytesMoved: Math.round(totals.bytes / 1024 / 1024) }));
await pool.end();
process.exit(totals.failed ? 1 : 0);
