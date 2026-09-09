/**
 * Server-side contractor and employee availability.
 */

const DEFAULT_WORKING_DAYS = {
  mon: { enabled: true, start: '08:00', end: '17:00' },
  tue: { enabled: true, start: '08:00', end: '17:00' },
  wed: { enabled: true, start: '08:00', end: '17:00' },
  thu: { enabled: true, start: '08:00', end: '17:00' },
  fri: { enabled: true, start: '08:00', end: '17:00' },
  sat: { enabled: false, start: '09:00', end: '13:00' },
  sun: { enabled: false, start: '09:00', end: '13:00' },
};

function parseJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function dayKey(date = new Date()) {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getDay()];
}

function formatAvailabilitySummary(row, assignedJobs = 0) {
  if (!row) return { label: 'No schedule set', availableToday: false, assignedJobs };
  const days = parseJson(row.working_days, DEFAULT_WORKING_DAYS);
  const today = dayKey();
  const todayCfg = days[today] || { enabled: false };
  const availableToday = todayCfg.enabled && !row.temporary_unavailable;
  let label = availableToday ? 'Available today' : 'Not available today';
  if (todayCfg.enabled && todayCfg.start && todayCfg.end) {
    label = `Available ${todayCfg.start}–${todayCfg.end}`;
  }
  if (row.same_day_available) label += ' · same-day OK';
  if (row.emergency_available) label += ' · emergency';
  return { label, availableToday, assignedJobs, timezone: row.timezone || 'America/New_York' };
}

export async function initAvailabilitySchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contractor_availability (
      contractor_user_id INT PRIMARY KEY,
      timezone TEXT DEFAULT 'America/New_York',
      working_days JSONB DEFAULT '{}',
      same_day_available BOOLEAN DEFAULT false,
      emergency_available BOOLEAN DEFAULT false,
      max_jobs_per_day INT,
      temporary_unavailable BOOLEAN DEFAULT false,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_availability (
      employee_id INT PRIMARY KEY,
      contractor_user_id INT NOT NULL,
      working_hours JSONB,
      unavailable_dates JSONB DEFAULT '[]',
      temporary_unavailable BOOLEAN DEFAULT false,
      service_areas JSONB DEFAULT '[]',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS availability_exceptions (
      id SERIAL PRIMARY KEY,
      contractor_user_id INT,
      employee_id INT,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      reason TEXT,
      created_by INT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

export function registerAvailabilityRoutes(app, { pool, requireAuth, requireAdmin }) {
  app.get('/api/contractor/availability', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor' && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const contractorUserId =
        req.authUser.role === 'admin' && req.query.contractorUserId
          ? Number(req.query.contractorUserId)
          : Number(req.authUser.id);
      const { rows } = await pool.query(`SELECT * FROM contractor_availability WHERE contractor_user_id=$1`, [
        contractorUserId,
      ]);
      const row = rows[0] || {
        contractor_user_id: contractorUserId,
        timezone: 'America/New_York',
        working_days: DEFAULT_WORKING_DAYS,
        same_day_available: false,
        emergency_available: false,
        max_jobs_per_day: null,
        temporary_unavailable: false,
      };
      return res.json({
        ok: true,
        availability: {
          contractorUserId,
          timezone: row.timezone,
          workingDays: parseJson(row.working_days, DEFAULT_WORKING_DAYS),
          sameDayAvailable: row.same_day_available === true,
          emergencyAvailable: row.emergency_available === true,
          maxJobsPerDay: row.max_jobs_per_day,
          temporaryUnavailable: row.temporary_unavailable === true,
        },
      });
    } catch (e) {
      return res.status(500).json({ ok: false, message: 'Could not load availability.' });
    }
  });

  app.put('/api/contractor/availability', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const uid = Number(req.authUser.id);
      const workingDays = req.body?.workingDays || DEFAULT_WORKING_DAYS;
      await pool.query(
        `INSERT INTO contractor_availability
           (contractor_user_id, timezone, working_days, same_day_available, emergency_available, max_jobs_per_day, temporary_unavailable, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
         ON CONFLICT (contractor_user_id) DO UPDATE SET
           timezone=EXCLUDED.timezone,
           working_days=EXCLUDED.working_days,
           same_day_available=EXCLUDED.same_day_available,
           emergency_available=EXCLUDED.emergency_available,
           max_jobs_per_day=EXCLUDED.max_jobs_per_day,
           temporary_unavailable=EXCLUDED.temporary_unavailable,
           updated_at=NOW()`,
        [
          uid,
          String(req.body?.timezone || 'America/New_York').slice(0, 60),
          JSON.stringify(workingDays),
          Boolean(req.body?.sameDayAvailable),
          Boolean(req.body?.emergencyAvailable),
          req.body?.maxJobsPerDay != null ? Number(req.body.maxJobsPerDay) : null,
          Boolean(req.body?.temporaryUnavailable),
        ],
      );
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, message: 'Could not save availability.' });
    }
  });

  app.get('/api/contractor/employees/:id/availability', requireAuth, async (req, res) => {
    try {
      const employeeId = Number(req.params.id);
      const { rows: emp } = await pool.query(`SELECT * FROM contractor_employees WHERE id=$1`, [employeeId]);
      if (!emp[0]) return res.status(404).json({ ok: false, message: 'Employee not found.' });
      if (req.authUser.role === 'contractor' && Number(emp[0].contractor_user_id) !== Number(req.authUser.id)) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const { rows } = await pool.query(`SELECT * FROM employee_availability WHERE employee_id=$1`, [employeeId]);
      const row = rows[0] || { employee_id: employeeId, working_hours: null, unavailable_dates: [] };
      return res.json({
        ok: true,
        availability: {
          employeeId,
          workingHours: parseJson(row.working_hours, null),
          unavailableDates: parseJson(row.unavailable_dates, []),
          temporaryUnavailable: row.temporary_unavailable === true,
          serviceAreas: parseJson(row.service_areas, []),
        },
      });
    } catch (e) {
      return res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.put('/api/contractor/employees/:id/availability', requireAuth, async (req, res) => {
    try {
      const employeeId = Number(req.params.id);
      const { rows: emp } = await pool.query(`SELECT * FROM contractor_employees WHERE id=$1`, [employeeId]);
      if (!emp[0]) return res.status(404).json({ ok: false, message: 'Employee not found.' });
      if (req.authUser.role === 'contractor' && Number(emp[0].contractor_user_id) !== Number(req.authUser.id)) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      await pool.query(
        `INSERT INTO employee_availability
           (employee_id, contractor_user_id, working_hours, unavailable_dates, temporary_unavailable, service_areas, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (employee_id) DO UPDATE SET
           working_hours=EXCLUDED.working_hours,
           unavailable_dates=EXCLUDED.unavailable_dates,
           temporary_unavailable=EXCLUDED.temporary_unavailable,
           service_areas=EXCLUDED.service_areas,
           updated_at=NOW()`,
        [
          employeeId,
          emp[0].contractor_user_id,
          req.body?.workingHours ? JSON.stringify(req.body.workingHours) : null,
          JSON.stringify(req.body?.unavailableDates || []),
          Boolean(req.body?.temporaryUnavailable),
          JSON.stringify(req.body?.serviceAreas || []),
        ],
      );
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, message: 'Could not save employee availability.' });
    }
  });

  app.get('/api/admin/dispatch/availability', requireAuth, requireAdmin, async (req, res) => {
    try {
      const contractorUserId = Number(req.query.contractorUserId);
      const employeeId = req.query.employeeId != null ? Number(req.query.employeeId) : null;
      if (!contractorUserId) return res.status(400).json({ ok: false, message: 'contractorUserId required.' });

      const { rows: cRows } = await pool.query(`SELECT * FROM contractor_availability WHERE contractor_user_id=$1`, [
        contractorUserId,
      ]);
      const { rows: jobCount } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM managed_jobs
         WHERE assigned_contractor_user_id=$1
           AND status IN ('scheduled','contractor_en_route','work_started','approved')`,
        [contractorUserId],
      );
      const contractorSummary = formatAvailabilitySummary(cRows[0], jobCount[0]?.n || 0);

      let employeeSummary = null;
      if (employeeId) {
        const { rows: eRows } = await pool.query(`SELECT * FROM employee_availability WHERE employee_id=$1`, [employeeId]);
        const { rows: eJobs } = await pool.query(
          `SELECT COUNT(*)::int AS n FROM managed_jobs
           WHERE assigned_employee_id=$1
             AND status IN ('scheduled','contractor_en_route','work_started')`,
          [employeeId],
        );
        const { rows: emp } = await pool.query(`SELECT full_name FROM contractor_employees WHERE id=$1`, [employeeId]);
        employeeSummary = {
          employeeId,
          name: emp[0]?.full_name || null,
          ...formatAvailabilitySummary(eRows[0] || cRows[0], eJobs[0]?.n || 0),
        };
      }

      return res.json({ ok: true, contractor: contractorSummary, employee: employeeSummary });
    } catch (e) {
      return res.status(500).json({ ok: false, message: 'Could not load dispatch availability.' });
    }
  });
}
