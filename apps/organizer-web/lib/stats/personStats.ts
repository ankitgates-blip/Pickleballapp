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

export function computePersonStats(
  matches: PersonMatchRecord[],
  tournamentsWon: TournamentWon[]
): PersonStats {
  const sortedHistory = [...matches].sort((a, b) =>
    a.tournamentDate < b.tournamentDate ? 1 : -1
  );

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
