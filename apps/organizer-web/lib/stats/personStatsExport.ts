import type { HeadToHeadRecord, LocationCount, PeriodStats, PersonMatchRecord } from './types';
import { starRating } from './starRating';

export type ExportPeriodRow = {
  period: string;
  winPercentageLabel: string;
  trendLabel: string;
  gamesWon: number;
  gamesLost: number;
};

function formatTrendPlain(
  trend: 'up' | 'down' | 'flat' | null,
  pointsChange: number | null
): string {
  if (trend === null || pointsChange === null) return '';
  if (trend === 'up') return `Up +${pointsChange}pp`;
  if (trend === 'down') return `Down ${pointsChange}pp`;
  return 'Flat 0pp';
}

export function buildPeriodRows(periods: PeriodStats[]): ExportPeriodRow[] {
  return periods.map((p) => ({
    period: p.period,
    winPercentageLabel: p.winPercentage !== null ? `${p.winPercentage}%` : 'No matches',
    trendLabel: formatTrendPlain(p.trend, p.trendPointsChange),
    gamesWon: p.gamesWon,
    gamesLost: p.gamesLost,
  }));
}

export type ExportLocationRow = {
  location: string;
  matchCount: number;
  winPercentageLabel: string;
};

export function buildLocationRows(locations: LocationCount[]): ExportLocationRow[] {
  return locations.map((l) => ({
    location: l.location,
    matchCount: l.count,
    winPercentageLabel: `${Math.round((l.wins / l.count) * 100)}%`,
  }));
}

export type ExportMatchHistoryRow = {
  date: string;
  partnerName: string;
  opponentsLabel: string;
  result: 'W' | 'L';
  scoreLabel: string;
};

export function buildMatchHistoryRows(
  matchHistory: PersonMatchRecord[],
  nameById: Map<string, string>
): ExportMatchHistoryRow[] {
  return matchHistory.map((m) => ({
    date: m.tournamentDate,
    partnerName: nameById.get(m.partnerId) ?? 'Unknown',
    opponentsLabel: `${nameById.get(m.opponentIds[0]) ?? 'Unknown'} / ${nameById.get(m.opponentIds[1]) ?? 'Unknown'}`,
    result: m.won ? 'W' : 'L',
    scoreLabel: `${m.scoreFor}-${m.scoreAgainst}`,
  }));
}

export function formatHeadToHead(
  record: HeadToHeadRecord | null,
  nameById: Map<string, string>
): string {
  if (!record) return 'Not enough matches yet';
  return `${nameById.get(record.personId) ?? 'Unknown'} (${record.wins}-${record.losses})`;
}

export function starRatingLabel(winPercentage: number | null): string {
  if (winPercentage === null) return 'No matches played yet';
  return `${winPercentage}% win rate (${starRating(winPercentage)}/5 stars)`;
}
