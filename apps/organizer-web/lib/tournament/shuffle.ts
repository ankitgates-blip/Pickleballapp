export function shuffleIntoTeams(
  playerIds: string[],
  rng: () => number = Math.random
): Array<{ player1Id: string; player2Id: string }> {
  const shuffled = [...playerIds];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const teams: Array<{ player1Id: string; player2Id: string }> = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    teams.push({ player1Id: shuffled[i], player2Id: shuffled[i + 1] });
  }

  return teams;
}
