import type { ClaimTheThronePairing, ClaimTheThroneRoundResult } from '@/lib/types';

function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateClaimTheThroneRound(
  playerIds: string[],
  previousRoundMatches: ClaimTheThroneRoundResult[],
  rng: () => number = Math.random
): ClaimTheThronePairing[] {
  if (playerIds.length === 0 || playerIds.length % 4 !== 0) {
    throw new Error('Claim the Throne requires a player count that is a positive multiple of 4');
  }

  const numCourts = playerIds.length / 4;

  if (previousRoundMatches.length === 0) {
    const shuffled = shuffle(playerIds, rng);
    const pairings: ClaimTheThronePairing[] = [];
    for (let court = 1; court <= numCourts; court++) {
      const group = shuffled.slice((court - 1) * 4, court * 4);
      pairings.push({
        court,
        teamAPlayerIds: [group[0], group[1]],
        teamBPlayerIds: [group[2], group[3]],
      });
    }
    return pairings;
  }

  const arrivalsByCourt = new Map<number, Array<[string, string]>>();
  const addArrival = (court: number, team: [string, string]) => {
    const list = arrivalsByCourt.get(court) ?? [];
    list.push(team);
    arrivalsByCourt.set(court, list);
  };

  for (const match of previousRoundMatches) {
    const aWon = match.scoreA > match.scoreB;
    const winningTeam = aWon ? match.teamAPlayerIds : match.teamBPlayerIds;
    const losingTeam = aWon ? match.teamBPlayerIds : match.teamAPlayerIds;

    addArrival(Math.max(1, match.court - 1), winningTeam);
    addArrival(Math.min(numCourts, match.court + 1), losingTeam);
  }

  const pairings: ClaimTheThronePairing[] = [];
  for (let court = 1; court <= numCourts; court++) {
    const [teamOne, teamTwo] = arrivalsByCourt.get(court)!;
    const shuffledOne = shuffle(teamOne, rng);
    const shuffledTwo = shuffle(teamTwo, rng);
    pairings.push({
      court,
      teamAPlayerIds: [shuffledOne[0], shuffledTwo[0]],
      teamBPlayerIds: [shuffledOne[1], shuffledTwo[1]],
    });
  }

  return pairings;
}
