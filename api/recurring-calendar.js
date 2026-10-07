export function calendarDate(value) {
  const date = value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

export function addRecurrenceDays(value, recurrence, anchor = value) {
  const date = calendarDate(value);
  if (!date) return null;
  const d = new Date(`${date}T12:00:00Z`);
  const days = { weekly: 7, biweekly: 14 }[recurrence];
  if (days) d.setUTCDate(d.getUTCDate() + days);
  else {
    const months = { monthly: 1, every_2_months: 2, quarterly: 3, seasonal: 3, every_6_months: 6, annually: 12 }[recurrence];
    if (!months) return null; // Event/custom schedules need an Admin-selected occurrence date.
    const preferredDay = Number(calendarDate(anchor)?.slice(8, 10)) || d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(preferredDay, lastDay));
  }
  return d.toISOString().slice(0, 10);
}
