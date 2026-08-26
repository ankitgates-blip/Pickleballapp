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
