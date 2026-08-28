/**
 * Unified Home Assistant + Property Timeline APIs.
 */
import { chatWithCustomer } from './ai.js';
import { createRequireHomeCareFeature, resolveFeatureEntitlement } from './homecare-config.js';
import { buildHomeAssistantContext } from './property-ai-context.js';
import { buildPropertyTimeline } from './property-timeline.js';
import { assertPropertyAccess } from './property-access.js';
import { mergeEquipmentRecord, appendMemoryAudit } from './property-memory.js';

function enforceSingleQuestion(reply, riskLevel) {
  const text = String(reply || '').trim();
  if (!text) return text;
  if (riskLevel === 'EMERGENCY' || riskLevel === 'HIGH') return text;

  const parts = text.split(/(?<=[.!?])\s+/);
  let questionIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].includes('?')) {
      questionIdx = i;
      break;
    }
  }
  if (questionIdx < 0) return text;

  const before = parts.slice(0, questionIdx).join(' ').trim();
  const question = parts[questionIdx].trim();
  if (!before) return question;
  return `${before}\n\n${question}`;
}

export function registerHomeAssistantRoutes(app, { pool, requireAuth }) {
  const requirePropertyAware = createRequireHomeCareFeature(pool);

  app.get('/api/properties/:id/timeline', requireAuth, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      const timeline = await buildPropertyTimeline(pool, propertyId, req.authUser.id);
      if (!timeline) return res.status(404).json({ ok: false, message: 'Property not found.' });
      res.json({ ok: true, ...timeline });
    } catch (e) {
      console.error('property timeline:', e);
      res.status(500).json({ ok: false, message: 'Could not load property timeline.' });
    }
  });

  app.post('/api/home-assistant/chat', requireAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const messages = Array.isArray(b.messages) ? b.messages : [];
      const propertyId = b.propertyId != null ? Number(b.propertyId) : null;
      const jobId = b.jobId != null ? Number(b.jobId) : null;
      const intent = b.intent ? String(b.intent).slice(0, 80) : null;

      if (propertyId) {
        const gate = await resolveFeatureEntitlement(pool, {
          user: req.authUser,
          feature: 'property_aware_ai',
        });
        if (!gate.allowed) {
          return res.status(403).json({
            ok: false,
            code: gate.reason,
            feature: 'property_aware_ai',
            message: gate.message,
          });
        }
        const access = await assertPropertyAccess(pool, propertyId, req.authUser.id);
        if (!access) return res.status(404).json({ ok: false, message: 'Property not found.' });
      }

      const lastUser = [...messages].reverse().find((m) => m?.role === 'user');
      const userMessage = lastUser?.content || '';
      const ctx = await buildHomeAssistantContext(pool, {
        userId: req.authUser.id,
        propertyId,
        jobId,
        intent,
        userMessage,
      });

      const systemContent = `${ctx.systemRules}\n\n${ctx.contextText ? `AUTHORIZED CONTEXT:\n${ctx.contextText}` : ''}`;
      const aiMessages = [
        { role: 'system', content: systemContent },
        ...messages
          .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
          .slice(-12)
          .map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 4000) })),
      ];

      const ai = await chatWithCustomer({ messages: aiMessages });
      const reply = enforceSingleQuestion(ai?.reply || 'I could not generate a response. Please try again.', ctx.riskLevel);
      res.json({
        ok: true,
        reply,
        riskLevel: ctx.riskLevel,
        suggestedActions: ctx.suggestedActions,
      });
    } catch (e) {
      console.error('home assistant chat:', e);
      res.status(500).json({ ok: false, message: 'Assistant unavailable.' });
    }
  });

  // Preferred providers
  app.get('/api/properties/:id/preferred-providers', requireAuth, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      if (!(await assertPropertyAccess(pool, propertyId, req.authUser.id))) {
        return res.status(404).json({ ok: false, message: 'Property not found.' });
      }
      const { rows } = await pool.query(
        `SELECT pc.*, u.name, u.company_name, u.trade
         FROM preferred_contractors pc
         JOIN users u ON u.id = pc.contractor_user_id
         WHERE pc.property_id=$1 AND pc.owner_user_id=$2
         ORDER BY pc.service_type, pc.created_at DESC`,
        [propertyId, req.authUser.id]
      );
      res.json({
        ok: true,
        providers: rows.map((r) => ({
          id: Number(r.id),
          propertyId: Number(r.property_id),
          serviceType: r.service_type,
          contractorUserId: Number(r.contractor_user_id),
          name: r.company_name || r.name,
          trade: r.trade,
          isFavorite: r.is_favorite === true,
          notes: r.notes || null,
        })),
      });
    } catch (e) {
      console.error('preferred providers get:', e);
      res.status(500).json({ ok: false, message: 'Could not load preferred providers.' });
    }
  });

  app.post('/api/properties/:id/preferred-providers', requireAuth, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      const b = req.body || {};
      const contractorUserId = Number(b.contractorUserId);
      const serviceType = String(b.serviceType || 'general').slice(0, 60);
      if (!contractorUserId) return res.status(400).json({ ok: false, message: 'contractorUserId required.' });
      if (!(await assertPropertyAccess(pool, propertyId, req.authUser.id))) {
        return res.status(404).json({ ok: false, message: 'Property not found.' });
      }
      const { rows } = await pool.query(
        `INSERT INTO preferred_contractors (owner_user_id, property_id, service_type, contractor_user_id, is_favorite, notes)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (property_id, service_type, contractor_user_id)
         DO UPDATE SET is_favorite=EXCLUDED.is_favorite, notes=EXCLUDED.notes
         RETURNING *`,
        [
          req.authUser.id,
          propertyId,
          serviceType,
          contractorUserId,
          b.isFavorite !== false,
          b.notes ? String(b.notes).slice(0, 300) : null,
        ]
      );
      res.json({ ok: true, provider: { id: Number(rows[0].id), serviceType, contractorUserId } });
    } catch (e) {
      console.error('preferred provider set:', e);
      res.status(500).json({ ok: false, message: 'Could not save preferred provider.' });
    }
  });

  app.delete('/api/properties/:id/preferred-providers/:providerId', requireAuth, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      const providerId = Number(req.params.providerId);
      await pool.query(
        `DELETE FROM preferred_contractors WHERE id=$1 AND property_id=$2 AND owner_user_id=$3`,
        [providerId, propertyId, req.authUser.id]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not remove provider.' });
    }
  });

  // Memory suggestions (AI extraction / job completion)
  app.get('/api/properties/:id/memory-suggestions', requireAuth, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      if (!(await assertPropertyAccess(pool, propertyId, req.authUser.id))) {
        return res.status(404).json({ ok: false, message: 'Property not found.' });
      }
      const { rows } = await pool.query(
        `SELECT * FROM property_memory_suggestions
         WHERE property_id=$1 AND owner_user_id=$2 AND status='pending'
         ORDER BY created_at DESC LIMIT 20`,
        [propertyId, req.authUser.id]
      );
      res.json({
        ok: true,
        suggestions: rows.map((r) => ({
          id: Number(r.id),
          source: r.source,
          sourceRef: r.source_ref,
          payload: r.payload,
          confidence: r.confidence != null ? Number(r.confidence) : null,
          createdAt: r.created_at,
        })),
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load suggestions.' });
    }
  });

  app.post('/api/properties/:id/memory-suggestions/:suggestionId/confirm', requireAuth, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      const suggestionId = Number(req.params.suggestionId);
      const { rows } = await pool.query(
        `SELECT * FROM property_memory_suggestions
         WHERE id=$1 AND property_id=$2 AND owner_user_id=$3 AND status='pending'`,
        [suggestionId, propertyId, req.authUser.id]
      );
      const sug = rows[0];
      if (!sug) return res.status(404).json({ ok: false, message: 'Suggestion not found.' });

      const payload = typeof sug.payload === 'string' ? JSON.parse(sug.payload) : sug.payload;
      const { rows: props } = await pool.query(`SELECT * FROM properties WHERE id=$1`, [propertyId]);
      let homeSystems = [];
      try {
        homeSystems = JSON.parse(props[0].home_systems || '[]');
      } catch {
        homeSystems = [];
      }
      if (!Array.isArray(homeSystems)) homeSystems = [];

      if (payload?.equipment) {
        const eq = payload.equipment;
        const key = String(eq.key || eq.systemKey || 'other_system');
        const idx = homeSystems.findIndex((s) => s && String(s.key) === key);
        const incoming = {
          key,
          name: eq.name || eq.label || key,
          brand: eq.manufacturer || eq.brand || undefined,
          model: eq.model || undefined,
          serialNumber: eq.serial || eq.serialNumber || undefined,
          filterSize: eq.filterSize || undefined,
          installedYear: eq.installationYear || eq.installedYear || undefined,
          notes: eq.notes || undefined,
          source: 'homeowner',
          verification: 'confirmed',
          verifiedBy: 'homeowner',
        };
        const record =
          idx >= 0 ? mergeEquipmentRecord(homeSystems[idx], incoming) : { ...incoming };
        if (idx >= 0) homeSystems[idx] = record;
        else homeSystems.push(record);

        let health = {};
        try {
          health = JSON.parse(props[0].health_profile || '{}');
        } catch {
          health = {};
        }
        health = appendMemoryAudit(health, {
          action: 'confirm_suggestion',
          suggestionId,
          key,
          source: sug.source,
        });
        await pool.query(`UPDATE properties SET home_systems=$1, health_profile=$2 WHERE id=$3`, [
          JSON.stringify(homeSystems),
          JSON.stringify(health),
          propertyId,
        ]);
      } else {
        await pool.query(`UPDATE properties SET home_systems=$1 WHERE id=$2`, [
          JSON.stringify(homeSystems),
          propertyId,
        ]);
      }

      await pool.query(
        `UPDATE property_memory_suggestions SET status='confirmed', resolved_at=NOW() WHERE id=$1`,
        [suggestionId]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error('confirm memory suggestion:', e);
      res.status(500).json({ ok: false, message: 'Could not apply suggestion.' });
    }
  });

  app.post('/api/properties/:id/memory-suggestions/:suggestionId/ignore', requireAuth, async (req, res) => {
    try {
      await pool.query(
        `UPDATE property_memory_suggestions SET status='ignored', resolved_at=NOW()
         WHERE id=$1 AND property_id=$2 AND owner_user_id=$3`,
        [Number(req.params.suggestionId), Number(req.params.id), req.authUser.id]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not ignore suggestion.' });
    }
  });
}

export async function initPropertyMemorySchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS preferred_contractors (
      id                  SERIAL PRIMARY KEY,
      owner_user_id       INT NOT NULL,
      property_id         INT NOT NULL,
      service_type        TEXT NOT NULL,
      contractor_user_id  INT NOT NULL,
      is_favorite         BOOLEAN DEFAULT TRUE,
      notes               TEXT,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(property_id, service_type, contractor_user_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS property_memory_suggestions (
      id              BIGSERIAL PRIMARY KEY,
      property_id     INT NOT NULL,
      owner_user_id   INT NOT NULL,
      source          TEXT NOT NULL,
      source_ref      TEXT,
      status          TEXT NOT NULL DEFAULT 'pending',
      payload         JSONB NOT NULL,
      confidence      NUMERIC,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      resolved_at     TIMESTAMPTZ
    )
  `);
  await pool.query(`ALTER TABLE recurring_services ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb`);
  await pool.query(
    `ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS source_recurring_service_id INT REFERENCES recurring_services(id) ON DELETE SET NULL`
  );
  await pool.query(
    `ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS preferred_contractor_user_id INT REFERENCES users(id) ON DELETE SET NULL`
  );
}
