import type { HeadToHeadRecord, LocationCount, PeriodStats, PersonMatchRecord, TournamentWon } from './types';

export type AchievementCategory =
  | 'momentum'
  | 'competitive-edge'
  | 'durability'
  | 'location-loyalty'
  | 'championship-legacy'
  | 'format-mastery'
  | 'identity-habits'
  | 'extremes-consistency'
  | 'milestones';

export type AchievementTierName = 'bronze' | 'silver' | 'gold' | 'platinum';

export type Achievement = {
  key: string;
  emoji: string;
  label: string;
  category: AchievementCategory;
  description: string;
  earned: boolean;
  // 'special' = a single-tier badge (no bronze/silver/gold ladder) that's been earned.
  tier: AchievementTierName | 'special' | null;
  tierIndex: number; // 0 = locked; otherwise a 1-based index into the badge's own thresholds
  value: number;
  nextThreshold: number | null;
};

/**
 * Everything computeAchievements needs, in one shape. The first group is exactly what
 * lib/stats/personStats.ts already produces (PersonStats) plus winStreak.ts/
 * winsVsHigherRated.ts's outputs. The second group is genuinely cross-cutting -- it
 * needs data outside one person's own match/tournament rows (every tournament's
 * format/venue/timeslot, every organizer's people list, every past month's points
 * leaderboard and Player of the Month winner) -- so the caller supplies it rather than
 * this file re-deriving it from scratch. Both call sites (app/p/[id]/page.tsx,
 * app/people/[id]/page.tsx) build this same shape via buildAchievementInputs below, so
 * they can't silently drift on what feeds the calculation.
 */
export type AchievementInputs = {
  matchHistory: PersonMatchRecord[];
  weekly: PeriodStats[];
  monthly: PeriodStats[];
  yearly: PeriodStats[];
  tournamentsWon: TournamentWon[];
  matchesByLocation: LocationCount[];
  toughestOpponent: HeadToHeadRecord | null;
  bestPartner: HeadToHeadRecord | null;
  winPercentage: number | null;
  winsVsHigherRated: number;
  longestWinStreak: number;

  // Cross-cutting -- supplied by the caller.
  totalPoints: number; // lifetime Total Points (computePointsLeaderboard, all-time range)
  wonFormats: ReadonlySet<string>; // tournament formats this person has WON at least one of
  playedFormats: ReadonlySet<string>; // tournament formats this person has played at all
  wonVenues: ReadonlySet<string>; // venues this person has won a league at
  reachedFinalCount: number; // number of stage === 'final' matches played, any format
  eveningMatches: number;
  morningMatches: number;
  signupRank: number | null; // 1-based, among this organizer's people ordered by created_at
  wasEverPlayerOfTheMonth: boolean; // won the actual Player of the Month award at least once
  wasEverMonthlyPointsLeader: boolean; // topped a month's Total Points leaderboard at least once
  wonWithLowerRatedPartner: boolean; // at least one win where the partner's overall win% trailed yours materially
};

type AchievementDefinition = {
  key: string;
  emoji: string;
  label: string;
  category: AchievementCategory;
  unit: string; // progress copy, e.g. "wins in a row"
  value: (input: AchievementInputs) => number;
  // 1 threshold = single-tier "special edition" badge. 2-4 thresholds = bronze/silver/gold/(platinum).
  thresholds: readonly number[];
};

// Matches this codebase's own MIN_MATCHES_PLAYED convention (lib/stats/playerOfTheMonth.ts)
// -- a floor so a 1-0 fluke can't qualify a badge meant to signal a real sample.
const MIN_SAMPLE = 3;

function winRate(record: { wins: number; losses: number }): number {
  const total = record.wins + record.losses;
  return total === 0 ? 0 : record.wins / total;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function bestPeriodWinPercentage(periods: PeriodStats[]): number {
  let best = 0;
  for (const p of periods) {
    if (p.winPercentage !== null && p.gamesWon + p.gamesLost >= MIN_SAMPLE) {
      best = Math.max(best, p.winPercentage);
    }
  }
  return best;
}

// Full per-partner / per-opponent tally, not just the single best/toughest result
// personStats.ts already reduces to -- Iron Duo, Rivalry Master, Solo No More, and
// Perfect Pair all need the whole table, not just its extremum.
function tallyBy(
  matches: PersonMatchRecord[],
  getIds: (m: PersonMatchRecord) => string[]
): Map<string, { wins: number; losses: number }> {
  const table = new Map<string, { wins: number; losses: number }>();
  for (const m of matches) {
    for (const id of getIds(m)) {
      const row = table.get(id) ?? { wins: 0, losses: 0 };
      if (m.won) row.wins += 1;
      else row.losses += 1;
      table.set(id, row);
    }
  }
  return table;
}

function maxTallyCount(table: Map<string, { wins: number; losses: number }>): number {
  let max = 0;
  for (const { wins, losses } of table.values()) max = Math.max(max, wins + losses);
  return max;
}

function maxOpponentWins(matches: PersonMatchRecord[]): number {
  const table = tallyBy(matches, (m) => m.opponentIds);
  let max = 0;
  for (const { wins } of table.values()) max = Math.max(max, wins);
  return max;
}

// A specific partnership with zero losses and a real sample size -- not this person's
// overall record, one particular pairing's record. Distinct from Flawless Victory (one
// tournament, any partner) and Dream Team (best win RATE, not necessarily perfect).
function bestPerfectPartnerWins(matches: PersonMatchRecord[]): number {
  const table = tallyBy(matches, (m) => [m.partnerId]);
  let max = 0;
  for (const { wins, losses } of table.values()) {
    if (losses === 0) max = Math.max(max, wins);
  }
  return max;
}

// True if this person went undefeated across one entire WON tournament with at least
// `minMatches` matches in it -- computed from matchHistory grouped by tournamentId, no
// caller-supplied stage/format data needed.
function wonAnUndefeatedTournament(
  matchHistory: PersonMatchRecord[],
  tournamentsWon: TournamentWon[],
  minMatches: number
): boolean {
  const wonIds = new Set(tournamentsWon.map((t) => t.tournamentId));
  const byTournament = new Map<string, PersonMatchRecord[]>();
  for (const m of matchHistory) {
    if (!wonIds.has(m.tournamentId)) continue;
    const arr = byTournament.get(m.tournamentId) ?? [];
    arr.push(m);
    byTournament.set(m.tournamentId, arr);
  }
  for (const records of byTournament.values()) {
    if (records.length >= minMatches && records.every((r) => r.won)) return true;
  }
  return false;
}

// Best month-over-month win% jump ever recorded (Trendsetter) vs. whether any month
// with a losing record was immediately followed, chronologically, by a winning one
// (Comeback Season) -- two different questions over the same monthly array. `monthly`
// is sorted newest-first (see personStats.ts's buildPeriods), so index i+1 is
// chronologically BEFORE index i.
function bestMonthlyJump(monthly: PeriodStats[]): number {
  let best = 0;
  for (const m of monthly) {
    if (m.trend === 'up' && m.trendPointsChange !== null) best = Math.max(best, m.trendPointsChange);
  }
  return best;
}

function hadLosingToWinningMonth(monthly: PeriodStats[]): boolean {
  for (let i = 0; i < monthly.length - 1; i++) {
    const later = monthly[i];
    const earlier = monthly[i + 1];
    if (
      earlier.winPercentage !== null &&
      later.winPercentage !== null &&
      earlier.winPercentage < 50 &&
      later.winPercentage >= 50
    ) {
      return true;
    }
  }
  return false;
}

// "Steadiest" = smallest swing, so a LOW input should score HIGH against the threshold
// -- inverted the same way Iron Wall inverts average points conceded.
function steadiestSwingScore(monthly: PeriodStats[]): number {
  const swings = monthly
    .map((m) => m.trendPointsChange)
    .filter((v): v is number => v !== null)
    .map((v) => Math.abs(v));
  if (swings.length < MIN_SAMPLE) return 0;
  return Math.max(0, 20 - Math.max(...swings));
}

const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = [
  // --- Momentum -------------------------------------------------------
  { key: 'hot-streak', emoji: '🔥', label: 'Hot Streak', category: 'momentum', unit: 'wins in a row', value: (i) => i.longestWinStreak, thresholds: [3, 5, 10, 20] },
  { key: 'trendsetter', emoji: '📈', label: 'Trendsetter', category: 'momentum', unit: 'pt month-over-month jump', value: (i) => bestMonthlyJump(i.monthly), thresholds: [15] },
  { key: 'weekly-warrior', emoji: '📅', label: 'Weekly Warrior', category: 'momentum', unit: '% in your best week', value: (i) => bestPeriodWinPercentage(i.weekly), thresholds: [80] },
  { key: 'yearly-dominator', emoji: '🗓️', label: 'Yearly Dominator', category: 'momentum', unit: '% in your best year', value: (i) => bestPeriodWinPercentage(i.yearly), thresholds: [70] },
  { key: 'undefeated-month', emoji: '💯', label: 'Undefeated Month', category: 'momentum', unit: '100% months', value: (i) => i.monthly.filter((m) => m.winPercentage === 100 && m.gamesWon >= MIN_SAMPLE).length, thresholds: [1] },

  // --- Competitive Edge -------------------------------------------------
  { key: 'giant-slayer', emoji: '⚔️', label: 'Giant Slayer', category: 'competitive-edge', unit: 'wins vs higher-rated', value: (i) => i.winsVsHigherRated, thresholds: [1, 3, 7, 15] },
  { key: 'clutch', emoji: '🎯', label: 'Clutch', category: 'competitive-edge', unit: 'wins by 2 points', value: (i) => i.matchHistory.filter((m) => m.won && m.scoreFor - m.scoreAgainst === 2).length, thresholds: [1, 5, 12, 25] },
  { key: 'danger-zone', emoji: '👑', label: 'Court Dominator', category: 'competitive-edge', unit: 'reached Court Dominator', value: (i) => (i.winPercentage !== null && i.winPercentage >= 91 ? 1 : 0), thresholds: [1] },
  { key: 'the-bagel', emoji: '🥯', label: 'The Bagel', category: 'competitive-edge', unit: 'shutout (11-0) wins', value: (i) => i.matchHistory.filter((m) => m.won && m.scoreFor === 11 && m.scoreAgainst === 0).length, thresholds: [1, 5, 15] },
  { key: 'big-winner', emoji: '💥', label: 'Big Winner', category: 'competitive-edge', unit: 'best win margin', value: (i) => Math.max(0, ...i.matchHistory.filter((m) => m.won).map((m) => m.scoreFor - m.scoreAgainst)), thresholds: [9] },

  // --- Durability -----------------------------------------------------
  { key: 'century-club', emoji: '🏋️', label: 'Century Club', category: 'durability', unit: 'matches played', value: (i) => i.matchHistory.length, thresholds: [10, 20, 50, 100] },
  { key: 'regular', emoji: '🔁', label: 'Regular', category: 'durability', unit: 'tournaments attended', value: (i) => new Set(i.matchHistory.map((m) => m.tournamentId)).size, thresholds: [5, 15, 30] },
  { key: 'first-blood', emoji: '🩸', label: 'First Blood', category: 'durability', unit: 'won your 1st match', value: (i) => (i.matchHistory.length > 0 && i.matchHistory[i.matchHistory.length - 1]?.won ? 1 : 0), thresholds: [1] },

  // --- Location & Loyalty -----------------------------------------------
  { key: 'court-hopper', emoji: '🗺️', label: 'Court Hopper', category: 'location-loyalty', unit: 'venues played', value: (i) => i.matchesByLocation.filter((l) => l.count >= MIN_SAMPLE).length, thresholds: [2] },
  { key: 'both-sides-of-the-river', emoji: '🌉', label: 'Both Sides of the River', category: 'location-loyalty', unit: 'venues won a league at', value: (i) => i.wonVenues.size, thresholds: [2] },
  { key: 'dream-team', emoji: '🤝', label: 'Dream Team', category: 'location-loyalty', unit: '% win rate with one partner', value: (i) => (i.bestPartner && i.bestPartner.wins + i.bestPartner.losses >= 5 ? Math.round(winRate(i.bestPartner) * 100) : 0), thresholds: [80] },
  { key: 'iron-duo', emoji: '👯', label: 'Iron Duo', category: 'location-loyalty', unit: 'matches with one partner', value: (i) => maxTallyCount(tallyBy(i.matchHistory, (m) => [m.partnerId])), thresholds: [5, 12, 25] },
  { key: 'rivalry-master', emoji: '🗡️', label: 'Rivalry Master', category: 'location-loyalty', unit: 'wins vs one opponent', value: (i) => maxOpponentWins(i.matchHistory), thresholds: [3, 5, 10] },
  { key: 'revenge', emoji: '😤', label: 'Revenge', category: 'location-loyalty', unit: 'beaten your nemesis', value: (i) => (i.toughestOpponent && i.toughestOpponent.wins > 0 ? 1 : 0), thresholds: [1] },

  // --- Championship & Legacy -----------------------------------------------
  { key: 'dynasty', emoji: '🏆', label: 'Dynasty', category: 'championship-legacy', unit: 'leagues won', value: (i) => i.tournamentsWon.length, thresholds: [1, 3, 6] },
  { key: 'monthly-champion', emoji: '👑', label: 'Monthly Champion', category: 'championship-legacy', unit: 'Player of the Month wins', value: (i) => (i.wasEverPlayerOfTheMonth ? 1 : 0), thresholds: [1] },
  { key: 'point-machine', emoji: '💰', label: 'Point Machine', category: 'championship-legacy', unit: 'lifetime points', value: (i) => i.totalPoints, thresholds: [100, 500, 1000] },
  { key: 'perfect-league', emoji: '🧹', label: 'Perfect League', category: 'championship-legacy', unit: 'undefeated 5+ match title', value: (i) => (wonAnUndefeatedTournament(i.matchHistory, i.tournamentsWon, 5) ? 1 : 0), thresholds: [1] },
  { key: 'went-the-distance', emoji: '🎖️', label: 'Went the Distance', category: 'championship-legacy', unit: 'won after reaching a Final', value: (i) => (i.reachedFinalCount > 0 && i.tournamentsWon.length > 0 ? 1 : 0), thresholds: [1] },
  { key: 'flawless-victory', emoji: '✨', label: 'Flawless Victory', category: 'championship-legacy', unit: 'undefeated title', value: (i) => (wonAnUndefeatedTournament(i.matchHistory, i.tournamentsWon, 3) ? 1 : 0), thresholds: [1] },

  // --- Format Mastery ---------------------------------------------------
  { key: 'round-robin-royalty', emoji: '🔄', label: 'Round Robin Royalty', category: 'format-mastery', unit: 'Round Robin won', value: (i) => (i.wonFormats.has('round_robin') ? 1 : 0), thresholds: [1] },
  { key: 'popcorn-pro', emoji: '🍿', label: 'Popcorn Pro', category: 'format-mastery', unit: 'Popcorn won', value: (i) => (i.wonFormats.has('popcorn') ? 1 : 0), thresholds: [1] },
  { key: 'gauntlet-gladiator', emoji: '🥊', label: 'Gauntlet Gladiator', category: 'format-mastery', unit: 'Gauntlet won', value: (i) => (i.wonFormats.has('gauntlet') ? 1 : 0), thresholds: [1] },
  { key: 'ladder-legend', emoji: '🪜', label: 'Ladder Legend', category: 'format-mastery', unit: 'a ladder format won', value: (i) => (i.wonFormats.has('claim_the_throne') || i.wonFormats.has('up_and_down_the_river') ? 1 : 0), thresholds: [1] },
  { key: 'cream-of-the-crop-badge', emoji: '🍦', label: 'Cream of the Crop', category: 'format-mastery', unit: 'Cream of the Crop won', value: (i) => (i.wonFormats.has('cream_of_the_crop') ? 1 : 0), thresholds: [1] },
  { key: 'double-header-hero', emoji: '🎽', label: 'Double Header Hero', category: 'format-mastery', unit: 'Double Header won', value: (i) => (i.wonFormats.has('double_header') ? 1 : 0), thresholds: [1] },
  { key: 'custom-champion', emoji: '🛠️', label: 'Custom Champion', category: 'format-mastery', unit: 'Custom League won', value: (i) => (i.wonFormats.has('custom') ? 1 : 0), thresholds: [1] },
  { key: 'grand-finalist', emoji: '🏁', label: 'Grand Finalist', category: 'format-mastery', unit: 'Finals reached', value: (i) => i.reachedFinalCount, thresholds: [1, 3, 6] },
  { key: 'format-master', emoji: '🌐', label: 'Format Master', category: 'format-mastery', unit: 'distinct formats won', value: (i) => i.wonFormats.size, thresholds: [2, 4] },
  { key: 'jack-of-all-trades', emoji: '🎓', label: 'Jack of All Trades', category: 'format-mastery', unit: 'distinct formats played', value: (i) => i.playedFormats.size, thresholds: [3, 5] },

  // --- Identity & Habits ------------------------------------------------
  { key: 'night-owl', emoji: '🦉', label: 'Night Owl', category: 'identity-habits', unit: 'evening matches', value: (i) => i.eveningMatches, thresholds: [10, 25] },
  { key: 'early-bird', emoji: '🌅', label: 'Early Bird', category: 'identity-habits', unit: 'morning matches', value: (i) => i.morningMatches, thresholds: [10, 25] },
  { key: 'home-court-advantage', emoji: '🏠', label: 'Home Court Advantage', category: 'identity-habits', unit: '% at your main venue', value: (i) => { const home = i.matchesByLocation[0]; return home && home.count >= MIN_SAMPLE ? Math.round((home.wins / home.count) * 100) : 0; }, thresholds: [70] },
  { key: 'road-warrior', emoji: '✈️', label: 'Road Warrior', category: 'identity-habits', unit: 'away win% beats home', value: (i) => { const [home, away] = i.matchesByLocation; if (!home || !away || away.count < MIN_SAMPLE) return 0; return away.wins / away.count > home.wins / home.count ? 1 : 0; }, thresholds: [1] },
  { key: 'veteran', emoji: '📆', label: 'Veteran', category: 'identity-habits', unit: 'months active', value: (i) => { if (i.matchHistory.length === 0) return 0; const dates = i.matchHistory.map((m) => m.tournamentDate).sort(); const first = new Date(`${dates[0]}T00:00:00Z`); const last = new Date(`${dates[dates.length - 1]}T00:00:00Z`); return Math.max(0, Math.round((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24 * 30))); }, thresholds: [3, 8, 18] },
  { key: 'founding-member', emoji: '🌱', label: 'Founding Member', category: 'identity-habits', unit: 'one of the first 10', value: (i) => (i.signupRank !== null && i.signupRank <= 10 ? 1 : 0), thresholds: [1] },
  { key: 'solo-no-more', emoji: '🔀', label: 'Solo No More', category: 'identity-habits', unit: 'distinct partners', value: (i) => new Set(i.matchHistory.map((m) => m.partnerId)).size, thresholds: [3, 6] },

  // --- Extremes & Consistency ---------------------------------------------
  { key: 'sharp-shooter', emoji: '🎯', label: 'Sharp Shooter', category: 'extremes-consistency', unit: 'avg points scored', value: (i) => (i.matchHistory.length >= MIN_SAMPLE ? Math.round(average(i.matchHistory.map((m) => m.scoreFor)) * 10) / 10 : 0), thresholds: [8.5] },
  { key: 'iron-wall', emoji: '🧱', label: 'Iron Wall', category: 'extremes-consistency', unit: 'avg points conceded (lower is better)', value: (i) => { if (i.matchHistory.length < MIN_SAMPLE) return 0; return Math.max(0, Math.round((11 - average(i.matchHistory.map((m) => m.scoreAgainst))) * 10) / 10); }, thresholds: [5] },
  { key: 'steady-hand', emoji: '📉', label: 'Steady Hand', category: 'extremes-consistency', unit: 'consistency score', value: (i) => steadiestSwingScore(i.monthly), thresholds: [12] },
  { key: 'mentor', emoji: '🧑‍🏫', label: 'Mentor', category: 'extremes-consistency', unit: 'carried a weaker partner', value: (i) => (i.wonWithLowerRatedPartner ? 1 : 0), thresholds: [1] },
  { key: 'comeback-season', emoji: '🔄', label: 'Comeback Season', category: 'extremes-consistency', unit: 'losing month → winning month', value: (i) => (hadLosingToWinningMonth(i.monthly) ? 1 : 0), thresholds: [1] },

  // --- Milestones -----------------------------------------------------
  { key: 'welcome-to-the-club', emoji: '👋', label: 'Welcome to the Club', category: 'milestones', unit: 'played your 1st tournament', value: (i) => (new Set(i.matchHistory.map((m) => m.tournamentId)).size > 0 ? 1 : 0), thresholds: [1] },
  { key: 'monthly-points-leader', emoji: '📊', label: 'Monthly Points Leader', category: 'milestones', unit: 'months topped', value: (i) => (i.wasEverMonthlyPointsLeader ? 1 : 0), thresholds: [1] },
  { key: 'perfect-pair', emoji: '💞', label: 'Perfect Pair', category: 'milestones', unit: 'wins, undefeated together', value: (i) => bestPerfectPartnerWins(i.matchHistory), thresholds: [5] },
];

function tierNameFor(tierIndex: number, thresholdCount: number): AchievementTierName | 'special' {
  if (thresholdCount === 1) return 'special';
  return (['bronze', 'silver', 'gold', 'platinum'] as const)[tierIndex - 1];
}

export function computeAchievements(input: AchievementInputs): Achievement[] {
  return ACHIEVEMENT_CATALOG.map((def) => {
    const value = def.value(input);
    let tierIndex = 0;
    for (let i = 0; i < def.thresholds.length; i++) {
      if (value >= def.thresholds[i]) tierIndex = i + 1;
    }
    const earned = tierIndex > 0;
    const nextThreshold = tierIndex < def.thresholds.length ? def.thresholds[tierIndex] : null;
    const flooredValue = Math.min(value, def.thresholds[0]);

    const description = earned
      ? nextThreshold !== null
        ? `${value} ${def.unit} · next: ${nextThreshold}`
        : `${value} ${def.unit}`
      : `${flooredValue}/${def.thresholds[0]} ${def.unit}`;

    return {
      key: def.key,
      emoji: def.emoji,
      label: def.label,
      category: def.category,
      description,
      earned,
      tier: earned ? tierNameFor(tierIndex, def.thresholds.length) : null,
      tierIndex,
      value,
      nextThreshold,
    };
  });
}

/** Group a computed achievement list by category, in catalog order within each group. */
export function groupAchievementsByCategory(
  list: Achievement[]
): { category: AchievementCategory; achievements: Achievement[] }[] {
  const order: AchievementCategory[] = [
    'momentum',
    'competitive-edge',
    'durability',
    'location-loyalty',
    'championship-legacy',
    'format-mastery',
    'identity-habits',
    'extremes-consistency',
    'milestones',
  ];
  return order
    .map((category) => ({ category, achievements: list.filter((a) => a.category === category) }))
    .filter((g) => g.achievements.length > 0);
}

/** Locked-or-partial achievements closest to their next threshold, gold/platinum-complete
 * excluded, for a "next milestones" summary strip. Ties break on key for determinism,
 * matching this codebase's own tiebreak convention (lib/stats/points.ts). */
export function nextMilestones(list: Achievement[], limit: number): Achievement[] {
  return list
    .filter((a) => a.nextThreshold !== null)
    .sort((a, b) => {
      const aRatio = a.value / (a.nextThreshold as number);
      const bRatio = b.value / (b.nextThreshold as number);
      if (bRatio !== aRatio) return bRatio - aRatio;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    })
    .slice(0, limit);
}
