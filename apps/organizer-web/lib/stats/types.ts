export type RawTeam = {
  id: string;
  tournamentId: string;
  player1PersonId: string;
  player2PersonId: string;
};

export type RawMatch = {
  tournamentId: string;
  tournamentDate: string; // ISO date, e.g. '2026-07-15'
  venueName: string;
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  status: 'pending' | 'complete';
};

export type PersonMatchRecord = {
  tournamentId: string;
  tournamentDate: string;
  venueName: string;
  partnerId: string;
  opponentIds: [string, string];
  scoreFor: number;
  scoreAgainst: number;
  won: boolean;
};

export type TournamentWon = {
  tournamentId: string;
  date: string; // ISO date
};

export type PeriodStats = {
  period: string; // Monday date (weekly), 'YYYY-MM' (monthly), or 'YYYY' (yearly)
  gamesWon: number;
  gamesLost: number;
  tournamentsWon: number;
  winPercentage: number | null;
  trend: 'up' | 'down' | 'flat' | null;
  trendPointsChange: number | null;
};

export type HeadToHeadRecord = {
  personId: string;
  wins: number;
  losses: number;
};

export type LocationCount = {
  location: string;
  count: number;
  wins: number;
};

export type PersonStats = {
  weekly: PeriodStats[];
  monthly: PeriodStats[];
  yearly: PeriodStats[];
  matchHistory: PersonMatchRecord[];
  toughestOpponent: HeadToHeadRecord | null;
  bestPartner: HeadToHeadRecord | null;
  lastPlayedDate: string | null;
  matchesByLocation: LocationCount[];
  winPercentage: number | null;
};
