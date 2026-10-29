/** Shared immutable audit trail writer. */
export async function writeAudit(pool, actorUserId, action, entityType, entityId, detail) {
  await pool.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, detail)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      actorUserId || null,
      action,
      entityType || null,
      entityId != null ? String(entityId) : null,
      JSON.stringify(detail || {}),
    ]
  );
}
