// Whether a venue/leaderboard-title string refers to Pickleturf -- used to gate the
// Pickleturf-specific wordmark shown on TournamentCard and LeaderboardTable. Case- and
// whitespace-insensitive since the raw value comes from user-entered tournament/venue text.
export function isPickleturf(value: string): boolean {
  return value.trim().toLowerCase() === 'pickleturf';
}
