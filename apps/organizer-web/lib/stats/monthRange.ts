// apps/organizer-web/lib/stats/monthRange.ts

function toMonthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

function fromMonthIndex(index: number): { year: number; month: number } {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

// Every (year, month) from `start` through the month immediately before `today`,
// inclusive -- i.e. every calendar month that has fully completed. Never includes
// today's own month, since that month isn't over yet. This is what makes the lock
// mechanism safe against gaps: called with the last-*checked* month (or the earliest
// month with any real data, if nothing has been checked yet) as `start`, it returns
// every month that needs checking in one go, not just the single most recent one --
// so a long stretch between page views never permanently skips a month.
export function monthsToCheck(
  startYear: number,
  startMonth: number,
  todayYear: number,
  todayMonth: number
): { year: number; month: number }[] {
  const startIndex = toMonthIndex(startYear, startMonth);
  const endIndex = toMonthIndex(todayYear, todayMonth) - 1;
  if (startIndex > endIndex) return [];

  const result: { year: number; month: number }[] = [];
  for (let i = startIndex; i <= endIndex; i++) {
    result.push(fromMonthIndex(i));
  }
  return result;
}

/** Half-open [start, endExclusive) date window, ISO 'YYYY-MM-DD'. */
export type DateRange = { start: string; endExclusive: string };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** A full calendar month, e.g. (2026, 9) -> 2026-09-01 .. 2026-10-01. */
export function monthDateRange(year: number, month: number): DateRange {
  const start = `${year}-${pad(month)}-01`;
  const endYear = month === 12 ? year + 1 : year;
  const endMonth = month === 12 ? 1 : month + 1;
  const endExclusive = `${endYear}-${pad(endMonth)}-01`;
  return { start, endExclusive };
}

/**
 * The current UTC month so far, up to and including today -- endExclusive is
 * tomorrow, so a tournament dated today is counted. UTC (not local time)
 * deliberately, matching how "the current month" is already derived elsewhere
 * in this codebase (app/player-of-the-month/page.tsx) -- the two views must
 * never disagree about which month "this month" is.
 */
export function monthToDateRange(today: Date): DateRange {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  const day = today.getUTCDate();
  const start = `${year}-${pad(month)}-01`;
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
  const endExclusive = `${tomorrow.getUTCFullYear()}-${pad(tomorrow.getUTCMonth() + 1)}-${pad(tomorrow.getUTCDate())}`;
  return { start, endExclusive };
}
