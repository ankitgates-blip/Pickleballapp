import { describe, it, expect } from 'vitest';
import {
  buildTeamStandingsRows,
  buildIndividualStandingsRows,
  buildLadderStandingsRows,
  buildMatchGroups,
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
