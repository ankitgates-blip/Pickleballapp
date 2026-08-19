export type ExportRosterTeam = {
  player1Name: string;
  player2Name: string;
};

export function buildRosterTeams(
  teams: { player_1_id: string; player_2_id: string }[],
  playerById: Map<string, string>
): ExportRosterTeam[] {
  return teams.map((t) => ({
    player1Name: playerById.get(t.player_1_id) ?? 'Unknown',
    player2Name: playerById.get(t.player_2_id) ?? 'Unknown',
  }));
}

export function buildUnpairedPlayerNames(
  players: { id: string; name: string }[],
  teams: { player_1_id: string; player_2_id: string }[]
): string[] {
  const pairedIds = new Set(teams.flatMap((t) => [t.player_1_id, t.player_2_id]));
  return players.filter((p) => !pairedIds.has(p.id)).map((p) => p.name);
}
