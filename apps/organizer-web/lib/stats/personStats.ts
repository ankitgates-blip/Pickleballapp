import type {
  HeadToHeadRecord,
  LocationCount,
  PeriodStats,
  PersonMatchRecord,
  PersonStats,
  TournamentWon,
} from './types';

function getWeekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function getYearKey(dateStr: string): string {
  return dateStr.slice(0, 4);
}

type PeriodTotals = {
  period: string;
  gamesWon: number;
  gamesLost: number;
  tournamentsWon: number;
};

function periodWinPercentage(row: PeriodTotals): number | null {
  const totalGames = row.gamesWon + row.gamesLost;
  return totalGames > 0 ? Math.round((row.gamesWon / totalGames) * 100) : null;
}

function buildPeriods(
  matches: PersonMatchRecord[],
  tournamentsWon: TournamentWon[],
  keyFn: (date: string) => string
): PeriodStats[] {
  const table = new Map<string, PeriodTotals>();

  const ensure = (period: string): PeriodTotals => {
    let row = table.get(period);
    if (!row) {
      row = { period, gamesWon: 0, gamesLost: 0, tournamentsWon: 0 };
      table.set(period, row);
    }
    return row;
  };

  for (const m of matches) {
    const row = ensure(keyFn(m.tournamentDate));
    if (m.won) {
      row.gamesWon += 1;
    } else {
      row.gamesLost += 1;
    }
  }

  for (const t of tournamentsWon) {
    ensure(keyFn(t.date)).tournamentsWon += 1;
  }

  const sorted = Array.from(table.values()).sort((a, b) => (a.period < b.period ? 1 : -1));

  return sorted.map((row, i) => {
    const winPercentage = periodWinPercentage(row);
    const previous = sorted[i + 1];

    let trend: 'up' | 'down' | 'flat' | null = null;
    let trendPointsChange: number | null = null;

    if (previous) {
      const previousWinPercentage = periodWinPercentage(previous);
      if (winPercentage !== null && previousWinPercentage !== null) {
        trendPointsChange = winPercentage - previousWinPercentage;
        trend = trendPointsChange > 0 ? 'up' : trendPointsChange < 0 ? 'down' : 'flat';
      }
    }

    return { ...row, winPercentage, trend, trendPointsChange };
  });
}

function winRate(record: { wins: number; losses: number }): number {
  const total = record.wins + record.losses;
  return total === 0 ? 0 : record.wins / total;
}

function tallyByPerson(
  matches: PersonMatchRecord[],
  getIds: (m: PersonMatchRecord) => string[]
): Map<string, { wins: number; losses: number }> {
  const table = new Map<string, { wins: number; losses: number }>();

  for (const m of matches) {
    for (const personId of getIds(m)) {
      const row = table.get(personId) ?? { wins: 0, losses: 0 };
      if (m.won) {
        row.wins += 1;
      } else {
        row.losses += 1;
      }
      table.set(personId, row);
    }
  }

  return table;
}

function findToughestOpponent(matches: PersonMatchRecord[]): HeadToHeadRecord | null {
  const table = tallyByPerson(matches, (m) => m.opponentIds);

  let result: HeadToHeadRecord | null = null;
  for (const [personId, record] of table.entries()) {
    const total = record.wins + record.losses;
    if (total === 0) continue;

    const isWorse =
      result === null ||
      winRate(record) < winRate(result) ||
      (winRate(record) === winRate(result) && total > result.wins + result.losses);

    if (isWorse) {
      result = { personId, wins: record.wins, losses: record.losses };
    }
  }

  return result;
}

function findBestPartner(matches: PersonMatchRecord[]): HeadToHeadRecord | null {
  const table = tallyByPerson(matches, (m) => [m.partnerId]);

  let result: HeadToHeadRecord | null = null;
  for (const [personId, record] of table.entries()) {
    const total = record.wins + record.losses;
    if (total === 0) continue;

    const isBetter =
      result === null ||
      winRate(record) > winRate(result) ||
      (winRate(record) === winRate(result) && total > result.wins + result.losses);

    if (isBetter) {
      result = { personId, wins: record.wins, losses: record.losses };
    }
  }

  return result;
}

function countMatchesByLocation(matches: PersonMatchRecord[]): LocationCount[] {
  const table = new Map<string, { count: number; wins: number }>();
  for (const m of matches) {
    const row = table.get(m.venueName) ?? { count: 0, wins: 0 };
    row.count += 1;
    if (m.won) {
      row.wins += 1;
    }
    table.set(m.venueName, row);
  }
  return Array.from(table.entries())
    .map(([location, { count, wins }]) => ({ location, count, wins }))
    .sort((a, b) => b.count - a.count);
}

// A tournament's stages always play out in this order within one day: every League
// round, then Semifinal, then Final. Needed because Semifinal/Final matches are
// always stored as round 1 (a DB-schema formality -- see resultsExport.ts), so a
// same-day Final would otherwise tie with League Round 1 on round number alone, and
// sort BELOW League Round 5 (or whatever the last league round was) even though the
// Final is the last match actually played that day.
const STAGE_RANK: Record<string, number> = { league: 0, semifinal: 1, final: 2 };

// Most-recent-first comparator for PersonMatchRecord -- shared by this module's own
// matchHistory sort and any other caller building a similarly-ordered match list
// (e.g. the Player of the Month winner card's own match history). Tournament date
// first; within the same date, stage (see STAGE_RANK above); then round descending
// within the same stage -- a tournament date alone can't order two matches played
// the same day (a whole league round-robin runs in one evening), and without these
// tiebreaks, same-date matches kept whatever arbitrary order the unordered
// matches-table query happened to return them in, which could scramble win streaks
// and "last N" form into the wrong result.
export function compareMatchRecordsMostRecentFirst(a: PersonMatchRecord, b: PersonMatchRecord): number {
  if (a.tournamentDate !== b.tournamentDate) {
    return a.tournamentDate < b.tournamentDate ? 1 : -1;
  }
  const stageDiff = (STAGE_RANK[b.stage ?? 'league'] ?? 0) - (STAGE_RANK[a.stage ?? 'league'] ?? 0);
  if (stageDiff !== 0) return stageDiff;
  return (b.round ?? 0) - (a.round ?? 0);
}

export function computePersonStats(
  matches: PersonMatchRecord[],
  tournamentsWon: TournamentWon[]
): PersonStats {
  const sortedHistory = [...matches].sort(compareMatchRecordsMostRecentFirst);

  return {
    weekly: buildPeriods(matches, tournamentsWon, getWeekStart),
    monthly: buildPeriods(matches, tournamentsWon, getMonthKey),
    yearly: buildPeriods(matches, tournamentsWon, getYearKey),
    matchHistory: sortedHistory,
    toughestOpponent: findToughestOpponent(matches),
    bestPartner: findBestPartner(matches),
    lastPlayedDate: sortedHistory[0]?.tournamentDate ?? null,
    matchesByLocation: countMatchesByLocation(matches),
    winPercentage:
      matches.length > 0
        ? Math.round((matches.filter((m) => m.won).length / matches.length) * 100)
        : null,
  };
}
