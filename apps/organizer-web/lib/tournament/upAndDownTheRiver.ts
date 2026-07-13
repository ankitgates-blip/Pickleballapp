import type { UpAndDownRiverPairing, UpAndDownRiverRoundResult } from '@/lib/types';

function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

type PlayerRecord = { wins: number; pointsFor: number; pointsAgainst: number };

function computeRecordsBefore(
  playerIds: string[],
  previousRounds: UpAndDownRiverRoundResult[],
  beforeRound: number
): Map<string, PlayerRecord> {
  const records = new Map<string, PlayerRecord>(
    playerIds.map((id) => [id, { wins: 0, pointsFor: 0, pointsAgainst: 0 }])
  );

  for (const r of previousRounds) {
    if (r.round >= beforeRound) continue;
    const aWon = r.scoreA > r.scoreB;

    for (const playerId of r.teamAPlayerIds) {
      const rec = records.get(playerId);
      if (!rec) continue;
      rec.pointsFor += r.scoreA;
      rec.pointsAgainst += r.scoreB;
      if (aWon) rec.wins += 1;
    }

    for (const playerId of r.teamBPlayerIds) {
      const rec = records.get(playerId);
      if (!rec) continue;
      rec.pointsFor += r.scoreB;
      rec.pointsAgainst += r.scoreA;
      if (!aWon) rec.wins += 1;
    }
  }

  return records;
}

function isBetterRecord(a: PlayerRecord, b: PlayerRecord): boolean {
  if (a.wins !== b.wins) return a.wins > b.wins;
  return a.pointsFor - a.pointsAgainst > b.pointsFor - b.pointsAgainst;
}

type PlayerRole = 'stayedWinner' | 'stayedLoser' | 'rose' | 'fell';

export function generateUpAndDownRiverRound(
  playerIds: string[],
  previousRounds: UpAndDownRiverRoundResult[],
  rng: () => number = Math.random
): UpAndDownRiverPairing[] {
  if (playerIds.length === 0 || playerIds.length % 4 !== 0) {
    throw new Error(
      'Up and Down the River requires a player count that is a positive multiple of 4'
    );
  }

  const numCourts = playerIds.length / 4;

  if (previousRounds.length === 0) {
    const shuffled = shuffle(playerIds, rng);
    const pairings: UpAndDownRiverPairing[] = [];
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

  const currentRound = Math.max(...previousRounds.map((r) => r.round));
  const latestRoundMatches = previousRounds.filter((r) => r.round === currentRound);
  const recordsBefore = computeRecordsBefore(playerIds, previousRounds, currentRound);

  const nextCourtOf = new Map<string, number>();
  const roleOf = new Map<string, PlayerRole>();

  for (const m of latestRoundMatches) {
    const aWon = m.scoreA > m.scoreB;
    const winners = aWon ? m.teamAPlayerIds : m.teamBPlayerIds;
    const losers = aWon ? m.teamBPlayerIds : m.teamAPlayerIds;

    const [w1, w2] = winners;
    let moverUp: string;
    let winnerStayer: string;
    const recW1 = recordsBefore.get(w1)!;
    const recW2 = recordsBefore.get(w2)!;
    if (isBetterRecord(recW1, recW2)) {
      [moverUp, winnerStayer] = [w1, w2];
    } else if (isBetterRecord(recW2, recW1)) {
      [moverUp, winnerStayer] = [w2, w1];
    } else {
      [moverUp, winnerStayer] = rng() < 0.5 ? [w1, w2] : [w2, w1];
    }

    const [l1, l2] = losers;
    let moverDown: string;
    let loserStayer: string;
    const recL1 = recordsBefore.get(l1)!;
    const recL2 = recordsBefore.get(l2)!;
    if (isBetterRecord(recL1, recL2)) {
      [moverDown, loserStayer] = [l2, l1];
    } else if (isBetterRecord(recL2, recL1)) {
      [moverDown, loserStayer] = [l1, l2];
    } else {
      [moverDown, loserStayer] = rng() < 0.5 ? [l1, l2] : [l2, l1];
    }

    const upDestination = Math.max(1, m.court - 1);
    const downDestination = Math.min(numCourts, m.court + 1);

    nextCourtOf.set(moverUp, upDestination);
    nextCourtOf.set(winnerStayer, m.court);
    nextCourtOf.set(moverDown, downDestination);
    nextCourtOf.set(loserStayer, m.court);

    roleOf.set(winnerStayer, 'stayedWinner');
    roleOf.set(loserStayer, 'stayedLoser');
    roleOf.set(moverUp, upDestination === m.court ? 'stayedWinner' : 'rose');
    roleOf.set(moverDown, downDestination === m.court ? 'stayedLoser' : 'fell');
  }

  const byCourt = new Map<number, string[]>();
  for (const [playerId, court] of nextCourtOf.entries()) {
    const list = byCourt.get(court) ?? [];
    list.push(playerId);
    byCourt.set(court, list);
  }

  const pairings: UpAndDownRiverPairing[] = [];
  for (let court = 1; court <= numCourts; court++) {
    const group = byCourt.get(court)!;
    const stayedWinners = group.filter((p) => roleOf.get(p) === 'stayedWinner');
    const stayedLosers = group.filter((p) => roleOf.get(p) === 'stayedLoser');
    const rose = group.filter((p) => roleOf.get(p) === 'rose');
    const fell = group.filter((p) => roleOf.get(p) === 'fell');

    let teamA: [string, string];
    let teamB: [string, string];

    if (stayedWinners.length === 2 && stayedLosers.length === 2) {
      // Degenerate single-court case: both round-just-played pairs are intact -- cross-pair.
      if (rng() < 0.5) {
        teamA = [stayedWinners[0], stayedLosers[0]];
        teamB = [stayedWinners[1], stayedLosers[1]];
      } else {
        teamA = [stayedWinners[0], stayedLosers[1]];
        teamB = [stayedWinners[1], stayedLosers[0]];
      }
    } else if (stayedWinners.length === 2) {
      // Top-court edge case: split the two stayed winners (they were partners); the lone
      // stayed loser and the new arrival each join one side.
      const single = stayedLosers[0];
      const arrival = rose[0] ?? fell[0];
      if (rng() < 0.5) {
        teamA = [stayedWinners[0], single];
        teamB = [stayedWinners[1], arrival];
      } else {
        teamA = [stayedWinners[0], arrival];
        teamB = [stayedWinners[1], single];
      }
    } else if (stayedLosers.length === 2) {
      // Bottom-court edge case: split the two stayed losers (they were partners); the lone
      // stayed winner and the new arrival each join one side.
      const single = stayedWinners[0];
      const arrival = rose[0] ?? fell[0];
      if (rng() < 0.5) {
        teamA = [stayedLosers[0], single];
        teamB = [stayedLosers[1], arrival];
      } else {
        teamA = [stayedLosers[0], arrival];
        teamB = [stayedLosers[1], single];
      }
    } else {
      // Normal middle-court case: the 2 stayers (opponents last round) team up; the riser
      // and faller (new to this court) team up.
      teamA = [stayedWinners[0], stayedLosers[0]];
      teamB = [rose[0], fell[0]];
    }

    pairings.push({ court, teamAPlayerIds: teamA, teamBPlayerIds: teamB });
  }

  return pairings;
}
