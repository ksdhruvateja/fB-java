import assert from 'node:assert/strict';
import test from 'node:test';
import { listKnowledgeEntries, normalizeKnowledgeEntry, retrieveGlobalKnowledge, writeKnowledgeEntry } from './knowledgeWriter.js';

test('global knowledge is draft by default and only active reviewed entries are retrieved', async () => {
  const normalized = normalizeKnowledgeEntry({
    title: 'Refrigerator airflow checks',
    category: 'appliances',
    content: 'Check external ventilation clearance before recommending component replacement.',
    tags: ['refrigerator', 'Cooling', 'refrigerator'],
    homeownerUserId: 123,
    propertyId: 456,
  });
  assert.equal(normalized.status, 'draft');
  assert.deepEqual(normalized.tags, ['refrigerator', 'cooling']);
  assert.equal('propertyId' in normalized, false);

  const calls = [];
  const pool = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT id, title, category, content, tags, source/.test(sql)) {
        return { rows: [{ id: 4, title: 'Airflow clearance', category: 'appliances', content: 'Keep vents clear.', tags: ['refrigerator'], source: 'Reviewed service guidance' }] };
      }
      if (/INSERT INTO fixera_knowledge_entries/.test(sql)) {
        return { rows: [{ id: 4, ...normalized, created_at: '2026-09-30T00:00:00Z' }] };
      }
      return { rows: [] };
    },
  };

  const entry = await writeKnowledgeEntry(pool, { ...normalized, status: 'active' }, 9);
  const retrieved = await retrieveGlobalKnowledge(pool, { category: 'appliances', query: 'refrigerator cooling', limit: 5 });
  const listed = await listKnowledgeEntries(pool);

  assert.equal(entry.id, 4);
  assert.match(calls[1].sql, /status='active'/);
  assert.match(calls[1].sql, /plainto_tsquery/);
  assert.deepEqual(calls[1].params, ['appliances', 'refrigerator cooling', 5]);
  assert.equal(retrieved.items[0], 'Airflow clearance: Keep vents clear.');
  assert.deepEqual(retrieved.references, [{ id: 4, title: 'Airflow clearance', category: 'appliances' }]);
  assert.equal(listed.length, 1);
});

test('global knowledge rejects empty content', () => {
  assert.throws(() => normalizeKnowledgeEntry({ title: 'No body' }), /title and knowledge content are required/);
});