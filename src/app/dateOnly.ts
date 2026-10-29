/**
 * Calendar-date helpers that respect the viewer's timezone.
 *
 * Two common pitfalls these avoid:
 *  - `new Date().toISOString().slice(0, 10)` is the UTC date, which is already "tomorrow"
 *    in the US every evening.
 *  - `new Date("2026-05-01")` is parsed as UTC midnight, so it displays as April 30 in the US.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD for the given moment in the viewer's local timezone. */
export function localYmd(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parse a date value. Plain "YYYY-MM-DD" strings become local midnight on that calendar day;
 * full timestamps are parsed normally. Returns null for empty or invalid input.
 */
export function parseDateValue(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const m = DATE_ONLY.exec(value.trim());
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** toLocaleDateString that shows the right day for date-only values. */
export function formatDateValue(
  value: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
  fallback = ""
): string {
  const d = parseDateValue(value);
  return d ? d.toLocaleDateString(undefined, options) : fallback;
}
