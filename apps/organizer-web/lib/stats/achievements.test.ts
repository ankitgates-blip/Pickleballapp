import { describe, it, expect } from 'vitest';
import { computeAchievements, groupAchievementsByCategory, nextMilestones, type AchievementInputs } from './achievements';
import type { PersonMatchRecord } from './types';

function record(overrides: Partial<PersonMatchRecord> = {}): PersonMatchRecord {
  return {
    tournamentId: 't1',
    tournamentDate: '2026-09-05',
    venueName: 'Pickle Turf',
    partnerId: 'bob',
    opponentIds: ['carol', 'dave'],
    scoreFor: 11,
    scoreAgainst: 5,
    won: true,
    ...overrides,
  };
}

function baseInputs(overrides: Partial<AchievementInputs> = {}): AchievementInputs {
  return {
    matchHistory: [],
    weekly: [],
    monthly: [],
    yearly: [],
    tournamentsWon: [],
    matchesByLocation: [],
    toughestOpponent: null,
    bestPartner: null,
    winPercentage: null,
    winsVsHigherRated: 0,
    longestWinStreak: 0,
    totalPoints: 0,
    wonFormats: new Set(),
    playedFormats: new Set(),
    wonVenues: new Set(),
    reachedFinalCount: 0,
    eveningMatches: 0,
    morningMatches: 0,
    signupRank: null,
    wasEverPlayerOfTheMonth: false,
    wasEverMonthlyPointsLeader: false,
    wonWithLowerRatedPartner: false,
    ...overrides,
  };
}

function find(key: string, inputs: AchievementInputs) {
  return computeAchievements(inputs).find((a) => a.key === key);
}

describe('computeAchievements — catalog and evaluator mechanics', () => {
  it('returns exactly 50 badges', () => {
    expect(computeAchievements(baseInputs())).toHaveLength(50);
  });

  it('locks a laddered badge with a "x/firstThreshold" progress description', () => {
    const a = find('hot-streak', baseInputs({ longestWinStreak: 2 }))!;
    expect(a.earned).toBe(false);
    expect(a.tier).toBeNull();
    expect(a.description).toBe('2/3 wins in a row');
  });

  it('promotes through bronze/silver/gold/platinum tiers as the value crosses each threshold', () => {
    expect(find('hot-streak', baseInputs({ longestWinStreak: 3 }))!.tier).toBe('bronze');
    expect(find('hot-streak', baseInputs({ longestWinStreak: 5 }))!.tier).toBe('silver');
    expect(find('hot-streak', baseInputs({ longestWinStreak: 10 }))!.tier).toBe('gold');
    expect(find('hot-streak', baseInputs({ longestWinStreak: 20 }))!.tier).toBe('platinum');
  });

  it('shows the next threshold once earned, and no next threshold once maxed', () => {
    const silver = find('hot-streak', baseInputs({ longestWinStreak: 6 }))!;
    expect(silver.nextThreshold).toBe(10);
    expect(silver.description).toContain('next: 10');

    const maxed = find('hot-streak', baseInputs({ longestWinStreak: 25 }))!;
    expect(maxed.nextThreshold).toBeNull();
    expect(maxed.description).not.toContain('next:');
  });

  it('marks a single-threshold badge "special" (no bronze/silver/gold ladder) once earned', () => {
    const earned = find('welcome-to-the-club', baseInputs({ matchHistory: [record()] }))!;
    expect(earned.tier).toBe('special');
    const locked = find('welcome-to-the-club', baseInputs())!;
    expect(locked.tier).toBeNull();
  });

  it('groupAchievementsByCategory preserves catalog order and drops empty categories', () => {
    const groups = groupAchievementsByCategory(computeAchievements(baseInputs()));
    expect(groups.map((g) => g.category)).toEqual([
      'momentum',
      'competitive-edge',
      'durability',
      'location-loyalty',
      'championship-legacy',
      'format-mastery',
      'identity-habits',
      'extremes-consistency',
      'milestones',
    ]);
    expect(groups.every((g) => g.achievements.length > 0)).toBe(true);
  });

  it('nextMilestones ranks by closeness to the next threshold and excludes maxed badges', () => {
    const inputs = baseInputs({ longestWinStreak: 19, winsVsHigherRated: 0 }); // 19/20 platinum -- very close
    const list = nextMilestones(computeAchievements(inputs), 3);
    expect(list[0].key).toBe('hot-streak');
    expect(list.every((a) => a.nextThreshold !== null)).toBe(true);
  });
});

describe('computeAchievements — fairness-sensitive and derived-stat badges', () => {
  it('the-bagel only counts an 11-0 win, not an 11-1 win, from the winner’s oriented score', () => {
    const shutout = record({ scoreFor: 11, scoreAgainst: 0, won: true });
    const closeWin = record({ scoreFor: 11, scoreAgainst: 1, won: true });
    const shutoutLoss = record({ scoreFor: 0, scoreAgainst: 11, won: false });
    expect(find('the-bagel', baseInputs({ matchHistory: [shutout] }))!.value).toBe(1);
    expect(find('the-bagel', baseInputs({ matchHistory: [closeWin] }))!.value).toBe(0);
    expect(find('the-bagel', baseInputs({ matchHistory: [shutoutLoss] }))!.value).toBe(0);
  });

  it('iron-duo counts matches with the single most-played partner, not total matches', () => {
    const withBob = [record({ partnerId: 'bob' }), record({ partnerId: 'bob' })];
    const withEve = [record({ partnerId: 'eve' })];
    const a = find('iron-duo', baseInputs({ matchHistory: [...withBob, ...withEve] }))!;
    expect(a.value).toBe(2); // max(2 with bob, 1 with eve), not 3 total
  });

  it('rivalry-master counts wins against the single most-beaten opponent', () => {
    const vsCarolDave = [record({ opponentIds: ['carol', 'dave'], won: true }), record({ opponentIds: ['carol', 'dave'], won: true })];
    const vsEveFinn = [record({ opponentIds: ['eve', 'finn'], won: true })];
    const a = find('rivalry-master', baseInputs({ matchHistory: [...vsCarolDave, ...vsEveFinn] }))!;
    expect(a.value).toBe(2);
  });

  it('perfect-pair requires zero losses with that specific partner, not just a win-heavy record', () => {
    const perfectWithBob = [record({ partnerId: 'bob', won: true }), record({ partnerId: 'bob', won: true })];
    const mixedWithEve = [record({ partnerId: 'eve', won: true }), record({ partnerId: 'eve', won: false })];
    const a = find('perfect-pair', baseInputs({ matchHistory: [...perfectWithBob, ...mixedWithEve] }))!;
    expect(a.value).toBe(2); // bob's undefeated 2, not eve's 1-1
  });

  it('flawless-victory requires an entire WON tournament with zero losses, min 3 matches', () => {
    const wonTournamentUndefeated = [
      record({ tournamentId: 'w1', won: true }),
      record({ tournamentId: 'w1', won: true }),
      record({ tournamentId: 'w1', won: true }),
    ];
    const inputs = baseInputs({ matchHistory: wonTournamentUndefeated, tournamentsWon: [{ tournamentId: 'w1', date: '2026-09-05' }] });
    expect(find('flawless-victory', inputs)!.earned).toBe(true);

    const withALoss = [...wonTournamentUndefeated.slice(0, 2), record({ tournamentId: 'w1', won: false })];
    const inputsWithLoss = baseInputs({ matchHistory: withALoss, tournamentsWon: [{ tournamentId: 'w1', date: '2026-09-05' }] });
    expect(find('flawless-victory', inputsWithLoss)!.earned).toBe(false);
  });

  it('flawless-victory does not fire for a tournament that was undefeated but never won', () => {
    const undefeatedButNotWon = [
      record({ tournamentId: 'nw1', won: true }),
      record({ tournamentId: 'nw1', won: true }),
      record({ tournamentId: 'nw1', won: true }),
    ];
    const inputs = baseInputs({ matchHistory: undefeatedButNotWon, tournamentsWon: [] });
    expect(find('flawless-victory', inputs)!.earned).toBe(false);
  });

  it('perfect-league needs a longer undefeated run (5+) than flawless-victory (3+)', () => {
    const threeWins = [
      record({ tournamentId: 'w1', won: true }),
      record({ tournamentId: 'w1', won: true }),
      record({ tournamentId: 'w1', won: true }),
    ];
    const inputs = baseInputs({ matchHistory: threeWins, tournamentsWon: [{ tournamentId: 'w1', date: '2026-09-05' }] });
    expect(find('flawless-victory', inputs)!.earned).toBe(true);
    expect(find('perfect-league', inputs)!.earned).toBe(false);
  });

  it('trendsetter reads the single biggest upward month-over-month jump', () => {
    const monthly = [
      { period: '2026-08', gamesWon: 5, gamesLost: 5, tournamentsWon: 0, winPercentage: 70, trend: 'up' as const, trendPointsChange: 22 },
      { period: '2026-07', gamesWon: 5, gamesLost: 5, tournamentsWon: 0, winPercentage: 48, trend: 'down' as const, trendPointsChange: -5 },
    ];
    expect(find('trendsetter', baseInputs({ monthly }))!.value).toBe(22);
  });

  it('comeback-season detects a losing month immediately followed, chronologically, by a winning one', () => {
    // monthly is newest-first, so index 0 is the LATER month.
    const monthlyWithComeback = [
      { period: '2026-08', gamesWon: 6, gamesLost: 2, tournamentsWon: 0, winPercentage: 75, trend: 'up' as const, trendPointsChange: 40 },
      { period: '2026-07', gamesWon: 2, gamesLost: 6, tournamentsWon: 0, winPercentage: 25, trend: null, trendPointsChange: null },
    ];
    expect(find('comeback-season', baseInputs({ monthly: monthlyWithComeback }))!.earned).toBe(true);

    const monthlyAlwaysWinning = [
      { period: '2026-08', gamesWon: 6, gamesLost: 2, tournamentsWon: 0, winPercentage: 75, trend: 'flat' as const, trendPointsChange: 0 },
      { period: '2026-07', gamesWon: 6, gamesLost: 2, tournamentsWon: 0, winPercentage: 75, trend: null, trendPointsChange: null },
    ];
    expect(find('comeback-season', baseInputs({ monthly: monthlyAlwaysWinning }))!.earned).toBe(false);
  });

  it('iron-wall inverts average points conceded so a LOWER average scores HIGHER', () => {
    const stingyDefense = [record({ scoreAgainst: 2 }), record({ scoreAgainst: 4 }), record({ scoreAgainst: 3 })];
    const leakyDefense = [record({ scoreAgainst: 9 }), record({ scoreAgainst: 8 }), record({ scoreAgainst: 10 })];
    const stingy = find('iron-wall', baseInputs({ matchHistory: stingyDefense }))!;
    const leaky = find('iron-wall', baseInputs({ matchHistory: leakyDefense }))!;
    expect(stingy.value).toBeGreaterThan(leaky.value);
    expect(stingy.earned).toBe(true);
    expect(leaky.earned).toBe(false);
  });

  it('both-sides-of-the-river reads the count of distinct venues won at, supplied by the caller', () => {
    expect(find('both-sides-of-the-river', baseInputs({ wonVenues: new Set(['Pickle Turf']) }))!.earned).toBe(false);
    expect(find('both-sides-of-the-river', baseInputs({ wonVenues: new Set(['Pickle Turf', 'Picklers']) }))!.earned).toBe(true);
  });

  it('format-specific championship badges only fire for their own format', () => {
    const wonRoundRobinOnly = baseInputs({ wonFormats: new Set(['round_robin']) });
    expect(find('round-robin-royalty', wonRoundRobinOnly)!.earned).toBe(true);
    expect(find('popcorn-pro', wonRoundRobinOnly)!.earned).toBe(false);
  });

  it('ladder-legend fires for either ladder format', () => {
    expect(find('ladder-legend', baseInputs({ wonFormats: new Set(['claim_the_throne']) }))!.earned).toBe(true);
    expect(find('ladder-legend', baseInputs({ wonFormats: new Set(['up_and_down_the_river']) }))!.earned).toBe(true);
    expect(find('ladder-legend', baseInputs({ wonFormats: new Set(['popcorn']) }))!.earned).toBe(false);
  });

  it('format-master counts distinct formats WON, jack-of-all-trades counts distinct formats PLAYED', () => {
    const inputs = baseInputs({
      wonFormats: new Set(['round_robin', 'popcorn']),
      playedFormats: new Set(['round_robin', 'popcorn', 'gauntlet', 'custom']),
    });
    expect(find('format-master', inputs)!.value).toBe(2);
    expect(find('jack-of-all-trades', inputs)!.value).toBe(4);
  });

  it('founding-member only fires within the first 10 signup ranks', () => {
    expect(find('founding-member', baseInputs({ signupRank: 10 }))!.earned).toBe(true);
    expect(find('founding-member', baseInputs({ signupRank: 11 }))!.earned).toBe(false);
    expect(find('founding-member', baseInputs({ signupRank: null }))!.earned).toBe(false);
  });

  it('road-warrior compares away win% to home win% and requires a real away sample', () => {
    const strongerAway = baseInputs({
      matchesByLocation: [
        { location: 'Pickle Turf', count: 10, wins: 5 }, // home, 50%
        { location: 'Picklers', count: 4, wins: 3 }, // away, 75%
      ],
    });
    expect(find('road-warrior', strongerAway)!.earned).toBe(true);

    const thinAwaySample = baseInputs({
      matchesByLocation: [
        { location: 'Pickle Turf', count: 10, wins: 5 },
        { location: 'Picklers', count: 1, wins: 1 }, // 100% but only 1 match -- below MIN_SAMPLE
      ],
    });
    expect(find('road-warrior', thinAwaySample)!.earned).toBe(false);
  });
});
