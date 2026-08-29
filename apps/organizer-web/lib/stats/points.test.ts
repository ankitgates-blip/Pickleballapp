import { describe, it, expect } from 'vitest';
import { computePointsLeaderboard, type PointsTournament } from './points';
import type { RawMatch, RawTeam } from './types';

// Alice/Bob (team t1) beat Carol/Dave (team t2) 11-5 in a completed round_robin
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
    format: 'round_robin',
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
    expect(alice).toMatchObject({ leagueWins: 1, leagueWinPoints: 25, totalPoints: 35 });
    expect(bob).toMatchObject({ leagueWins: 1, leagueWinPoints: 25, totalPoints: 35 });
    expect(findEntry(entries, 'carol')?.leagueWins).toBe(0);
    expect(findEntry(entries, 'carol')?.totalPoints).toBe(0);
  });

  it('credits exactly one person for an individual-format league win', () => {
    const entries = computePointsLeaderboard({
      matches: [completeMatch],
      teams,
      tournaments: [sep1Tournament({ format: 'popcorn' })],
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
    expect(findEntry(entries, 'alice')?.totalPoints).toBe(35);
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
    expect(findEntry(entries, 'alice')?.totalPoints).toBe(35);
    expect(findEntry(entries, 'alice')?.matchesPlayed).toBe(1);
  });

  it("includes today's tournament in a month-to-date range", () => {
    const entries = computePointsLeaderboard({
      matches: [completeMatch],
      teams,
      tournaments: [sep1Tournament()], // dated 2026-09-05
      range: { start: '2026-09-01', endExclusive: '2026-09-06' },
    });
    expect(findEntry(entries, 'alice')?.totalPoints).toBe(35);
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
});
