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
  winner: 'a' | 'b' | null;
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
  const isComplete = m.status === 'complete';
  const winner: ExportMatch['winner'] =
    isComplete && m.score_a !== null && m.score_b !== null
      ? m.score_a > m.score_b
        ? 'a'
        : m.score_b > m.score_a
          ? 'b'
          : null
      : null;
  return {
    round: m.stage === 'league' ? m.round : null,
    teamAName: (m.team_a_id && teamById.get(m.team_a_id)) ?? 'Unknown',
    teamBName: (m.team_b_id && teamById.get(m.team_b_id)) ?? 'Unknown',
    scoreLabel: isComplete
      ? `${m.score_a}-${m.score_b}`
      : m.status === 'skipped'
        ? 'Skipped'
        : 'Not yet played',
    winner,
  };
}

// splitByStage: true for League + Playoffs tournaments (always), and for any other
// format's tournament that has actually produced semifinal/final matches -- e.g. a
// Custom League that generated playoffs from its fixed teams. Everything else (the
// common case) gets a single flat "Matches" group, same as always.
export function buildMatchGroups(
  matches: ExportRawMatch[],
  teamById: Map<string, string>,
  splitByStage: boolean
): ExportMatchGroup[] {
  const playable = matches.filter((m) => m.team_b_id !== null);

  if (!splitByStage) {
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

export type UpcomingMatch = {
  teamAName: string;
  teamBName: string;
};

export type UpcomingRoundGroup = {
  // null only for a stage where round numbering isn't meaningful (Semifinal/Final --
  // those matches are always numbered round 1 as a DB-schema formality, not a real
  // round sequence) -- League/Matches rounds are always a real number.
  round: number | null;
  matches: UpcomingMatch[];
};

export type UpcomingStageGroup = {
  stageLabel: string;
  roundGroups: UpcomingRoundGroup[];
};

function toUpcomingMatch(m: ExportRawMatch, teamById: Map<string, string>): UpcomingMatch {
  return {
    teamAName: (m.team_a_id && teamById.get(m.team_a_id)) ?? 'Unknown',
    teamBName: (m.team_b_id && teamById.get(m.team_b_id)) ?? 'Unknown',
  };
}

function groupPendingByRound(
  matches: ExportRawMatch[],
  teamById: Map<string, string>
): UpcomingRoundGroup[] {
  const byRound = new Map<number, UpcomingMatch[]>();
  for (const m of matches) {
    const list = byRound.get(m.round) ?? [];
    list.push(toUpcomingMatch(m, teamById));
    byRound.set(m.round, list);
  }
  return [...byRound.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, roundMatches]) => ({ round, matches: roundMatches }));
}

// A separate, additive builder from buildMatchGroups above -- deliberately not a
// modification of it, since ChampionCard/ShareResultsButton consume that one for
// completed results (with scores and winners) and must keep working unchanged.
// This one is for a forward-looking "what's left to play" schedule: only pending
// matches (completed and skipped ones are dropped entirely, and so is the score --
// there isn't one yet), grouped by round within each stage. Semifinal/Final matches
// aren't round-grouped (see UpcomingRoundGroup.round) -- each becomes a single group.
export function buildUpcomingMatchGroups(
  matches: ExportRawMatch[],
  teamById: Map<string, string>,
  splitByStage: boolean
): UpcomingStageGroup[] {
  const pending = matches.filter((m) => m.team_b_id !== null && m.status === 'pending');

  if (!splitByStage) {
    return pending.length > 0
      ? [{ stageLabel: 'Matches', roundGroups: groupPendingByRound(pending, teamById) }]
      : [];
  }

  const groups: UpcomingStageGroup[] = [];
  for (const stage of ['league', 'semifinal', 'final'] as const) {
    const stageMatches = pending.filter((m) => m.stage === stage);
    if (stageMatches.length === 0) continue;
    groups.push({
      stageLabel: STAGE_LABELS[stage],
      roundGroups:
        stage === 'league'
          ? groupPendingByRound(stageMatches, teamById)
          : [{ round: null, matches: stageMatches.map((m) => toUpcomingMatch(m, teamById)) }],
    });
  }
  return groups;
}
