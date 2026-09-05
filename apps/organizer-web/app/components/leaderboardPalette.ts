// Shared color constants for the leaderboard card family (LocationLeaderboardShareCard,
// RaceLeaderboardShareCard, LeaderboardTable) -- these three all render the same
// "all-navy" leaderboard visual identity the organizer explicitly asked for (see
// LocationLeaderboardShareCard.tsx's file comment for the full history), and must not
// visually diverge without a stated reason. Extracted here so a color change is made
// once, not three times.

export const NAVY_MID = '#16294e';
export const NAVY_DEEP = '#0c1830';
export const NAVY_DARKER = '#0a1730';
export const NAVY_RULE = '#24406f';
export const PLATE = '#081328';
export const PLATE_STROKE = '#2c4a7d';
export const ON_NAVY_PRIMARY = '#ffffff';
export const ON_NAVY_SECOND = '#b8c8de';
export const ON_NAVY_MUTED = '#8ea6c8';
export const ON_NAVY_FAINT = '#5b7196';

export const GOLD_DEEP = '#a8874f';
export const GOLD_CORE = '#d6af36';
export const GOLD_LIGHT = '#f7e6a8';
export const SILVER_DEEP = '#7e8288';
export const SILVER_CORE = '#a7a7ad';
export const SILVER_LIGHT = '#e8eaed';
export const BRONZE_DEEP = '#7a4b23';
export const BRONZE_CORE = '#a77044';
export const BRONZE_LIGHT = '#e0aa72';

// Brighter than this app's generic --color-win/--color-loss tokens (#0f766e/#9f1239),
// which are calibrated for light backgrounds -- these two are specifically tuned for
// readability on the navy ground this card family uses.
export const WIN_ON_NAVY = '#34d8bd';
export const LOSS_ON_NAVY = '#ff8a80';

// The Race-to-Player-of-the-Month card's one deliberate divergence from its Leaderboard
// twin: a live in-progress-month snapshot, not a frozen period.
export const LIVE_COLOR = '#d1601f';

export function medalStops(rank: number): { deep: string; core: string; light: string } | null {
  if (rank === 1) return { deep: GOLD_DEEP, core: GOLD_CORE, light: GOLD_LIGHT };
  if (rank === 2) return { deep: SILVER_DEEP, core: SILVER_CORE, light: SILVER_LIGHT };
  if (rank === 3) return { deep: BRONZE_DEEP, core: BRONZE_CORE, light: BRONZE_LIGHT };
  return null;
}
