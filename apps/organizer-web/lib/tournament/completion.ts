import type { CompletionCheckMatch } from '@/lib/types';

// A skipped match is resolved the same as a scored one for completion purposes --
// it just never contributes a result (see computeStandings, which only reads
// 'complete' matches, so a skipped match stays out of anyone's record).
function isResolved(status: CompletionCheckMatch['status']): boolean {
  return status === 'complete' || status === 'skipped';
}

export function isTournamentComplete(
  format: string,
  teamCount: number,
  matches: CompletionCheckMatch[],
  targetRounds?: number
): boolean {
  if (format === 'league_playoffs' && teamCount >= 4) {
    const finalMatch = matches.find((m) => m.stage === 'final');
    return Boolean(finalMatch && isResolved(finalMatch.status));
  }

  const realMatches = matches.filter((m) => m.teamBId !== null);
  const allComplete = realMatches.length > 0 && realMatches.every((m) => isResolved(m.status));

  if (
    format === 'gauntlet' ||
    format === 'claim_the_throne' ||
    format === 'up_and_down_the_river' ||
    format === 'league_playoffs' ||
    format === 'custom'
  ) {
    if (!allComplete) return false;
    const maxRound = Math.max(...matches.map((m) => m.round));
    return targetRounds !== undefined && maxRound >= targetRounds;
  }

  return allComplete;
}

export function canEditScore(
  completedAt: string | null,
  resultsUnlockedAt: string | null
): boolean {
  return completedAt === null || resultsUnlockedAt !== null;
}

export function canEditTeams(
  completedAt: string | null,
  resultsUnlockedAt: string | null
): boolean {
  return completedAt !== null && resultsUnlockedAt !== null;
}
