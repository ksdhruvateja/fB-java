/**
 * Contractor employee / field team CRUD routes.
 */
import {
  assertEmployeeAssignable,
  normalizeContactList,
  serializeEmployee,
  validateEmployeePhoto,
} from './contractor-employees.js';

export function registerContractorEmployeeRoutes(app, { pool, requireAuth, requireAdmin }) {
  app.get('/api/contractor/employees', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor' && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const contractorUserId =
        req.authUser.role === 'admin' && req.query.contractorUserId
          ? Number(req.query.contractorUserId)
          : Number(req.authUser.id);
      const { rows } = await pool.query(
        `SELECT * FROM contractor_employees
         WHERE contractor_user_id=$1
         ORDER BY active DESC, full_name ASC`,
        [contractorUserId]
      );
      res.json({
        ok: true,
        employees: rows.map((r) => serializeEmployee(r, { includeInternal: true })),
      });
    } catch (e) {
      console.error('list employees:', e);
      res.status(500).json({ ok: false, message: 'Could not load team.' });
    }
  });

  app.post('/api/contractor/employees', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Contractors only.' });
      }
      const fullName = String(req.body?.fullName || req.body?.name || '').trim();
      if (!fullName) return res.status(400).json({ ok: false, message: 'Full name is required.' });
      const photoCheck = validateEmployeePhoto(req.body?.photoData, req.body?.photoMime);
      if (!photoCheck.ok) return res.status(400).json({ ok: false, message: photoCheck.message });
      const phones = normalizeContactList(req.body?.phones, 'phone');
      const emails = normalizeContactList(req.body?.emails, 'email');
      const { rows } = await pool.query(
        `INSERT INTO contractor_employees
          (contractor_user_id, full_name, job_title, bio, trade, years_experience, employee_ref,
           photo_data, photo_mime, customer_description, internal_notes, phones, emails, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          req.authUser.id,
          fullName,
          String(req.body?.jobTitle || '').trim() || null,
          String(req.body?.bio || '').trim() || null,
          String(req.body?.trade || '').trim() || null,
          req.body?.yearsExperience != null ? Number(req.body.yearsExperience) : null,
          String(req.body?.employeeRef || '').trim() || null,
          photoCheck.photoData,
          photoCheck.photoMime,
          String(req.body?.customerDescription || '').trim() || null,
          String(req.body?.internalNotes || '').trim() || null,
          JSON.stringify(phones),
          JSON.stringify(emails),
          req.body?.active !== false,
        ]
      );
      res.json({ ok: true, employee: serializeEmployee(rows[0], { includeInternal: true }) });
    } catch (e) {
      console.error('create employee:', e);
      res.status(500).json({ ok: false, message: 'Could not create employee.' });
    }
  });

  app.put('/api/contractor/employees/:id', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Contractors only.' });
      }
      const id = Number(req.params.id);
      const { rows: existing } = await pool.query(
        `SELECT * FROM contractor_employees WHERE id=$1 AND contractor_user_id=$2`,
        [id, req.authUser.id]
      );
      if (!existing[0]) return res.status(404).json({ ok: false, message: 'Employee not found.' });
      const fullName = String(req.body?.fullName || req.body?.name || existing[0].full_name).trim();
      const photoCheck =
        req.body?.photoData != null
          ? validateEmployeePhoto(req.body.photoData, req.body.photoMime)
          : { ok: true, photoData: existing[0].photo_data, photoMime: existing[0].photo_mime };
      if (!photoCheck.ok) return res.status(400).json({ ok: false, message: photoCheck.message });
      const phones =
        req.body?.phones != null
          ? normalizeContactList(req.body.phones, 'phone')
          : normalizeContactList(JSON.parse(existing[0].phones || '[]'), 'phone');
      const emails =
        req.body?.emails != null
          ? normalizeContactList(req.body.emails, 'email')
          : normalizeContactList(JSON.parse(existing[0].emails || '[]'), 'email');
      const { rows } = await pool.query(
        `UPDATE contractor_employees SET
           full_name=$1,
           job_title=$2,
           bio=$3,
           trade=$4,
           years_experience=$5,
           employee_ref=$6,
           photo_data=$7,
           photo_mime=$8,
           customer_description=$9,
           internal_notes=$10,
           phones=$11,
           emails=$12,
           active=$13,
           updated_at=NOW()
         WHERE id=$14 AND contractor_user_id=$15
         RETURNING *`,
        [
          fullName,
          String(req.body?.jobTitle ?? existing[0].job_title ?? '').trim() || null,
          String(req.body?.bio ?? existing[0].bio ?? '').trim() || null,
          String(req.body?.trade ?? existing[0].trade ?? '').trim() || null,
          req.body?.yearsExperience != null
            ? Number(req.body.yearsExperience)
            : existing[0].years_experience,
          String(req.body?.employeeRef ?? existing[0].employee_ref ?? '').trim() || null,
          photoCheck.photoData,
          photoCheck.photoMime,
          String(req.body?.customerDescription ?? existing[0].customer_description ?? '').trim() || null,
          String(req.body?.internalNotes ?? existing[0].internal_notes ?? '').trim() || null,
          JSON.stringify(phones),
          JSON.stringify(emails),
          req.body?.active != null ? req.body.active !== false : existing[0].active !== false,
          id,
          req.authUser.id,
        ]
      );
      res.json({ ok: true, employee: serializeEmployee(rows[0], { includeInternal: true }) });
    } catch (e) {
      console.error('update employee:', e);
      res.status(500).json({ ok: false, message: 'Could not update employee.' });
    }
  });

  app.get('/api/contractor/employees/:id/photo', requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM contractor_employees WHERE id=$1`, [id]);
      if (!rows[0]?.photo_data) return res.status(404).end();
      const isOwner = Number(rows[0].contractor_user_id) === Number(req.authUser.id);
      const isAdmin = req.authUser.role === 'admin';
      const isHomeowner = req.authUser.role === 'homeowner';
      if (!isOwner && !isAdmin && !isHomeowner) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      if (isHomeowner) {
        const { rows: jobs } = await pool.query(
          `SELECT id FROM managed_jobs
           WHERE homeowner_user_id=$1 AND assigned_employee_id=$2
           LIMIT 1`,
          [req.authUser.id, id]
        );
        if (!jobs[0]) return res.status(404).end();
      }
      const mime = rows[0].photo_mime || 'image/jpeg';
      const buf = Buffer.from(rows[0].photo_data, 'base64');
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(buf);
    } catch (e) {
      res.status(500).end();
    }
  });

  app.get('/api/admin/contractors/:contractorId/employees', requireAuth, requireAdmin, async (req, res) => {
    try {
      const contractorId = Number(req.params.contractorId);
      const { rows } = await pool.query(
        `SELECT * FROM contractor_employees
         WHERE contractor_user_id=$1
         ORDER BY active DESC, full_name ASC`,
        [contractorId]
      );
      res.json({
        ok: true,
        employees: rows.map((r) => serializeEmployee(r, { includeInternal: true })),
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load contractor team.' });
    }
  });

  app.get('/api/contractor/employees/:id', requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM contractor_employees WHERE id=$1`, [id]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const isOwner = Number(rows[0].contractor_user_id) === Number(req.authUser.id);
      const isAdmin = req.authUser.role === 'admin';
      if (!isOwner && !isAdmin) return res.status(403).json({ ok: false, message: 'Not allowed.' });
      res.json({
        ok: true,
        employee: serializeEmployee(rows[0], { includeInternal: isOwner || isAdmin }),
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error.' });
    }
  });

  return { assertEmployeeAssignable };
}
