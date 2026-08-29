import { describe, it, expect } from 'vitest';
import { computeTournamentChampionName, computeTournamentChampionPersonIds } from './champion';

const teamsFixture = [
  { id: 't1', player_1_id: 'p1', player_2_id: 'p2' },
  { id: 't2', player_1_id: 'p3', player_2_id: 'p4' },
];

const playersFixture = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
  { id: 'p3', name: 'Carol' },
  { id: 'p4', name: 'Dave' },
];

describe('computeTournamentChampionName', () => {
  it('returns undefined when the tournament is not completed', () => {
    const result = computeTournamentChampionName({
      format: 'round_robin',
      completedAt: null,
      matches: [
        {
          stage: 'league',
          team_a_id: 't1',
          team_b_id: 't2',
          score_a: 11,
          score_b: 5,
          status: 'complete',
          round: 1,
          court: null,
        },
      ],
      teams: teamsFixture,
      players: playersFixture,
    });
    expect(result).toBeUndefined();
  });

  it('returns the top standings team name for a team-based format with no final match', () => {
    const result = computeTournamentChampionName({
      format: 'round_robin',
      completedAt: '2026-01-01T00:00:00Z',
      matches: [
        {
          stage: 'league',
          team_a_id: 't1',
          team_b_id: 't2',
          score_a: 11,
          score_b: 5,
          status: 'complete',
          round: 1,
          court: null,
        },
      ],
      teams: teamsFixture,
      players: playersFixture,
    });
    expect(result).toBe('Alice / Bob');
  });

  it("returns the final match winner's team name for league_playoffs when a final exists, even if that team lost the league stage", () => {
    const result = computeTournamentChampionName({
      format: 'league_playoffs',
      completedAt: '2026-01-01T00:00:00Z',
      matches: [
        {
          stage: 'league',
          team_a_id: 't1',
          team_b_id: 't2',
          score_a: 5,
          score_b: 11,
          status: 'complete',
          round: 1,
          court: null,
        },
        {
          stage: 'final',
          team_a_id: 't1',
          team_b_id: 't2',
          score_a: 11,
          score_b: 8,
          status: 'complete',
          round: 1,
          court: null,
        },
      ],
      teams: teamsFixture,
      players: playersFixture,
    });
    expect(result).toBe('Alice / Bob');
  });

  it('returns the top individual standings player name for an individual format', () => {
    const result = computeTournamentChampionName({
      format: 'popcorn',
      completedAt: '2026-01-01T00:00:00Z',
      matches: [
        {
          stage: 'league',
          team_a_id: 't1',
          team_b_id: 't2',
          score_a: 11,
          score_b: 5,
          status: 'complete',
          round: 1,
          court: null,
        },
      ],
      teams: teamsFixture,
      players: playersFixture,
    });
    expect(result).toBe('Alice');
  });

  it('resolves a per-player champion for Custom League from a mix of fixed and ad-hoc teams', () => {
    const mixedTeams = [
      { id: 't1', player_1_id: 'p1', player_2_id: 'p2' },
      { id: 't2', player_1_id: 'p3', player_2_id: 'p4' },
      { id: 't3', player_1_id: 'p1', player_2_id: 'p4' },
      { id: 't4', player_1_id: 'p2', player_2_id: 'p3' },
    ];
    const result = computeTournamentChampionName({
      format: 'custom',
      completedAt: '2026-01-01T00:00:00Z',
      matches: [
        {
          stage: 'league',
          team_a_id: 't1',
          team_b_id: 't2',
          score_a: 11,
          score_b: 5,
          status: 'complete',
          round: 1,
          court: null,
        },
        {
          stage: 'league',
          team_a_id: 't3',
          team_b_id: 't4',
          score_a: 11,
          score_b: 5,
          status: 'complete',
          round: 2,
          court: null,
        },
      ],
      teams: mixedTeams,
      players: playersFixture,
    });
    // Alice (p1) wins both matches -- once on fixed team t1, once on ad-hoc team t3 --
    // for a 2-0 individual record. No single team has that record (t1 is 1-0, t3 is
    // 1-0), so a correct result here proves the champion is resolved per-player, not
    // per-team, for Custom League.
    expect(result).toBe('Alice');
  });

  it("returns the final match winner's team name for Custom League when a final exists, even though Custom's regular-season standings are per-player", () => {
    const result = computeTournamentChampionName({
      format: 'custom',
      completedAt: '2026-01-01T00:00:00Z',
      matches: [
        {
          stage: 'league',
          team_a_id: 't1',
          team_b_id: 't2',
          score_a: 11,
          score_b: 5,
          status: 'complete',
          round: 1,
          court: null,
        },
        {
          stage: 'final',
          team_a_id: 't1',
          team_b_id: 't2',
          score_a: 8,
          score_b: 11,
          status: 'complete',
          round: 1,
          court: null,
        },
      ],
      teams: teamsFixture,
      players: playersFixture,
    });
    // t1 (Alice/Bob) won the league stage and leads individual standings, but t2
    // (Carol/Dave) won the actual Final -- the champion must follow the Final.
    expect(result).toBe('Carol / Dave');
  });

  it('falls back to individual standings for Custom League when no final match was generated', () => {
    const result = computeTournamentChampionName({
      format: 'custom',
      completedAt: '2026-01-01T00:00:00Z',
      matches: [
        {
          stage: 'league',
          team_a_id: 't1',
          team_b_id: 't2',
          score_a: 11,
          score_b: 5,
          status: 'complete',
          round: 1,
          court: null,
        },
      ],
      teams: teamsFixture,
      players: playersFixture,
    });
    expect(result).toBe('Alice');
  });

  it('returns the top ladder standings player name for a ladder format', () => {
    const result = computeTournamentChampionName({
      format: 'claim_the_throne',
      completedAt: '2026-01-01T00:00:00Z',
      matches: [
        {
          stage: 'league',
          team_a_id: 't1',
          team_b_id: 't2',
          score_a: 11,
          score_b: 5,
          status: 'complete',
          round: 1,
          court: 1,
        },
      ],
      teams: teamsFixture,
      players: playersFixture,
    });
    expect(result).toBe('Alice');
  });
});

describe('computeTournamentChampionPersonIds', () => {
  it('returns undefined when the tournament is not completed', () => {
    const result = computeTournamentChampionPersonIds({
      format: 'round_robin',
      completedAt: null,
      matches: [
        {
          stage: 'league',
          team_a_id: 't1',
          team_b_id: 't2',
          score_a: 11,
          score_b: 5,
          status: 'complete',
          round: 1,
          court: null,
        },
      ],
      teams: [
        { id: 't1', person1Id: 'person-alice', person2Id: 'person-bob' },
        { id: 't2', person1Id: 'person-carol', person2Id: 'person-dave' },
      ],
    });
    expect(result).toBeUndefined();
  });

  it('returns both members of the winning team for a team-based format', () => {
    const result = computeTournamentChampionPersonIds({
      format: 'round_robin',
      completedAt: '2026-01-01T00:00:00Z',
      matches: [
        {
          stage: 'league',
          team_a_id: 't1',
          team_b_id: 't2',
          score_a: 11,
          score_b: 5,
          status: 'complete',
          round: 1,
          court: null,
        },
      ],
      teams: [
        { id: 't1', person1Id: 'person-alice', person2Id: 'person-bob' },
        { id: 't2', person1Id: 'person-carol', person2Id: 'person-dave' },
      ],
    });
    expect(result).toEqual(['person-alice', 'person-bob']);
  });

  // Regression test for a real bug: an individual-pairing format (Popcorn/Gauntlet)
  // re-pairs players into a fresh ad hoc "team" every round. Only the top individual
  // standings player is the actual champion — crediting both members of whichever
  // one-off pairing had the best win/loss (the old, ad hoc logic in the locations
  // leaderboard used to do this) wrongly awards a "League Won" to a player who just
  // happened to be someone's round partner.
  it('returns only the top individual-standings player for an individual format, not their ad hoc round partner', () => {
    const result = computeTournamentChampionPersonIds({
      format: 'popcorn',
      completedAt: '2026-01-01T00:00:00Z',
      matches: [
        {
          stage: 'league',
          team_a_id: 't1',
          team_b_id: 't2',
          score_a: 11,
          score_b: 5,
          status: 'complete',
          round: 1,
          court: null,
        },
      ],
      teams: [
        { id: 't1', person1Id: 'person-alice', person2Id: 'person-ziad' },
        { id: 't2', person1Id: 'person-carol', person2Id: 'person-dave' },
      ],
    });
    expect(result).toEqual(['person-alice']);
    expect(result).not.toContain('person-ziad');
  });
});
