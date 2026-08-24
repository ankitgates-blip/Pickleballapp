// How many players have signed up since the organizer last viewed this tournament's
// Roster page (per-browser via localStorage -- see PlayerCountBadge for the read side
// and MarkRosterSeen for the write side, both keyed by rosterSeenCountKey).
export function newSignupsSince(seenCount: number, currentCount: number): number {
  return Math.max(0, currentCount - seenCount);
}

export function rosterSeenCountKey(tournamentId: string): string {
  return `roster-seen-count-${tournamentId}`;
}
