/** Property access — owner or household member only. */

export async function assertPropertyAccess(pool, propertyId, userId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.owner_user_id FROM properties p
     LEFT JOIN household_memberships hm ON hm.property_id = p.id AND hm.user_id = $2
     WHERE p.id = $1 AND (p.owner_user_id = $2 OR hm.id IS NOT NULL)`,
    [propertyId, userId]
  );
  return rows[0] || null;
}

export async function assertPropertyOwner(pool, propertyId, userId) {
  const { rows } = await pool.query(`SELECT id FROM properties WHERE id=$1 AND owner_user_id=$2`, [
    propertyId,
    userId,
  ]);
  return Boolean(rows[0]);
}
