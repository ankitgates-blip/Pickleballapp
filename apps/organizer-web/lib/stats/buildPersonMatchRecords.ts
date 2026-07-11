import type { PersonMatchRecord, RawMatch, RawTeam } from './types';

export function buildPersonMatchRecords(
  personId: string,
  matches: RawMatch[],
  teams: RawTeam[]
): PersonMatchRecord[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const records: PersonMatchRecord[] = [];

  for (const m of matches) {
    if (m.status !== 'complete') continue;

    const teamA = teamById.get(m.teamAId);
    const teamB = teamById.get(m.teamBId);
    if (!teamA || !teamB) continue;

    let myTeam: RawTeam;
    let otherTeam: RawTeam;
    let scoreFor: number;
    let scoreAgainst: number;

    if (teamA.player1PersonId === personId || teamA.player2PersonId === personId) {
      myTeam = teamA;
      otherTeam = teamB;
      scoreFor = m.scoreA;
      scoreAgainst = m.scoreB;
    } else if (teamB.player1PersonId === personId || teamB.player2PersonId === personId) {
      myTeam = teamB;
      otherTeam = teamA;
      scoreFor = m.scoreB;
      scoreAgainst = m.scoreA;
    } else {
      continue;
    }

    const partnerId =
      myTeam.player1PersonId === personId ? myTeam.player2PersonId : myTeam.player1PersonId;

    records.push({
      tournamentId: m.tournamentId,
      tournamentDate: m.tournamentDate,
      venueName: m.venueName,
      partnerId,
      opponentIds: [otherTeam.player1PersonId, otherTeam.player2PersonId],
      scoreFor,
      scoreAgainst,
      won: scoreFor > scoreAgainst,
    });
  }

  return records;
}
