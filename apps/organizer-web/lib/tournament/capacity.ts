export function slotsRemaining(maxPlayers: number | null, currentCount: number): number | null {
  if (maxPlayers === null) return null;
  return Math.max(0, maxPlayers - currentCount);
}

export function isRosterFull(maxPlayers: number | null, currentCount: number): boolean {
  if (maxPlayers === null) return false;
  return currentCount >= maxPlayers;
}
