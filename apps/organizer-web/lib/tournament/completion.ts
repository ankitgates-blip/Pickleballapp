import type { CompletionCheckMatch } from '@/lib/types';

export function isTournamentComplete(
  format: string,
  teamCount: number,
  matches: CompletionCheckMatch[],
  targetRounds?: number
): boolean {
  if (format === 'league_playoffs' && teamCount >= 4) {
    const finalMatch = matches.find((m) => m.stage === 'final');
    return Boolean(finalMatch && finalMatch.status === 'complete');
  }

  const realMatches = matches.filter((m) => m.teamBId !== null);
  const allComplete = realMatches.length > 0 && realMatches.every((m) => m.status === 'complete');

  if (format === 'gauntlet' || format === 'claim_the_throne') {
    if (!allComplete) return false;
    const maxRound = Math.max(...matches.map((m) => m.round));
    return targetRounds !== undefined && maxRound >= targetRounds;
  }

  return allComplete;
}
