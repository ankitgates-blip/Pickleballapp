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
  court?: number | null;
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
  court: number | null;
};

export type UpcomingRoundGroup = {
  // null only for a stage where round numbering isn't meaningful (Semifinal/Final --
  // those matches are always numbered round 1 as a DB-schema formality, not a real
  // round sequence) -- League/Matches rounds are always a real number.
  round: number | null;
  matches: UpcomingMatch[];
  // Whoever isn't playing this round: names of teams with a bye row (team_b_id null,
  // see below) plus any externally-supplied player-level sit-outs (Custom League's
  // dynamic/ad-hoc pairing mode -- see buildUpcomingMatchGroups' extraSitOutNamesByRound).
  sitOutNames: string[];
};

export type UpcomingStageGroup = {
  stageLabel: string;
  roundGroups: UpcomingRoundGroup[];
};

function toUpcomingMatch(m: ExportRawMatch, teamById: Map<string, string>): UpcomingMatch {
  return {
    teamAName: (m.team_a_id && teamById.get(m.team_a_id)) ?? 'Unknown',
    teamBName: (m.team_b_id && teamById.get(m.team_b_id)) ?? 'Unknown',
    court: m.court ?? null,
  };
}

function groupPendingByRound(
  matches: ExportRawMatch[],
  sitOutNamesByRound: Map<number, string[]>,
  teamById: Map<string, string>
): UpcomingRoundGroup[] {
  const byRound = new Map<number, UpcomingMatch[]>();
  for (const m of matches) {
    const list = byRound.get(m.round) ?? [];
    list.push(toUpcomingMatch(m, teamById));
    byRound.set(m.round, list);
  }
  // Union with sitOutNamesByRound's keys: a round can have a sit-out with zero real
  // matches left in it (e.g. every other team already played this round), and it
  // should still surface as its own round group rather than vanish.
  const allRounds = new Set<number>([...byRound.keys(), ...sitOutNamesByRound.keys()]);
  return [...allRounds]
    .sort((a, b) => a - b)
    .map((round) => ({
      round,
      matches: byRound.get(round) ?? [],
      sitOutNames: sitOutNamesByRound.get(round) ?? [],
    }));
}

// A separate, additive builder from buildMatchGroups above -- deliberately not a
// modification of it, since ChampionCard/ShareResultsButton consume that one for
// completed results (with scores and winners) and must keep working unchanged.
// This one is for a forward-looking "what's left to play" schedule: only pending
// matches (completed and skipped ones are dropped entirely, and so is the score --
// there isn't one yet), grouped by round within each stage. Semifinal/Final matches
// aren't round-grouped (see UpcomingRoundGroup.round) -- each becomes a single group.
//
// extraSitOutNamesByRound: player-level sit-outs the caller already knows about but
// that have no matches-table row to derive from -- specifically Custom League's
// dynamic/ad-hoc pairing mode, where a round can leave an individual player unpaired
// entirely (see bracket/page.tsx's sitOutNamesByRound). Bye rows (team_b_id null,
// used by League + Playoffs and Custom's fixed-team mode) are picked up automatically
// from `matches` itself and merged with these, keyed by the same round number.
export function buildUpcomingMatchGroups(
  matches: ExportRawMatch[],
  teamById: Map<string, string>,
  splitByStage: boolean,
  extraSitOutNamesByRound?: Map<number, string[]>
): UpcomingStageGroup[] {
  const pending = matches.filter((m) => m.team_b_id !== null && m.status === 'pending');

  // A bye row has no opposing team to show as a match, but the team on the bye is
  // still someone the organizer needs to know isn't playing that round -- fold it
  // into sitOutNames instead of silently dropping it (the old behavior).
  const sitOutNamesByRound = new Map<number, string[]>();
  for (const m of matches) {
    if (m.team_b_id !== null || m.status !== 'pending') continue;
    const name = (m.team_a_id && teamById.get(m.team_a_id)) ?? 'Unknown';
    const names = sitOutNamesByRound.get(m.round) ?? [];
    names.push(name);
    sitOutNamesByRound.set(m.round, names);
  }
  if (extraSitOutNamesByRound) {
    for (const [round, names] of extraSitOutNamesByRound) {
      const existing = sitOutNamesByRound.get(round) ?? [];
      sitOutNamesByRound.set(round, [...existing, ...names]);
    }
  }

  if (!splitByStage) {
    const roundGroups = groupPendingByRound(pending, sitOutNamesByRound, teamById);
    return roundGroups.length > 0 ? [{ stageLabel: 'Matches', roundGroups }] : [];
  }

  const groups: UpcomingStageGroup[] = [];
  for (const stage of ['league', 'semifinal', 'final'] as const) {
    const stageMatches = pending.filter((m) => m.stage === stage);
    // Byes (and the dynamic-mode sit-outs merged above) only ever occur in the league
    // stage -- Semifinal/Final are always fixed 4-team/2-team stages with no byes.
    const stageSitOutNamesByRound = stage === 'league' ? sitOutNamesByRound : new Map<number, string[]>();
    if (stageMatches.length === 0 && stageSitOutNamesByRound.size === 0) continue;
    groups.push({
      stageLabel: STAGE_LABELS[stage],
      roundGroups:
        stage === 'league'
          ? groupPendingByRound(stageMatches, stageSitOutNamesByRound, teamById)
          : [
              {
                round: null,
                matches: stageMatches.map((m) => toUpcomingMatch(m, teamById)),
                sitOutNames: [],
              },
            ],
    });
  }
  return groups;
}
