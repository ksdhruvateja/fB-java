function clean(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeTags(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(source.map((tag) => clean(tag, 40).toLowerCase()).filter(Boolean))].slice(0, 20);
}

export function normalizeKnowledgeEntry(input = {}) {
  const title = clean(input.title, 160);
  const category = clean(input.category || 'general', 80).toLowerCase();
  const content = clean(input.content, 12000);
  const status = ['draft', 'active', 'archived'].includes(input.status) ? input.status : 'draft';
  if (!title || !content) {
    throw Object.assign(new Error('A title and knowledge content are required.'), { code: 'KNOWLEDGE_CONTENT_REQUIRED' });
  }
  return {
    title,
    category,
    content,
    tags: normalizeTags(input.tags),
    source: clean(input.source, 240) || null,
    status,
  };
}

export async function writeKnowledgeEntry(pool, input, actorUserId) {
  const entry = normalizeKnowledgeEntry(input);
  const id = Number(input.id);
  if (Number.isInteger(id) && id > 0) {
    const { rows } = await pool.query(
      `UPDATE fixera_knowledge_entries
          SET title=$1, category=$2, content=$3, tags=$4::jsonb, source=$5,
              status=$6, updated_by_user_id=$7, updated_at=NOW()
        WHERE id=$8
        RETURNING id, title, category, content, tags, source, status, created_at, updated_at`,
      [entry.title, entry.category, entry.content, JSON.stringify(entry.tags), entry.source, entry.status, actorUserId, id]
    );
    if (!rows[0]) throw Object.assign(new Error('Knowledge entry not found.'), { code: 'KNOWLEDGE_ENTRY_NOT_FOUND' });
    return rows[0];
  }
  const { rows } = await pool.query(
    `INSERT INTO fixera_knowledge_entries
       (title, category, content, tags, source, status, created_by_user_id, updated_by_user_id)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$7)
     RETURNING id, title, category, content, tags, source, status, created_at, updated_at`,
    [entry.title, entry.category, entry.content, JSON.stringify(entry.tags), entry.source, entry.status, actorUserId]
  );
  return rows[0];
}

export async function listKnowledgeEntries(pool) {
  const { rows } = await pool.query(
    `SELECT id, title, category, content, tags, source, status, created_at, updated_at
       FROM fixera_knowledge_entries
      ORDER BY updated_at DESC, id DESC
      LIMIT 200`
  );
  return rows;
}

export async function retrieveGlobalKnowledge(pool, { category = '', query = '', limit = 5 } = {}) {
  if (!pool) return { items: [], references: [] };
  const normalizedCategory = clean(category, 80).toLowerCase();
  const normalizedQuery = clean(query, 500);
  const safeLimit = Math.min(8, Math.max(1, Number(limit) || 5));
  const { rows } = await pool.query(
    `SELECT id, title, category, content, tags, source
       FROM fixera_knowledge_entries
      WHERE status='active'
        AND ($1='' OR category='general' OR lower(category)=lower($1))
        AND ($2='' OR to_tsvector('english', concat_ws(' ', title, content, tags::text)) @@ plainto_tsquery('english', $2))
      ORDER BY CASE WHEN lower(category)=lower($1) THEN 0 ELSE 1 END, updated_at DESC
      LIMIT $3`,
    [normalizedCategory, normalizedQuery, safeLimit]
  );
  return {
    items: rows.map((row) => `${row.title}: ${row.content}`),
    references: rows.map((row) => ({ id: Number(row.id), title: row.title, category: row.category })),
  };
}