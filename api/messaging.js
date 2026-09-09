import { clampString } from './security.js';
import { createInAppNotification, notifyAdmins } from './in-app-notifications.js';
import {
  saveAttachment,
  getAttachment,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from './attachment-storage.js';

export const CONVERSATION_TYPES = ['homeowner_admin', 'contractor_admin'];
export const CONVERSATION_STATUSES = ['open', 'resolved', 'closed'];
export const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
export const MAX_BODY_LEN = 8000;
export const MAX_ATTACHMENTS = MAX_ATTACHMENTS_PER_MESSAGE;
export const MAX_ATTACHMENT_BYTES_LIMIT = MAX_ATTACHMENT_BYTES;
export { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_MESSAGE };
export const MAX_MESSAGES_PER_MINUTE = 30;

const rateBuckets = new Map();

function checkRateLimit(userId) {
  const key = String(userId);
  const now = Date.now();
  const windowMs = 60_000;
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start > windowMs) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count <= MAX_MESSAGES_PER_MINUTE;
}

function stripHtml(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .trim();
}

function adminDisplayName() {
  return 'FixBridge Support';
}

function safeFileName(name) {
  const base = String(name || 'file')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\.\./g, '_')
    .slice(0, 180);
  return base || 'file';
}

export async function initMessagingSchema(pool) {
  // Extend orphan conversations/messages tables for admin messaging
  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS type TEXT`);
  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS homeowner_user_id INT`);
  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS contractor_user_id INT`);
  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS subject TEXT`);
  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'`);
  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
  await pool.query(`ALTER TABLE conversations ALTER COLUMN job_id DROP NOT NULL`);

  try {
    await pool.query(`ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_job_id_key`);
  } catch {
    /* index may not exist */
  }

  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_role TEXT`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_display_name TEXT`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_by_admin_user_id INT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_read_cursors (
      conversation_id INT NOT NULL,
      user_id INT NOT NULL,
      last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (conversation_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_attachments (
      id BIGSERIAL PRIMARY KEY,
      message_id INT NOT NULL,
      conversation_id INT NOT NULL,
      uploader_user_id INT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INT NOT NULL,
      storage_data TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'database'`);
  await pool.query(`ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS storage_key TEXT`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_message_attachments_storage_key
    ON message_attachments (storage_key)
    WHERE storage_key IS NOT NULL
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_conversations_homeowner
    ON conversations (homeowner_user_id, updated_at DESC)
    WHERE homeowner_user_id IS NOT NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_conversations_contractor
    ON conversations (contractor_user_id, updated_at DESC)
    WHERE contractor_user_id IS NOT NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages (conversation_id, created_at ASC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_message_attachments_message
    ON message_attachments (message_id)
  `);
}

function rowToConversation(row, extras = {}) {
  return {
    id: Number(row.id),
    type: row.type,
    jobId: row.job_id != null ? Number(row.job_id) : null,
    homeownerUserId: row.homeowner_user_id != null ? Number(row.homeowner_user_id) : null,
    contractorUserId: row.contractor_user_id != null ? Number(row.contractor_user_id) : null,
    subject: row.subject || null,
    status: row.status || 'open',
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    unreadCount: extras.unreadCount || 0,
    lastMessagePreview: extras.lastMessagePreview || null,
    lastMessageAt: extras.lastMessageAt || null,
    counterpartyName: extras.counterpartyName || null,
    jobLabel: extras.jobLabel || null,
  };
}

function rowToMessage(row, attachments = []) {
  return {
    id: Number(row.id),
    conversationId: Number(row.conversation_id),
    senderUserId: Number(row.sender_user_id),
    senderRole: row.sender_role,
    senderDisplayName: row.sender_display_name || null,
    body: row.body,
    createdAt: row.created_at,
    attachments,
  };
}

function rowToAttachment(row) {
  return {
    id: Number(row.id),
    messageId: Number(row.message_id),
    conversationId: Number(row.conversation_id),
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    downloadUrl: `/api/messages/attachments/${row.id}`,
    isImage: String(row.mime_type || '').startsWith('image/'),
    isPdf: row.mime_type === 'application/pdf',
  };
}

async function getConversationAccess(pool, conversationId, authUser) {
  const { rows } = await pool.query(`SELECT * FROM conversations WHERE id=$1`, [conversationId]);
  const conv = rows[0];
  if (!conv) return { ok: false, status: 404, message: 'Conversation not found.' };

  const uid = Number(authUser.id);
  const role = authUser.role;
  if (role === 'admin') return { ok: true, conversation: conv };
  if (conv.homeowner_user_id != null && Number(conv.homeowner_user_id) === uid && role === 'homeowner') {
    return { ok: true, conversation: conv };
  }
  if (conv.contractor_user_id != null && Number(conv.contractor_user_id) === uid && role === 'contractor') {
    return { ok: true, conversation: conv };
  }
  return { ok: false, status: 403, message: 'Not allowed.' };
}

async function unreadCountForConversation(pool, conversationId, userId) {
  const { rows: cursor } = await pool.query(
    `SELECT last_read_at FROM conversation_read_cursors WHERE conversation_id=$1 AND user_id=$2`,
    [conversationId, userId],
  );
  const lastRead = cursor[0]?.last_read_at || new Date(0).toISOString();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM messages
     WHERE conversation_id=$1 AND sender_user_id<>$2 AND created_at > $3`,
    [conversationId, userId, lastRead],
  );
  return rows[0]?.count || 0;
}

async function enrichConversation(pool, conv, authUser) {
  let counterpartyName = 'FixBridge Support';
  if (authUser.role === 'admin') {
    const targetId = conv.homeowner_user_id || conv.contractor_user_id;
    if (targetId) {
      const { rows } = await pool.query('SELECT name, email FROM users WHERE id=$1', [targetId]);
      counterpartyName = rows[0]?.name || rows[0]?.email || 'User';
    }
  }

  let jobLabel = null;
  if (conv.job_id) {
    const { rows } = await pool.query(
      'SELECT booking_id, title, category FROM managed_jobs WHERE id=$1',
      [conv.job_id],
    );
    if (rows[0]) {
      jobLabel = rows[0].booking_id || `FB-${conv.job_id}`;
      if (!conv.subject) counterpartyName = counterpartyName;
    }
  }

  const { rows: lastMsg } = await pool.query(
    `SELECT body, created_at FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [conv.id],
  );

  const unreadCount = await unreadCountForConversation(pool, conv.id, authUser.id);

  return rowToConversation(conv, {
    unreadCount,
    lastMessagePreview: lastMsg[0]?.body ? clampString(lastMsg[0].body, 120) : null,
    lastMessageAt: lastMsg[0]?.created_at || null,
    counterpartyName,
    jobLabel,
  });
}

function validateAttachment(att) {
  if (!att || typeof att !== 'object') return { ok: false, message: 'Invalid attachment.' };
  const mime = String(att.mimeType || att.mime || '').toLowerCase();
  if (!ALLOWED_MIME.has(mime)) return { ok: false, message: 'File type not allowed.' };
  let data = String(att.data || att.storageData || '');
  if (data.startsWith('data:')) {
    const m = data.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return { ok: false, message: 'Invalid attachment encoding.' };
    data = m[2];
  }
  const bufLen = Buffer.byteLength(data, 'base64');
  if (bufLen > MAX_ATTACHMENT_BYTES) return { ok: false, message: `Max attachment size is ${Math.round(MAX_ATTACHMENT_BYTES / 1_000_000 * 10) / 10}MB.` };
  return {
    ok: true,
    mime,
    data,
    fileName: safeFileName(att.fileName || att.name),
    byteSize: bufLen,
  };
}

export function registerMessagingRoutes(app, { pool, requireAuth, requireAdmin }) {
  app.get('/api/messages/unread-count', requireAuth, async (req, res) => {
    try {
      const uid = Number(req.authUser.id);
      const role = req.authUser.role;
      let convRows = [];
      if (role === 'admin') {
        const { rows } = await pool.query(
          `SELECT id FROM conversations WHERE type IN ('homeowner_admin','contractor_admin')`,
        );
        convRows = rows;
      } else if (role === 'homeowner') {
        const { rows } = await pool.query(
          `SELECT id FROM conversations WHERE homeowner_user_id=$1`,
          [uid],
        );
        convRows = rows;
      } else if (role === 'contractor') {
        const { rows } = await pool.query(
          `SELECT id FROM conversations WHERE contractor_user_id=$1`,
          [uid],
        );
        convRows = rows;
      }

      let total = 0;
      for (const c of convRows) {
        total += await unreadCountForConversation(pool, c.id, uid);
      }
      return res.json({ ok: true, count: total });
    } catch (e) {
      console.error('messages unread-count:', e);
      return res.status(500).json({ ok: false, message: 'Could not load message count.' });
    }
  });

  app.get('/api/messages/conversations', requireAuth, async (req, res) => {
    try {
      const uid = Number(req.authUser.id);
      const role = req.authUser.role;
      const filter = String(req.query.filter || 'all');
      const search = String(req.query.search || '').trim().toLowerCase();

      let sql = '';
      const params = [];
      if (role === 'admin') {
        sql = `SELECT * FROM conversations WHERE type IN ('homeowner_admin','contractor_admin')`;
        if (filter === 'homeowners') sql += ` AND type='homeowner_admin'`;
        if (filter === 'contractors') sql += ` AND type='contractor_admin'`;
        if (filter === 'job') sql += ` AND job_id IS NOT NULL`;
      } else if (role === 'homeowner') {
        params.push(uid);
        sql = `SELECT * FROM conversations WHERE homeowner_user_id=$1`;
      } else if (role === 'contractor') {
        params.push(uid);
        sql = `SELECT * FROM conversations WHERE contractor_user_id=$1`;
      } else {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }

      sql += ` ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 100`;
      const { rows } = await pool.query(sql, params);
      let conversations = [];
      for (const conv of rows) {
        const enriched = await enrichConversation(pool, conv, req.authUser);
        if (filter === 'unread' && enriched.unreadCount === 0) continue;
        if (search) {
          const hay = `${enriched.subject || ''} ${enriched.counterpartyName || ''} ${enriched.jobLabel || ''} ${enriched.lastMessagePreview || ''}`.toLowerCase();
          if (!hay.includes(search)) continue;
        }
        conversations.push(enriched);
      }
      return res.json({ ok: true, conversations });
    } catch (e) {
      console.error('list conversations:', e);
      return res.status(500).json({ ok: false, message: 'Could not load conversations.' });
    }
  });

  app.post('/api/messages/conversations', requireAuth, async (req, res) => {
    try {
      const role = req.authUser.role;
      const subject = clampString(stripHtml(req.body?.subject), 200) || null;
      const jobId = req.body?.jobId != null ? Number(req.body.jobId) : null;
      const initialBody = stripHtml(req.body?.body);
      const targetHomeownerId = req.body?.homeownerUserId != null ? Number(req.body.homeownerUserId) : null;
      const targetContractorId = req.body?.contractorUserId != null ? Number(req.body.contractorUserId) : null;

      let type = null;
      let homeownerUserId = null;
      let contractorUserId = null;

      if (role === 'homeowner') {
        type = 'homeowner_admin';
        homeownerUserId = Number(req.authUser.id);
      } else if (role === 'contractor') {
        type = 'contractor_admin';
        contractorUserId = Number(req.authUser.id);
      } else if (role === 'admin') {
        if (targetHomeownerId) {
          type = 'homeowner_admin';
          homeownerUserId = targetHomeownerId;
        } else if (targetContractorId) {
          type = 'contractor_admin';
          contractorUserId = targetContractorId;
        } else {
          return res.status(400).json({ ok: false, message: 'homeownerUserId or contractorUserId required.' });
        }
      } else {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }

      // Reuse existing job-linked conversation when possible
      if (jobId) {
        const reuseParams = [type, jobId];
        let reuseSql = `SELECT * FROM conversations WHERE type=$1 AND job_id=$2 AND status != 'archived'`;
        if (type === 'homeowner_admin' && homeownerUserId) {
          reuseSql += ` AND homeowner_user_id=$3`;
          reuseParams.push(homeownerUserId);
        } else if (type === 'contractor_admin' && contractorUserId) {
          reuseSql += ` AND contractor_user_id=$3`;
          reuseParams.push(contractorUserId);
        }
        reuseSql += ` ORDER BY updated_at DESC NULLS LAST LIMIT 1`;
        const { rows: existing } = await pool.query(reuseSql, reuseParams);
        if (existing[0]) {
          const conv = existing[0];
          if (initialBody) {
            await sendMessageInternal(pool, {
              conversation: conv,
              authUser: req.authUser,
              body: initialBody,
              attachments: req.body?.attachments || [],
            });
          }
          const enriched = await enrichConversation(pool, conv, req.authUser);
          return res.json({ ok: true, conversation: enriched, reused: true });
        }
      }

      const { rows } = await pool.query(
        `INSERT INTO conversations (type, homeowner_user_id, contractor_user_id, job_id, subject, status, updated_at)
         VALUES ($1,$2,$3,$4,$5,'open',NOW())
         RETURNING *`,
        [type, homeownerUserId, contractorUserId, jobId, subject],
      );
      const conv = rows[0];

      if (initialBody) {
        await sendMessageInternal(pool, {
          conversation: conv,
          authUser: req.authUser,
          body: initialBody,
          attachments: req.body?.attachments || [],
        });
      }

      const enriched = await enrichConversation(pool, conv, req.authUser);
      return res.json({ ok: true, conversation: enriched });
    } catch (e) {
      console.error('create conversation:', e);
      return res.status(500).json({ ok: false, message: e.message || 'Could not create conversation.' });
    }
  });

  app.get('/api/messages/conversations/:id', requireAuth, async (req, res) => {
    try {
      const conversationId = Number(req.params.id);
      const access = await getConversationAccess(pool, conversationId, req.authUser);
      if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });

      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const beforeId = req.query.beforeId != null ? Number(req.query.beforeId) : null;

      let msgSql = `SELECT * FROM messages WHERE conversation_id=$1`;
      const params = [conversationId];
      if (beforeId) {
        msgSql += ` AND id < $2`;
        params.push(beforeId);
      }
      msgSql += ` ORDER BY created_at DESC LIMIT ${limit}`;

      const { rows: msgRows } = await pool.query(msgSql, params);
      const messages = [];
      for (const m of msgRows.reverse()) {
        const { rows: atts } = await pool.query(
          `SELECT * FROM message_attachments WHERE message_id=$1 ORDER BY id ASC`,
          [m.id],
        );
        messages.push(rowToMessage(m, atts.map(rowToAttachment)));
      }

      const enriched = await enrichConversation(pool, access.conversation, req.authUser);
      return res.json({ ok: true, conversation: enriched, messages });
    } catch (e) {
      console.error('get conversation:', e);
      return res.status(500).json({ ok: false, message: 'Could not load conversation.' });
    }
  });

  app.post('/api/messages/conversations/:id/messages', requireAuth, async (req, res) => {
    try {
      if (!checkRateLimit(req.authUser.id)) {
        return res.status(429).json({ ok: false, message: 'Too many messages. Please wait a moment.' });
      }
      const conversationId = Number(req.params.id);
      const access = await getConversationAccess(pool, conversationId, req.authUser);
      if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });

      const message = await sendMessageInternal(pool, {
        conversation: access.conversation,
        authUser: req.authUser,
        body: stripHtml(req.body?.body),
        attachments: req.body?.attachments || [],
        idempotencyKey: req.body?.idempotencyKey || null,
      });
      return res.json({ ok: true, message });
    } catch (e) {
      console.error('send message:', e);
      return res.status(400).json({ ok: false, message: e.message || 'Could not send message.' });
    }
  });

  app.post('/api/messages/conversations/:id/read', requireAuth, async (req, res) => {
    try {
      const conversationId = Number(req.params.id);
      const access = await getConversationAccess(pool, conversationId, req.authUser);
      if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });

      await pool.query(
        `INSERT INTO conversation_read_cursors (conversation_id, user_id, last_read_at)
         VALUES ($1,$2,NOW())
         ON CONFLICT (conversation_id, user_id)
         DO UPDATE SET last_read_at=NOW()`,
        [conversationId, req.authUser.id],
      );
      return res.json({ ok: true });
    } catch (e) {
      console.error('mark conversation read:', e);
      return res.status(500).json({ ok: false, message: 'Could not mark conversation read.' });
    }
  });

  app.get('/api/messages/attachments/:id', requireAuth, async (req, res) => {
    try {
      const attId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM message_attachments WHERE id=$1`, [attId]);
      const att = rows[0];
      if (!att) return res.status(404).json({ ok: false, message: 'Not found.' });

      const access = await getConversationAccess(pool, att.conversation_id, req.authUser);
      if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });

      const loaded = await getAttachment(pool, {
        id: att.id,
        namespace: 'message',
        storageProvider: att.storage_provider,
        storageKey: att.storage_key,
        storageData: att.storage_data,
      });
      if (!loaded.ok) return res.status(404).json({ ok: false, message: 'Not found.' });
      res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${safeFileName(att.file_name)}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.send(loaded.data);
    } catch (e) {
      console.error('download attachment:', e);
      return res.status(500).json({ ok: false, message: 'Could not load attachment.' });
    }
  });
}

async function sendMessageInternal(pool, { conversation, authUser, body, attachments = [], idempotencyKey = null }) {
  const text = stripHtml(body);
  const atts = Array.isArray(attachments) ? attachments : [];
  if (!text && atts.length === 0) throw new Error('Message body or attachment required.');
  if (text.length > MAX_BODY_LEN) throw new Error('Message too long.');
  if (atts.length > MAX_ATTACHMENTS_PER_MESSAGE) throw new Error(`Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message.`);

  if (idempotencyKey) {
    const { rows: dup } = await pool.query(
      `SELECT m.* FROM messages m
       JOIN conversations c ON c.id=m.conversation_id
       WHERE m.sender_user_id=$1 AND m.body=$2 AND m.created_at > NOW() - INTERVAL '30 seconds'
       ORDER BY m.id DESC LIMIT 1`,
      [authUser.id, text],
    );
    if (dup[0]) return rowToMessage(dup[0], []);
  }

  const role = authUser.role;
  let senderDisplay = authUser.name || authUser.email || 'User';
  let sentByAdminUserId = null;
  if (role === 'admin') {
    senderDisplay = adminDisplayName();
    sentByAdminUserId = Number(authUser.id);
  }

  const { rows } = await pool.query(
    `INSERT INTO messages (conversation_id, sender_user_id, sender_role, sender_display_name, sent_by_admin_user_id, body)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [conversation.id, authUser.id, role, senderDisplay, sentByAdminUserId, text || '(attachment)'],
  );
  const message = rows[0];

  const savedAttachments = [];
  for (const raw of atts) {
    const check = validateAttachment(raw);
    if (!check.ok) throw new Error(check.message);
    const saved = await saveAttachment(pool, {
      namespace: 'message',
      entityId: message.id,
      fileName: check.fileName,
      mimeType: check.mime,
      data: check.data,
      uploaderUserId: authUser.id,
    });
    if (!saved.ok) throw new Error(saved.message || 'Attachment rejected.');
    const { rows: attRows } = await pool.query(
      `INSERT INTO message_attachments
        (message_id, conversation_id, uploader_user_id, file_name, mime_type, byte_size, storage_data, storage_provider, storage_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        message.id,
        conversation.id,
        authUser.id,
        saved.fileName,
        saved.mimeType,
        saved.sizeBytes,
        saved.storageData || check.data,
        saved.provider,
        saved.storageKey,
      ],
    );
    savedAttachments.push(rowToAttachment(attRows[0]));
  }

  await pool.query(`UPDATE conversations SET updated_at=NOW() WHERE id=$1`, [conversation.id]);

  // Notify recipient(s)
  const preview = clampString(text || 'Sent an attachment', 120);
  if (role === 'admin') {
    const recipientId = conversation.homeowner_user_id || conversation.contractor_user_id;
    if (recipientId) {
      await createInAppNotification(pool, {
        userId: recipientId,
        userRole: conversation.homeowner_user_id ? 'homeowner' : 'contractor',
        jobId: conversation.job_id,
        type: 'admin_message',
        title: 'New message from FixBridge Support',
        message: preview,
        entityType: 'conversation',
        entityId: conversation.id,
        actionUrl: `/messages?conversation=${conversation.id}`,
      });
    }
  } else {
    const notifType = role === 'homeowner' ? 'homeowner_message' : 'contractor_message';
    const notifTitle = role === 'homeowner' ? 'New homeowner message' : 'New contractor message';
    await notifyAdmins(pool, {
      type: notifType,
      title: notifTitle,
      message: `${senderDisplay}: ${preview}`,
      jobId: conversation.job_id,
      entityType: 'conversation',
      entityId: conversation.id,
      actionUrl: `/admin?tab=communications&conversation=${conversation.id}`,
    });
  }

  return rowToMessage(message, savedAttachments);
}
