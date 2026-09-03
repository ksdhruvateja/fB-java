/**
 * Attachment storage diagnostics — counts and sizes only. Never prints file contents.
 * Usage: node --env-file=.env scripts/attachment-storage-stats.mjs
 */
import pg from 'pg';
import { postgresSslOptions } from '../api/db-ssl.js';
import { attachmentStorageStats } from '../api/attachment-storage.js';

const url = process.env.NEON_DATABASE_URL;
if (!url) {
  console.error('NEON_DATABASE_URL missing — cannot calculate attachment stats.');
  process.exit(1);
}

const connectionString = url.includes('uselibpqcompat=')
  ? url
  : `${url}${url.includes('?') ? '&' : '?'}uselibpqcompat=true`;

const pool = new pg.Pool({
  connectionString,
  ssl: postgresSslOptions(),
  max: 2,
});

try {
  const stats = await attachmentStorageStats(pool);
  const out = {
    provider: stats.provider,
    limits: {
      maxAttachmentSizeMb: stats.maxAttachmentSizeMb,
      maxAttachmentsPerMessage: stats.maxAttachmentsPerMessage,
    },
    messaging: {
      count: Number(stats.messaging.count || 0),
      totalBytes: Number(stats.messaging.total_bytes || 0),
      averageBytes: Number(stats.messaging.avg_bytes || 0),
      largestBytes: Number(stats.messaging.max_bytes || 0),
    },
    disputes: {
      count: Number(stats.disputes.count || 0),
      totalBytes: Number(stats.disputes.total_bytes || 0),
      averageBytes: Number(stats.disputes.avg_bytes || 0),
      largestBytes: Number(stats.disputes.max_bytes || 0),
    },
    totals: stats.totals,
    recommendation: stats.recommendation,
    objectStorageNeededBefore: stats.objectStorageNeededBefore,
  };
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  console.error('attachment stats failed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
