import { describe, it, expect } from 'vitest';
import {
  computeTournamentChampionName,
  computeTournamentRunnerUpName,
  computeTournamentChampionPersonIds,
  computeTournamentRunnerUpPersonIds,
} from './champion';

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

describe('computeTournamentRunnerUpName', () => {
  it('returns undefined when the tournament is not completed', () => {
    const result = computeTournamentRunnerUpName({
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

  it('returns the second-place standings team name for a team-based format with no final match', () => {
    const result = computeTournamentRunnerUpName({
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
    expect(result).toBe('Carol / Dave');
  });

  it("returns the final match loser's team name for league_playoffs when a final exists", () => {
    const result = computeTournamentRunnerUpName({
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
    expect(result).toBe('Carol / Dave');
  });

  it('skips the champion\'s own teammate (identical record) and returns the first genuinely distinct result for an individual format', () => {
    const result = computeTournamentRunnerUpName({
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
    // Champion is Alice (p1); her teammate Bob (p2) shares her identical 1-0 record
    // and is skipped, so the runner-up is Carol (p3), the first genuinely distinct result.
    expect(result).toBe('Carol');
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

describe('computeTournamentRunnerUpPersonIds', () => {
  it('returns undefined when the tournament is not completed', () => {
    const result = computeTournamentRunnerUpPersonIds({
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

  it('returns both members of the losing Final team for league_playoffs, even if that team won the league stage', () => {
    const result = computeTournamentRunnerUpPersonIds({
      format: 'league_playoffs',
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
      teams: [
        { id: 't1', person1Id: 'person-alice', person2Id: 'person-bob' },
        { id: 't2', person1Id: 'person-carol', person2Id: 'person-dave' },
      ],
    });
    // t1 (Alice/Bob) won the league stage but lost the Final -- they're the runner-up,
    // not t2 (the champion).
    expect(result).toEqual(['person-alice', 'person-bob']);
  });

  it('returns the 2nd-place team for a team-based format with no Final match', () => {
    const result = computeTournamentRunnerUpPersonIds({
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
    expect(result).toEqual(['person-carol', 'person-dave']);
  });

  it('falls back to 2nd-place individual standings for Custom League when no Final was generated', () => {
    const result = computeTournamentRunnerUpPersonIds({
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
      teams: [
        { id: 't1', person1Id: 'person-alice', person2Id: 'person-bob' },
        { id: 't2', person1Id: 'person-carol', person2Id: 'person-dave' },
      ],
    });
    // Alice (t1) tops individual standings from the single match; Bob is her fixed
    // doubles partner and shares her exact 1-0 record, so a naive "next row" pick
    // would wrongly return him as "runner-up". The real 2nd place is whoever from
    // the losing side (Carol/Dave) individual standings ranks first among them.
    expect(result).toHaveLength(1);
    expect(result![0]).not.toBe('person-bob');
    expect(['person-carol', 'person-dave']).toContain(result![0]);
  });

  it("never returns the champion's own fixed doubles partner as runner-up, even when they're tied on individual standings", () => {
    // t1 (Alice/Bob) wins both of its matches; t2 (Carol/Dave) and t3 (Erin/Frank)
    // each win one and lose one. Alice and Bob are tied 2-0 -- without the
    // same-team exclusion, whichever of them ISN'T picked as champion would land
    // in the very next standings row and get wrongly returned as "runner-up".
    const result = computeTournamentRunnerUpPersonIds({
      format: 'custom',
      completedAt: '2026-01-01T00:00:00Z',
      matches: [
        { stage: 'league', team_a_id: 't1', team_b_id: 't2', score_a: 11, score_b: 5, status: 'complete', round: 1, court: null },
        { stage: 'league', team_a_id: 't1', team_b_id: 't3', score_a: 11, score_b: 5, status: 'complete', round: 2, court: null },
        { stage: 'league', team_a_id: 't2', team_b_id: 't3', score_a: 11, score_b: 5, status: 'complete', round: 3, court: null },
      ],
      teams: [
        { id: 't1', person1Id: 'person-alice', person2Id: 'person-bob' },
        { id: 't2', person1Id: 'person-carol', person2Id: 'person-dave' },
        { id: 't3', person1Id: 'person-erin', person2Id: 'person-frank' },
      ],
    });
    expect(result).not.toBeUndefined();
    expect(result).toHaveLength(1);
    expect(result).not.toContain('person-alice');
    expect(result).not.toContain('person-bob');
    // Carol/Dave beat Erin/Frank, so Carol and Dave are the genuine 2nd-place pair.
    expect(['person-carol', 'person-dave']).toContain(result![0]);
  });

  it('returns the losing Final team for Custom League when a Final exists', () => {
    const result = computeTournamentRunnerUpPersonIds({
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
      teams: [
        { id: 't1', person1Id: 'person-alice', person2Id: 'person-bob' },
        { id: 't2', person1Id: 'person-carol', person2Id: 'person-dave' },
      ],
    });
    expect(result).toEqual(['person-alice', 'person-bob']);
  });
});
