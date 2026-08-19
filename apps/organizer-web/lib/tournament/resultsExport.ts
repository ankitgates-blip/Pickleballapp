export type ExportStandingsRow = {
  rank: number;
  name: string;
  primaryStat: string;
  wins: number;
  losses: number;
  diffLabel: string;
};

function diffLabel(diff: number): string {
  return `${diff > 0 ? '+' : ''}${diff}`;
}

export function buildTeamStandingsRows(
  standings: { teamId: string; wins: number; losses: number; pointsFor: number; pointsAgainst: number }[],
  nameById: Map<string, string>
): ExportStandingsRow[] {
  return standings.map((s, i) => ({
    rank: i + 1,
    name: nameById.get(s.teamId) ?? 'Unknown',
    primaryStat: '',
    wins: s.wins,
    losses: s.losses,
    diffLabel: diffLabel(s.pointsFor - s.pointsAgainst),
  }));
}

export function buildIndividualStandingsRows(
  standings: { playerId: string; wins: number; losses: number; pointsFor: number; pointsAgainst: number }[],
  nameById: Map<string, string>
): ExportStandingsRow[] {
  return standings.map((s, i) => ({
    rank: i + 1,
    name: nameById.get(s.playerId) ?? 'Unknown',
    primaryStat: '',
    wins: s.wins,
    losses: s.losses,
    diffLabel: diffLabel(s.pointsFor - s.pointsAgainst),
  }));
}

export function buildLadderStandingsRows(
  standings: {
    playerId: string;
    ladderPoints: number;
    wins: number;
    losses: number;
    pointsFor: number;
    pointsAgainst: number;
  }[],
  nameById: Map<string, string>
): ExportStandingsRow[] {
  return standings.map((s, i) => {
    const games = s.wins + s.losses;
    const avgDiff = games > 0 ? (s.pointsFor - s.pointsAgainst) / games : 0;
    return {
      rank: i + 1,
      name: nameById.get(s.playerId) ?? 'Unknown',
      primaryStat: String(s.ladderPoints),
      wins: s.wins,
      losses: s.losses,
      diffLabel: `${avgDiff >= 0 ? '+' : ''}${avgDiff.toFixed(1)}`,
    };
  });
}

export type ExportRawMatch = {
  round: number;
  stage: string;
  team_a_id: string | null;
  team_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  status: string;
};

export type ExportMatch = {
  round: number | null;
  teamAName: string;
  teamBName: string;
  scoreLabel: string;
};

export type ExportMatchGroup = {
  stageLabel: string;
  matches: ExportMatch[];
};

const STAGE_LABELS: Record<string, string> = {
  league: 'League',
  semifinal: 'Semifinal',
  final: 'Final',
};

function toExportMatch(m: ExportRawMatch, teamById: Map<string, string>): ExportMatch {
  return {
    round: m.stage === 'league' ? m.round : null,
    teamAName: (m.team_a_id && teamById.get(m.team_a_id)) ?? 'Unknown',
    teamBName: (m.team_b_id && teamById.get(m.team_b_id)) ?? 'Unknown',
    scoreLabel: m.status === 'complete' ? `${m.score_a}-${m.score_b}` : 'Not yet played',
  };
}

export function buildMatchGroups(
  matches: ExportRawMatch[],
  teamById: Map<string, string>,
  isLeaguePlayoffs: boolean
): ExportMatchGroup[] {
  const playable = matches.filter((m) => m.team_b_id !== null);

  if (!isLeaguePlayoffs) {
    return playable.length > 0
      ? [{ stageLabel: 'Matches', matches: playable.map((m) => toExportMatch(m, teamById)) }]
      : [];
  }

  const groups: ExportMatchGroup[] = [];
  for (const stage of ['league', 'semifinal', 'final'] as const) {
    const stageMatches = playable.filter((m) => m.stage === stage);
    if (stageMatches.length > 0) {
      groups.push({
        stageLabel: STAGE_LABELS[stage],
        matches: stageMatches.map((m) => toExportMatch(m, teamById)),
      });
    }
  }
  return groups;
}
