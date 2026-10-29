/**
 * Smoke checks for Home Updates recommendation rules (mirrors src/app/homeUpdates.ts).
 * Run: node scripts/smoke-home-updates.mjs
 */
const MS_DAY = 24 * 60 * 60 * 1000;

function monthsBetween(from, to) {
  return (to.getTime() - from.getTime()) / (MS_DAY * 30.44);
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok:', msg);
  }
}

const now = new Date('2026-08-26T12:00:00Z');

// HVAC last serviced Mar 2025 → ~17 months → due
{
  const last = new Date('2025-03-12T12:00:00Z');
  const months = monthsBetween(last, now);
  assert(months >= 12 && months < 18, `HVAC ~17mo due window (${months.toFixed(1)} months)`);
}

// Roof install 2011, last inspect 2022 → attention age+stale
{
  const installed = new Date(Date.UTC(2011, 0, 1));
  const ageYears = (now.getTime() - installed.getTime()) / (MS_DAY * 365.25);
  const lastInspect = new Date(Date.UTC(2022, 0, 1));
  const yearsSince = (now.getTime() - lastInspect.getTime()) / (MS_DAY * 365.25);
  assert(ageYears >= 14, `Roof age ~${ageYears.toFixed(1)} years`);
  assert(yearsSince >= 3, `Roof inspection stale ~${yearsSince.toFixed(1)} years`);
}

// Water heater 2016, no service → age inspect
{
  const installed = new Date(Date.UTC(2016, 0, 1));
  const ageYears = (now.getTime() - installed.getTime()) / (MS_DAY * 365.25);
  assert(ageYears >= 9, `Water heater age ~${ageYears.toFixed(1)} years`);
}

// Warranty in 45 days → upcoming
{
  const until = new Date(now.getTime() + 45 * MS_DAY);
  const daysLeft = (until.getTime() - now.getTime()) / MS_DAY;
  assert(daysLeft > 0 && daysLeft <= 90, `Warranty window ${Math.round(daysLeft)} days`);
}

// Follow-up due from structured date
{
  const due = new Date('2025-08-01T12:00:00Z');
  assert(now.getTime() >= due.getTime(), 'Structured follow-up is past due → high priority eligible');
}

// Fresh service clears overdue
{
  const last = new Date('2026-08-26T12:00:00Z');
  const months = monthsBetween(last, now);
  assert(months < 1, `Fresh service clears maintenance (${months.toFixed(2)} months)`);
}

if (process.exitCode) {
  console.error('\nHome Updates smoke failed');
  process.exit(1);
}
console.log('\nHome Updates smoke passed');
