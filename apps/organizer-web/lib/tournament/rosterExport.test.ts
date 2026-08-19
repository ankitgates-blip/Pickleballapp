import { describe, it, expect } from 'vitest';
import { buildRosterTeams, buildUnpairedPlayerNames } from './rosterExport';

describe('buildRosterTeams', () => {
  it("resolves each team's two player IDs to names", () => {
    const playerById = new Map([
      ['p1', 'Alice'],
      ['p2', 'Bob'],
      ['p3', 'Carol'],
      ['p4', 'Dave'],
    ]);
    const result = buildRosterTeams(
      [
        { player_1_id: 'p1', player_2_id: 'p2' },
        { player_1_id: 'p3', player_2_id: 'p4' },
      ],
      playerById
    );
    expect(result).toEqual([
      { player1Name: 'Alice', player2Name: 'Bob' },
      { player1Name: 'Carol', player2Name: 'Dave' },
    ]);
  });

  it('falls back to "Unknown" when a player id is missing from playerById', () => {
    const result = buildRosterTeams([{ player_1_id: 'ghost', player_2_id: 'p2' }], new Map());
    expect(result).toEqual([{ player1Name: 'Unknown', player2Name: 'Unknown' }]);
  });

  it('returns an empty array for no teams', () => {
    expect(buildRosterTeams([], new Map())).toEqual([]);
  });
});

describe('buildUnpairedPlayerNames', () => {
  it('returns names of players not present in any team', () => {
    const players = [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Carol' },
    ];
    const teams = [{ player_1_id: 'p1', player_2_id: 'p2' }];
    expect(buildUnpairedPlayerNames(players, teams)).toEqual(['Carol']);
  });

  it('returns all player names when there are no teams', () => {
    const players = [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ];
    expect(buildUnpairedPlayerNames(players, [])).toEqual(['Alice', 'Bob']);
  });

  it('returns an empty array when every player is paired', () => {
    const players = [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ];
    const teams = [{ player_1_id: 'p1', player_2_id: 'p2' }];
    expect(buildUnpairedPlayerNames(players, teams)).toEqual([]);
  });
});
