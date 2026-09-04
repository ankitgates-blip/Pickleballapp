export type RawTeam = {
  id: string;
  tournamentId: string;
  player1PersonId: string;
  player2PersonId: string;
};

export type RawMatch = {
  tournamentId: string;
  tournamentDate: string; // ISO date, e.g. '2026-07-15'
  // Round within the tournament -- a tournament date alone can't order two matches
  // played the same day (a whole league can run in one afternoon), so anything that
  // needs real chronological order (win streaks, "last N" form) must also sort by
  // this. Optional/defaults to 0 for callers that only ever compute order-independent
  // aggregates (e.g. buildWinPercentageByPersonId, which just counts wins) and don't
  // have a real round to pass.
  round?: number;
  // 'league' | 'semifinal' | 'final' -- needed alongside round because Semifinal/Final
  // matches are always stored as round 1 (a DB-schema formality, not a real round
  // sequence: see resultsExport.ts), even though they're played AFTER every league
  // round on the same date. Sorting by round alone would put a same-day Final above
  // League Round 1 correctly, but tied with it (both round 1) -- and below League
  // Round 5, which is backwards, since the Final is played last. Optional for the
  // same reason as round -- defaults to 'league' (the common case) for callers that
  // don't have a real stage to pass.
  stage?: string;
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
  // Carried through from RawMatch so anything sorting match history into real
  // chronological order can break a same-date tie by round. See RawMatch.round.
  // Optional for the same reason as RawMatch.round -- existing fixtures/callers
  // that never set it default to 0 (an untiebroken same-date order), not a type error.
  round?: number;
  // Carried through from RawMatch.stage -- see that field's comment for why round
  // alone can't correctly order a same-day Semifinal/Final against League rounds.
  stage?: string;
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
