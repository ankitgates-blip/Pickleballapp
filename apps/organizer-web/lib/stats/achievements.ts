export type Achievement = {
  key: string;
  emoji: string;
  label: string;
  description: string;
  earned: boolean;
};

const HOT_STREAK_THRESHOLD = 5;
const GIANT_SLAYER_THRESHOLD = 3;
const IRON_PLAYER_THRESHOLD = 20;

// Simple milestone badges built entirely from stats already computed elsewhere on the
// profile pages (longestWinStreak, winsVsHigherRated, match count, career league wins)
// -- no new data fetching required. Locked badges show progress toward the threshold
// rather than disappearing, so there's always something to work toward.
export function computeAchievements(params: {
  longestWinStreak: number;
  winsVsHigherRated: number;
  totalMatches: number;
  careerLeaguesWon: number;
}): Achievement[] {
  const { longestWinStreak, winsVsHigherRated, totalMatches, careerLeaguesWon } = params;

  return [
    {
      key: 'hot-streak',
      emoji: '🔥',
      label: 'Hot Streak',
      description: `${Math.min(longestWinStreak, HOT_STREAK_THRESHOLD)}/${HOT_STREAK_THRESHOLD} wins in a row`,
      earned: longestWinStreak >= HOT_STREAK_THRESHOLD,
    },
    {
      key: 'giant-slayer',
      emoji: '⚔️',
      label: 'Giant Slayer',
      description: `${Math.min(winsVsHigherRated, GIANT_SLAYER_THRESHOLD)}/${GIANT_SLAYER_THRESHOLD} wins vs higher-rated`,
      earned: winsVsHigherRated >= GIANT_SLAYER_THRESHOLD,
    },
    {
      key: 'iron-player',
      emoji: '🏋️',
      label: 'Iron Player',
      description: `${Math.min(totalMatches, IRON_PLAYER_THRESHOLD)}/${IRON_PLAYER_THRESHOLD} matches played`,
      earned: totalMatches >= IRON_PLAYER_THRESHOLD,
    },
    {
      key: 'champion',
      emoji: '🏆',
      label: 'Champion',
      description:
        careerLeaguesWon > 0
          ? `${careerLeaguesWon} league${careerLeaguesWon === 1 ? '' : 's'} won`
          : 'Win a league',
      earned: careerLeaguesWon > 0,
    },
  ];
}
