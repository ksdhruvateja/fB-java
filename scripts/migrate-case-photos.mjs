// Moves case photos that older rows still hold as full base64 "data:" text into the configured
// photo store: Neon (default, bytes in media_objects.bytes) or the bucket (MEDIA_STORAGE=s3).
// Afterwards the job rows hold only a short reference, so reading a job no longer pulls its photo.
//
//   NEON_DATABASE_URL=... node scripts/migrate-case-photos.mjs --dry-run
//   NEON_DATABASE_URL=... node scripts/migrate-case-photos.mjs [--batch=100]
//
// Safe to stop and re-run: a row switches to its reference only after the photo is stored, and
// only if it still holds the same photo. A cover photo that is also a case photo is stored once.
import pg from 'pg';
import { mediaBackend, parseDataUrl, prepareStoredMedia, referenceForMediaRow } from '../api/media-store.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const dryRun = 'dry-run' in args;
const batch = Math.max(1, Math.min(500, Number(args.batch || 100)));

const pool = new pg.Pool({
  connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
  ssl: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false' ? { rejectUnauthorized: false } : undefined,
  max: 4,
});
await pool.query(`ALTER TABLE media_objects ADD COLUMN IF NOT EXISTS bytes BYTEA`);

const totals = { backend: mediaBackend(), covers: 0, casePhotos: 0, megabytes: 0, failed: 0 };

async function storeInto(rowId, dataUrl, prefix) {
  const stored = await prepareStoredMedia(dataUrl, { prefix });
  const { rows } = await pool.query(
    `UPDATE media_objects SET data_url=$2, bytes=$3 WHERE id=$1
     RETURNING id, data_url, (bytes IS NOT NULL) AS has_bytes`,
    [rowId, stored.data_url, stored.bytes]);
  return referenceForMediaRow(rows[0]);
}

async function migrateCovers(table, caseType, column) {
  let lastId = 0;
  for (;;) {
    const { rows } = await pool.query(
      `SELECT id, homeowner_user_id, property_id, media_data_url FROM ${table}
        WHERE media_data_url LIKE 'data:%' AND id > $1 ORDER BY id LIMIT $2`, [lastId, batch]);
    if (!rows.length) return;
    for (const row of rows) {
      lastId = Number(row.id);
      totals.megabytes += row.media_data_url.length / 1024 / 1024;
      if (dryRun) { totals.covers += 1; continue; }
      try {
        const parsed = parseDataUrl(row.media_data_url);
        if (!parsed) throw new Error('not a base64 data URL');
        // Reuse the identical case photo row when there is one; otherwise add one.
        let { rows: same } = await pool.query(
          `SELECT id FROM media_objects WHERE ${column}=$1 AND kind='fixera_repair_case' AND data_url=$2 ORDER BY id LIMIT 1`,
          [row.id, row.media_data_url]);
        if (!same[0]) {
          ({ rows: same } = await pool.query(
            `INSERT INTO media_objects (owner_user_id, ${column}, case_type, property_id, kind, storage_key, content_type, byte_size)
             VALUES ($1,$2,$3,$4,'fixera_repair_case',$5,$6,$7) RETURNING id`,
            [row.homeowner_user_id, row.id, caseType, row.property_id || null, `fixera/${caseType}/${row.id}/cover`, parsed.contentType, parsed.body.length]));
        }
        const ref = await storeInto(same[0].id, row.media_data_url, `cases/${caseType}/${row.id}`);
        await pool.query(
          `UPDATE media_objects SET data_url=(SELECT data_url FROM media_objects WHERE id=$1), bytes=(SELECT bytes FROM media_objects WHERE id=$1)
            WHERE ${column}=$2 AND kind='fixera_repair_case' AND data_url=$3 AND id<>$1`,
          [same[0].id, row.id, row.media_data_url]);
        await pool.query(`UPDATE ${table} SET media_data_url=$1 WHERE id=$2 AND media_data_url=$3`, [ref, row.id, row.media_data_url]);
        totals.covers += 1;
      } catch (e) {
        totals.failed += 1;
        console.error(`[migrate] ${table} ${row.id}: ${e.message}`);
      }
    }
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
      totals.megabytes += row.data_url.length / 1024 / 1024;
      if (dryRun) { totals.casePhotos += 1; continue; }
      try {
        await storeInto(row.id, row.data_url, `cases/${row.case_type || 'managed_job'}/${row.job_id || row.pending_service_request_id}`);
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
totals.megabytes = Math.round(totals.megabytes);
console.log(JSON.stringify({ dryRun, ...totals }));
await pool.end();
process.exit(totals.failed ? 1 : 0);
