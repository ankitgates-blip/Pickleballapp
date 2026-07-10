import type { CompletionCheckMatch } from '@/lib/types';

export function isTournamentComplete(
  format: string,
  teamCount: number,
  matches: CompletionCheckMatch[]
): boolean {
  if (format === 'league_playoffs' && teamCount >= 4) {
    const finalMatch = matches.find((m) => m.stage === 'final');
    return Boolean(finalMatch && finalMatch.status === 'complete');
  }

  const realMatches = matches.filter((m) => m.teamBId !== null);
  return realMatches.length > 0 && realMatches.every((m) => m.status === 'complete');
}
