import { describe, it, expect } from 'vitest';
import {
  buildTeamStandingsRows,
  buildIndividualStandingsRows,
  buildLadderStandingsRows,
  buildMatchGroups,
  buildUpcomingMatchGroups,
} from './resultsExport';

describe('buildTeamStandingsRows', () => {
  it('maps team standings to export rows with 1-based rank and a signed diff label', () => {
    const nameById = new Map([
      ['t1', 'Alice / Bob'],
      ['t2', 'Carol / Dave'],
    ]);
    const result = buildTeamStandingsRows(
      [
        { teamId: 't1', wins: 3, losses: 0, pointsFor: 33, pointsAgainst: 10 },
        { teamId: 't2', wins: 0, losses: 3, pointsFor: 10, pointsAgainst: 33 },
      ],
      nameById
    );
    expect(result).toEqual([
      { rank: 1, name: 'Alice / Bob', primaryStat: '', wins: 3, losses: 0, diffLabel: '+23' },
      { rank: 2, name: 'Carol / Dave', primaryStat: '', wins: 0, losses: 3, diffLabel: '-23' },
    ]);
  });

  it('falls back to "Unknown" when a team id is missing from nameById', () => {
    const result = buildTeamStandingsRows(
      [{ teamId: 'ghost', wins: 1, losses: 0, pointsFor: 11, pointsAgainst: 5 }],
      new Map()
    );
    expect(result[0].name).toBe('Unknown');
  });
});

describe('buildIndividualStandingsRows', () => {
  it('maps individual standings to export rows with an empty primaryStat', () => {
    const nameById = new Map([['p1', 'Alice']]);
    const result = buildIndividualStandingsRows(
      [{ playerId: 'p1', wins: 2, losses: 1, pointsFor: 30, pointsAgainst: 20 }],
      nameById
    );
    expect(result).toEqual([
      { rank: 1, name: 'Alice', primaryStat: '', wins: 2, losses: 1, diffLabel: '+10' },
    ]);
  });
});

describe('buildLadderStandingsRows', () => {
  it('maps ladder standings to export rows with ladderPoints as primaryStat and an averaged diff label', () => {
    const nameById = new Map([['p1', 'Alice']]);
    const result = buildLadderStandingsRows(
      [{ playerId: 'p1', ladderPoints: 7, wins: 2, losses: 1, pointsFor: 33, pointsAgainst: 24 }],
      nameById
    );
    expect(result).toEqual([
      { rank: 1, name: 'Alice', primaryStat: '7', wins: 2, losses: 1, diffLabel: '+3.0' },
    ]);
  });

  it('produces a diffLabel of "+0.0" when no games have been played', () => {
    const nameById = new Map([['p1', 'Alice']]);
    const result = buildLadderStandingsRows(
      [{ playerId: 'p1', ladderPoints: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }],
      nameById
    );
    expect(result[0].diffLabel).toBe('+0.0');
  });
});

describe('buildMatchGroups', () => {
  const teamById = new Map([
    ['t1', 'Alice / Bob'],
    ['t2', 'Carol / Dave'],
  ]);

  it('groups all matches under a single "Matches" group for non-league_playoffs formats, with round only shown for league-stage matches', () => {
    const result = buildMatchGroups(
      [
        { round: 1, stage: 'league', team_a_id: 't1', team_b_id: 't2', score_a: 11, score_b: 7, status: 'complete' },
      ],
      teamById,
      false
    );
    expect(result).toEqual([
      {
        stageLabel: 'Matches',
        matches: [
          { round: 1, teamAName: 'Alice / Bob', teamBName: 'Carol / Dave', scoreLabel: '11-7', winner: 'a' },
        ],
      },
    ]);
  });

  it('returns an empty array for non-league_playoffs formats with no playable matches', () => {
    const result = buildMatchGroups([], teamById, false);
    expect(result).toEqual([]);
  });

  it('splits league_playoffs matches into separate League/Semifinal/Final groups, omitting empty stages, with round null outside league stage', () => {
    const result = buildMatchGroups(
      [
        { round: 1, stage: 'league', team_a_id: 't1', team_b_id: 't2', score_a: 11, score_b: 7, status: 'complete' },
        { round: 1, stage: 'final', team_a_id: 't1', team_b_id: 't2', score_a: null, score_b: null, status: 'pending' },
      ],
      teamById,
      true
    );
    expect(result).toEqual([
      {
        stageLabel: 'League',
        matches: [
          { round: 1, teamAName: 'Alice / Bob', teamBName: 'Carol / Dave', scoreLabel: '11-7', winner: 'a' },
        ],
      },
      {
        stageLabel: 'Final',
        matches: [
          {
            round: null,
            teamAName: 'Alice / Bob',
            teamBName: 'Carol / Dave',
            scoreLabel: 'Not yet played',
            winner: null,
          },
        ],
      },
    ]);
  });

  it('sets winner to null on a tied complete score, and to "b" when team B has the higher score', () => {
    const result = buildMatchGroups(
      [
        { round: 1, stage: 'league', team_a_id: 't1', team_b_id: 't2', score_a: 9, score_b: 9, status: 'complete' },
        { round: 2, stage: 'league', team_a_id: 't1', team_b_id: 't2', score_a: 5, score_b: 11, status: 'complete' },
      ],
      teamById,
      false
    );
    expect(result[0].matches[0].winner).toBeNull();
    expect(result[0].matches[1].winner).toBe('b');
  });

  it('excludes bye matches (team_b_id null)', () => {
    const result = buildMatchGroups(
      [{ round: 1, stage: 'league', team_a_id: 't1', team_b_id: null, score_a: null, score_b: null, status: 'pending' }],
      teamById,
      false
    );
    expect(result).toEqual([]);
  });
});

describe('buildUpcomingMatchGroups', () => {
  const teamById = new Map([
    ['t1', 'Alice / Bob'],
    ['t2', 'Carol / Dave'],
    ['t3', 'Erin / Frank'],
  ]);

  it('drops completed and skipped matches, keeping only pending ones', () => {
    const result = buildUpcomingMatchGroups(
      [
        { round: 1, stage: 'league', team_a_id: 't1', team_b_id: 't2', score_a: 11, score_b: 7, status: 'complete' },
        { round: 1, stage: 'league', team_a_id: 't1', team_b_id: 't3', score_a: null, score_b: null, status: 'skipped' },
        { round: 2, stage: 'league', team_a_id: 't2', team_b_id: 't3', score_a: null, score_b: null, status: 'pending' },
      ],
      teamById,
      false
    );
    expect(result).toEqual([
      {
        stageLabel: 'Matches',
        roundGroups: [
          {
            round: 2,
            matches: [{ teamAName: 'Carol / Dave', teamBName: 'Erin / Frank', court: null }],
            sitOutNames: [],
          },
        ],
      },
    ]);
  });

  it('carries the court number through onto each match', () => {
    const result = buildUpcomingMatchGroups(
      [
        {
          round: 1,
          stage: 'league',
          team_a_id: 't1',
          team_b_id: 't2',
          score_a: null,
          score_b: null,
          status: 'pending',
          court: 3,
        },
      ],
      teamById,
      false
    );
    expect(result[0].roundGroups[0].matches[0].court).toBe(3);
  });

  it('returns an empty array when there are no pending matches', () => {
    const result = buildUpcomingMatchGroups(
      [{ round: 1, stage: 'league', team_a_id: 't1', team_b_id: 't2', score_a: 11, score_b: 7, status: 'complete' }],
      teamById,
      false
    );
    expect(result).toEqual([]);
  });

  it('groups pending matches by round, sorted ascending, within a single flat stage', () => {
    const result = buildUpcomingMatchGroups(
      [
        { round: 2, stage: 'league', team_a_id: 't1', team_b_id: 't2', score_a: null, score_b: null, status: 'pending' },
        { round: 1, stage: 'league', team_a_id: 't2', team_b_id: 't3', score_a: null, score_b: null, status: 'pending' },
        { round: 1, stage: 'league', team_a_id: 't1', team_b_id: 't3', score_a: null, score_b: null, status: 'pending' },
      ],
      teamById,
      false
    );
    expect(result).toEqual([
      {
        stageLabel: 'Matches',
        roundGroups: [
          {
            round: 1,
            matches: [
              { teamAName: 'Carol / Dave', teamBName: 'Erin / Frank', court: null },
              { teamAName: 'Alice / Bob', teamBName: 'Erin / Frank', court: null },
            ],
            sitOutNames: [],
          },
          {
            round: 2,
            matches: [{ teamAName: 'Alice / Bob', teamBName: 'Carol / Dave', court: null }],
            sitOutNames: [],
          },
        ],
      },
    ]);
  });

  it('splits league_playoffs pending matches into League (round-grouped)/Semifinal/Final, with round null outside League', () => {
    const result = buildUpcomingMatchGroups(
      [
        { round: 1, stage: 'league', team_a_id: 't1', team_b_id: 't2', score_a: null, score_b: null, status: 'pending' },
        { round: 1, stage: 'semifinal', team_a_id: 't1', team_b_id: 't3', score_a: null, score_b: null, status: 'pending' },
        { round: 1, stage: 'final', team_a_id: 't2', team_b_id: 't3', score_a: null, score_b: null, status: 'pending' },
      ],
      teamById,
      true
    );
    expect(result).toEqual([
      {
        stageLabel: 'League',
        roundGroups: [
          {
            round: 1,
            matches: [{ teamAName: 'Alice / Bob', teamBName: 'Carol / Dave', court: null }],
            sitOutNames: [],
          },
        ],
      },
      {
        stageLabel: 'Semifinal',
        roundGroups: [
          {
            round: null,
            matches: [{ teamAName: 'Alice / Bob', teamBName: 'Erin / Frank', court: null }],
            sitOutNames: [],
          },
        ],
      },
      {
        stageLabel: 'Final',
        roundGroups: [
          {
            round: null,
            matches: [{ teamAName: 'Carol / Dave', teamBName: 'Erin / Frank', court: null }],
            sitOutNames: [],
          },
        ],
      },
    ]);
  });

  it('folds a bye match (team_b_id null) into sitOutNames instead of dropping it', () => {
    const result = buildUpcomingMatchGroups(
      [{ round: 1, stage: 'league', team_a_id: 't1', team_b_id: null, score_a: null, score_b: null, status: 'pending' }],
      teamById,
      false
    );
    expect(result).toEqual([
      {
        stageLabel: 'Matches',
        roundGroups: [{ round: 1, matches: [], sitOutNames: ['Alice / Bob'] }],
      },
    ]);
  });

  it('merges a bye-derived sit-out with a real match already in the same round', () => {
    const result = buildUpcomingMatchGroups(
      [
        { round: 1, stage: 'league', team_a_id: 't1', team_b_id: null, score_a: null, score_b: null, status: 'pending' },
        { round: 1, stage: 'league', team_a_id: 't2', team_b_id: 't3', score_a: null, score_b: null, status: 'pending' },
      ],
      teamById,
      false
    );
    expect(result).toEqual([
      {
        stageLabel: 'Matches',
        roundGroups: [
          {
            round: 1,
            matches: [{ teamAName: 'Carol / Dave', teamBName: 'Erin / Frank', court: null }],
            sitOutNames: ['Alice / Bob'],
          },
        ],
      },
    ]);
  });

  it('merges externally-supplied (player-level) sit-outs with any bye-derived names for the same round', () => {
    const result = buildUpcomingMatchGroups(
      [
        { round: 1, stage: 'league', team_a_id: 't1', team_b_id: null, score_a: null, score_b: null, status: 'pending' },
        { round: 1, stage: 'league', team_a_id: 't2', team_b_id: 't3', score_a: null, score_b: null, status: 'pending' },
      ],
      teamById,
      false,
      new Map([[1, ['Gina']]])
    );
    expect(result[0].roundGroups[0].sitOutNames).toEqual(['Alice / Bob', 'Gina']);
  });

  it('does not leak league-stage sit-outs into Semifinal/Final round groups', () => {
    const result = buildUpcomingMatchGroups(
      [
        { round: 1, stage: 'league', team_a_id: 't1', team_b_id: null, score_a: null, score_b: null, status: 'pending' },
        { round: 1, stage: 'semifinal', team_a_id: 't2', team_b_id: 't3', score_a: null, score_b: null, status: 'pending' },
      ],
      teamById,
      true
    );
    const semifinalGroup = result.find((g) => g.stageLabel === 'Semifinal');
    expect(semifinalGroup?.roundGroups[0].sitOutNames).toEqual([]);
  });
});
