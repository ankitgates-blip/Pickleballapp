export type Team = {
  id: string;
  tournamentId: string;
  player1Id: string;
  player2Id: string;
};

export type MatchResult = {
  teamAId: string;
  teamBId: string | null; // null = bye
  scoreA: number | null;
  scoreB: number | null;
  status: 'pending' | 'complete';
};

export type StandingsRow = {
  teamId: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
};

export type RoundRobinPairing = {
  round: number;
  teamAId: string;
  teamBId: string | null; // null = bye
};

export type CompletionCheckMatch = {
  stage: 'league' | 'semifinal' | 'final';
  status: 'pending' | 'complete';
  teamBId: string | null;
};

export type PopcornPairing = {
  round: number;
  teamAPlayerIds: [string, string];
  teamBPlayerIds: [string, string];
};

export type IndividualStandingsRow = {
  playerId: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
};
