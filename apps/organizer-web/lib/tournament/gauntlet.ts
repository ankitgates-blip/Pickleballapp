import type { GauntletPairing, GauntletRoundResult } from '@/lib/types';

function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

type PlayerRecord = { wins: number; losses: number; pointsFor: number; pointsAgainst: number };

function computeRecords(
  playerIds: string[],
  previousRounds: GauntletRoundResult[]
): Map<string, PlayerRecord> {
  const records = new Map<string, PlayerRecord>(
    playerIds.map((id) => [id, { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }])
  );

  for (const r of previousRounds) {
    const aWon = r.scoreA > r.scoreB;

    for (const playerId of r.teamAPlayerIds) {
      const rec = records.get(playerId);
      if (!rec) continue;
      rec.pointsFor += r.scoreA;
      rec.pointsAgainst += r.scoreB;
      if (aWon) rec.wins += 1;
      else rec.losses += 1;
    }

    for (const playerId of r.teamBPlayerIds) {
      const rec = records.get(playerId);
      if (!rec) continue;
      rec.pointsFor += r.scoreB;
      rec.pointsAgainst += r.scoreA;
      if (aWon) rec.losses += 1;
      else rec.wins += 1;
    }
  }

  return records;
}

function computeSitOutCounts(
  playerIds: string[],
  previousRounds: GauntletRoundResult[]
): Map<string, number> {
  const counts = new Map<string, number>(playerIds.map((id) => [id, 0]));
  const roundNumbers = new Set(previousRounds.map((r) => r.round));

  for (const round of roundNumbers) {
    const active = new Set(
      previousRounds
        .filter((r) => r.round === round)
        .flatMap((r) => [...r.teamAPlayerIds, ...r.teamBPlayerIds])
    );
    for (const id of playerIds) {
      if (!active.has(id)) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
  }

  return counts;
}

export function generateGauntletRound(
  playerIds: string[],
  previousRounds: GauntletRoundResult[],
  rng: () => number = Math.random
): GauntletPairing[] {
  if (playerIds.length < 4) {
    throw new Error('Gauntlet requires at least 4 players');
  }

  const sitOutsThisRound = playerIds.length % 4;
  const sitOutCounts = computeSitOutCounts(playerIds, previousRounds);
  const records = computeRecords(playerIds, previousRounds);

  const candidatesForSitOut = shuffle(playerIds, rng).sort(
    (a, b) => sitOutCounts.get(a)! - sitOutCounts.get(b)!
  );
  const sittingOut = new Set(candidatesForSitOut.slice(0, sitOutsThisRound));

  const active = shuffle(
    playerIds.filter((id) => !sittingOut.has(id)),
    rng
  );

  const ranked = [...active].sort((a, b) => {
    const recA = records.get(a)!;
    const recB = records.get(b)!;
    if (recB.wins !== recA.wins) return recB.wins - recA.wins;
    return recB.pointsFor - recB.pointsAgainst - (recA.pointsFor - recA.pointsAgainst);
  });

  const pairings: GauntletPairing[] = [];
  for (let i = 0; i < ranked.length; i += 4) {
    const [r1, r2, r3, r4] = ranked.slice(i, i + 4);
    pairings.push({
      teamAPlayerIds: [r1, r4],
      teamBPlayerIds: [r2, r3],
    });
  }

  return pairings;
}
