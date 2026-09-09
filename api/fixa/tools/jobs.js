/** Narrow job lookup. No arbitrary SQL from the model. */

export async function getJobForActor(pool, { jobId, actorId, role }) {
  const id = Number(jobId);
  if (!pool || !id) return null;
  const { rows } = await pool.query(
    `SELECT id, homeowner_user_id, property_id, category, description, diy_risk_level, ai_assessment, status
     FROM managed_jobs WHERE id=$1`,
    [id]
  );
  const job = rows[0];
  if (!job) return null;
  if (role === 'homeowner' && Number(job.homeowner_user_id) !== Number(actorId)) return null;
  return {
    id: job.id,
    homeownerId: job.homeowner_user_id,
    propertyId: job.property_id,
    category: job.category,
    description: job.description,
    diyRiskLevel: job.diy_risk_level,
    status: job.status,
    aiAssessment: typeof job.ai_assessment === 'string' ? JSON.parse(job.ai_assessment) : job.ai_assessment,
  };
}
