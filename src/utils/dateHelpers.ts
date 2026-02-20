// Date utility functions — all week calculations are org-setting-aware

/**
 * Returns the Monday (or Sunday) of the week containing the given date.
 * @param date - any date within the week
 * @param weekStart - "monday" | "sunday"
 */
export function getWeekStart(date: Date, weekStart: 'monday' | 'sunday' = 'monday'): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ...

  if (weekStart === 'monday') {
    // Shift so Monday = 0
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
  } else {
    // Sunday-based week
    d.setDate(d.getDate() - day);
  }
  return d;
}

/**
 * Returns the last day of the week (Sunday or Saturday) given a week-start date.
 */
export function getWeekEnd(weekStart: Date, startDay: 'monday' | 'sunday' = 'monday'): Date {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Returns true if the given date is strictly in the past (before today's midnight).
 */
export function isInPast(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

/**
 * Formats a date as YYYY-MM-DD string (UTC-safe for display).
 */
export function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Returns an ISO week label like "2024-W12".
 */
export function toWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
