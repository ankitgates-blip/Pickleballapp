import { describe, it, expect } from 'vitest';
import { computePointsLeaderboard, type PointsTournament } from './points';
import type { RawMatch, RawTeam } from './types';

// Alice/Bob (team t1) beat Carol/Dave (team t2) 11-5 in a completed league_playoffs
// league at Pickleturf on 2026-09-05.
const teams: RawTeam[] = [
  { id: 't1', tournamentId: 'sep1', player1PersonId: 'alice', player2PersonId: 'bob' },
  { id: 't2', tournamentId: 'sep1', player1PersonId: 'carol', player2PersonId: 'dave' },
];

const completeMatch: RawMatch = {
  tournamentId: 'sep1',
  tournamentDate: '2026-09-05',
  venueName: 'Pickleturf',
  teamAId: 't1',
  teamBId: 't2',
  scoreA: 11,
  scoreB: 5,
  status: 'complete',
};

function sep1Tournament(overrides: Partial<PointsTournament> = {}): PointsTournament {
  return {
    id: 'sep1',
    date: '2026-09-05',
    // league_playoffs (unlike a Final-less 'custom' league) always credits the league
    // win to both members of the winning team -- the simpler default for tests that
    // aren't specifically about individual-standings crediting.
    format: 'league_playoffs',
    completedAt: '2026-09-05T18:00:00Z',
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
      { id: 't1', person1Id: 'alice', person2Id: 'bob' },
      { id: 't2', person1Id: 'carol', person2Id: 'dave' },
    ],
    ...overrides,
  };
}

const SEPTEMBER = { start: '2026-09-01', endExclusive: '2026-10-01' };

function findEntry(entries: ReturnType<typeof computePointsLeaderboard>, personId: string) {
  return entries.find((e) => e.personId === personId);
}

describe('computePointsLeaderboard', () => {
  it('credits both winners of a doubles match 10 points each', () => {
    const tournament = sep1Tournament({ completedAt: null }); // no league bonus in play
    const entries = computePointsLeaderboard({
      matches: [completeMatch],
      teams,
      tournaments: [tournament],
      range: SEPTEMBER,
    });
    expect(findEntry(entries, 'alice')?.matchWinPoints).toBe(10);
    expect(findEntry(entries, 'bob')?.matchWinPoints).toBe(10);
    expect(findEntry(entries, 'alice')?.totalPoints).toBe(10);
    expect(findEntry(entries, 'bob')?.totalPoints).toBe(10);
  });

  it('gives losers zero points but still lists them', () => {
    const tournament = sep1Tournament({ completedAt: null });
    const entries = computePointsLeaderboard({
      matches: [completeMatch],
      teams,
      tournaments: [tournament],
      range: SEPTEMBER,
    });
    const carolEntry = findEntry(entries, 'carol');
    expect(carolEntry?.totalPoints).toBe(0);
    expect(carolEntry?.matchesPlayed).toBe(1);
    expect(carolEntry?.matchWins).toBe(0);
  });

  it('pays the league-win bonus to both teammates via the real champion function', () => {
    const entries = computePointsLeaderboard({
      matches: [completeMatch],
      teams,
      tournaments: [sep1Tournament()],
      range: SEPTEMBER,
    });
    const alice = findEntry(entries, 'alice');
    const bob = findEntry(entries, 'bob');
    expect(alice).toMatchObject({ leagueWins: 1, leagueWinPoints: 50, totalPoints: 60 });
    expect(bob).toMatchObject({ leagueWins: 1, leagueWinPoints: 50, totalPoints: 60 });
    expect(findEntry(entries, 'carol')?.leagueWins).toBe(0);
    expect(findEntry(entries, 'carol')?.totalPoints).toBe(0);
  });

  it('pays the 50-point league-win bonus under the custom format too', () => {
    const entries = computePointsLeaderboard({
      matches: [completeMatch],
      teams,
      tournaments: [sep1Tournament({ format: 'custom' })],
      range: SEPTEMBER,
    });
    // No Final stage in this fixture's matches -- 'custom' falls back to individual
    // standings, so only one of the two teammates is credited here (see the dedicated
    // test below). Assert the bonus VALUE is 50 regardless of who receives it.
    const winner = entries.find((e) => e.leagueWins > 0);
    expect(winner).toMatchObject({ leagueWinPoints: 50 });
  });

  it('credits exactly one person for a Custom League that never generated a Final', () => {
    // format 'custom' with only a 'league' stage match (no Final) uses individual
    // standings for the champion credit -- one person, not a team of two.
    const entries = computePointsLeaderboard({
      matches: [completeMatch],
      teams,
      tournaments: [sep1Tournament({ format: 'custom' })],
      range: SEPTEMBER,
    });
    const winners = entries.filter((e) => e.leagueWins > 0);
    expect(winners).toHaveLength(1);
  });

  it('pays no league bonus for an incomplete tournament, but still pays match points', () => {
    const entries = computePointsLeaderboard({
      matches: [completeMatch],
      teams,
      tournaments: [sep1Tournament({ completedAt: null })],
      range: SEPTEMBER,
    });
    for (const entry of entries) {
      expect(entry.leagueWinPoints).toBe(0);
    }
    expect(findEntry(entries, 'alice')?.totalPoints).toBe(10);
  });

  it('excludes a tournament dated in August, despite identical match data', () => {
    const augustMatch: RawMatch = { ...completeMatch, tournamentDate: '2026-08-05' };
    const augustTournament = sep1Tournament({ date: '2026-08-05' });
    const entries = computePointsLeaderboard({
      matches: [augustMatch],
      teams,
      tournaments: [augustTournament],
      range: { start: '2026-08-01', endExclusive: '2026-09-01' },
    });
    expect(entries).toEqual([]);
  });

  it('clamps a range straddling the cutover to the September-only portion', () => {
    const augustMatch: RawMatch = { ...completeMatch, tournamentId: 'aug1', tournamentDate: '2026-08-05' };
    const augustTeams: RawTeam[] = teams.map((t) => ({ ...t, tournamentId: 'aug1' }));
    const augustTournament = sep1Tournament({ id: 'aug1', date: '2026-08-05' });
    const septTournament = sep1Tournament();

    const entries = computePointsLeaderboard({
      matches: [augustMatch, completeMatch],
      teams: [...augustTeams, ...teams],
      tournaments: [augustTournament, septTournament],
      range: { start: '2026-08-01', endExclusive: '2026-10-01' },
    });
    // Only the September tournament counts -- August is invisible even though the
    // caller asked for it.
    expect(findEntry(entries, 'alice')?.totalPoints).toBe(60);
  });

  it('month-to-date excludes a tournament dated later in the same month', () => {
    const laterMatch: RawMatch = { ...completeMatch, tournamentId: 'sep2', tournamentDate: '2026-09-20' };
    const laterTeams: RawTeam[] = teams.map((t) => ({ ...t, tournamentId: 'sep2' }));
    const laterTournament = sep1Tournament({ id: 'sep2', date: '2026-09-20' });

    const entries = computePointsLeaderboard({
      matches: [completeMatch, laterMatch],
      teams: [...teams, ...laterTeams],
      tournaments: [sep1Tournament(), laterTournament],
      range: { start: '2026-09-01', endExclusive: '2026-09-16' },
    });
    expect(findEntry(entries, 'alice')?.totalPoints).toBe(60);
    expect(findEntry(entries, 'alice')?.matchesPlayed).toBe(1);
  });

  it("includes today's tournament in a month-to-date range", () => {
    const entries = computePointsLeaderboard({
      matches: [completeMatch],
      teams,
      tournaments: [sep1Tournament()], // dated 2026-09-05
      range: { start: '2026-09-01', endExclusive: '2026-09-06' },
    });
    expect(findEntry(entries, 'alice')?.totalPoints).toBe(60);
  });

  it('scores nothing for a pending match', () => {
    const pendingMatch: RawMatch = { ...completeMatch, status: 'pending' };
    const entries = computePointsLeaderboard({
      matches: [pendingMatch],
      teams,
      tournaments: [sep1Tournament({ completedAt: null })],
      range: SEPTEMBER,
    });
    expect(findEntry(entries, 'alice')).toBeUndefined();
  });

  it('sorts identical totals by personId ascending for deterministic output', () => {
    // Two independent tournaments, each a 10-point-only win for a different pair,
    // producing a genuine tie in totalPoints.
    const t2Match: RawMatch = {
      tournamentId: 'sep2',
      tournamentDate: '2026-09-06',
      venueName: 'Pickleturf',
      teamAId: 't3',
      teamBId: 't4',
      scoreA: 11,
      scoreB: 5,
      status: 'complete',
    };
    const t2Teams: RawTeam[] = [
      { id: 't3', tournamentId: 'sep2', player1PersonId: 'zeke', player2PersonId: 'yara' },
      { id: 't4', tournamentId: 'sep2', player1PersonId: 'wren', player2PersonId: 'vik' },
    ];
    const t2Tournament = sep1Tournament({
      id: 'sep2',
      date: '2026-09-06',
      completedAt: null,
      teams: [
        { id: 't3', person1Id: 'zeke', person2Id: 'yara' },
        { id: 't4', person1Id: 'wren', person2Id: 'vik' },
      ],
      matches: [
        { stage: 'league', team_a_id: 't3', team_b_id: 't4', score_a: 11, score_b: 5, status: 'complete', round: 1, court: null },
      ],
    });

    const entries = computePointsLeaderboard({
      matches: [completeMatch, t2Match],
      teams: [...teams, ...t2Teams],
      tournaments: [sep1Tournament({ completedAt: null }), t2Tournament],
      range: SEPTEMBER,
    });

    // alice, bob, zeke, yara all have totalPoints === 10 -- assert personId ascending
    // order among the tied entries.
    const tied = entries.filter((e) => e.totalPoints === 10).map((e) => e.personId);
    expect(tied).toEqual([...tied].sort());
  });

  it('returns an empty array for empty inputs', () => {
    expect(
      computePointsLeaderboard({ matches: [], teams: [], tournaments: [], range: SEPTEMBER })
    ).toEqual([]);
  });

  describe('shutout bonus', () => {
    const shutoutMatch: RawMatch = { ...completeMatch, scoreA: 11, scoreB: 0 };

    it('awards a 10-point bonus for an 11-0 win, folded into totalPoints', () => {
      const tournament = sep1Tournament({ completedAt: null }); // isolate from the league bonus
      const entries = computePointsLeaderboard({
        matches: [shutoutMatch],
        teams,
        tournaments: [tournament],
        range: SEPTEMBER,
      });
      expect(findEntry(entries, 'alice')).toMatchObject({
        shutoutWins: 1,
        shutoutBonusPoints: 10,
        matchWinPoints: 10,
        totalPoints: 20,
      });
    });

    it('stacks with no per-tournament cap across two 11-0 wins by the same team', () => {
      const secondShutout: RawMatch = {
        tournamentId: 'sep1',
        tournamentDate: '2026-09-05',
        venueName: 'Pickleturf',
        teamAId: 't1',
        teamBId: 't5',
        scoreA: 11,
        scoreB: 0,
        status: 'complete',
      };
      const t5Team: RawTeam = { id: 't5', tournamentId: 'sep1', player1PersonId: 'eve', player2PersonId: 'finn' };
      const tournament = sep1Tournament({
        completedAt: null,
        teams: [
          { id: 't1', person1Id: 'alice', person2Id: 'bob' },
          { id: 't2', person1Id: 'carol', person2Id: 'dave' },
          { id: 't5', person1Id: 'eve', person2Id: 'finn' },
        ],
        matches: [
          { stage: 'league', team_a_id: 't1', team_b_id: 't2', score_a: 11, score_b: 0, status: 'complete', round: 1, court: null },
          { stage: 'league', team_a_id: 't1', team_b_id: 't5', score_a: 11, score_b: 0, status: 'complete', round: 2, court: null },
        ],
      });
      const entries = computePointsLeaderboard({
        matches: [shutoutMatch, secondShutout],
        teams: [...teams, t5Team],
        tournaments: [tournament],
        range: SEPTEMBER,
      });
      expect(findEntry(entries, 'alice')).toMatchObject({ shutoutWins: 2, shutoutBonusPoints: 20 });
    });

    it('does not award the bonus for an 11-1 win (boundary check on the === 0 loser score)', () => {
      const closeMatch: RawMatch = { ...completeMatch, scoreA: 11, scoreB: 1 };
      const tournament = sep1Tournament({ completedAt: null });
      const entries = computePointsLeaderboard({
        matches: [closeMatch],
        teams,
        tournaments: [tournament],
        range: SEPTEMBER,
      });
      expect(findEntry(entries, 'alice')?.shutoutWins).toBe(0);
    });

    it('does not award the bonus to the losing side of an 11-0 game', () => {
      const tournament = sep1Tournament({ completedAt: null });
      const entries = computePointsLeaderboard({
        matches: [shutoutMatch],
        teams,
        tournaments: [tournament],
        range: SEPTEMBER,
      });
      expect(findEntry(entries, 'carol')?.shutoutWins).toBe(0);
    });
  });

  describe('format scoping', () => {
    it('pays zero points of any kind for a completed round_robin tournament, even with an 11-0 match and a champion', () => {
      const shutoutMatch: RawMatch = { ...completeMatch, scoreA: 11, scoreB: 0 };
      const tournament = sep1Tournament({ format: 'round_robin' });
      const entries = computePointsLeaderboard({
        matches: [shutoutMatch],
        teams,
        tournaments: [tournament],
        range: SEPTEMBER,
      });
      expect(findEntry(entries, 'alice')).toBeUndefined();
    });

    it('returns an empty array when every in-range tournament is a non-eligible format', () => {
      const entries = computePointsLeaderboard({
        matches: [completeMatch],
        teams,
        tournaments: [sep1Tournament({ format: 'popcorn' }), sep1Tournament({ id: 'sep2', format: 'gauntlet' })],
        range: SEPTEMBER,
      });
      expect(entries).toEqual([]);
    });
  });
});
