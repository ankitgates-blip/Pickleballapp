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
  const finalMatch = matches.find((m) => m.stage === 'final');

  if (format === 'league_playoffs' && teamCount >= 4) {
    return Boolean(finalMatch && isResolved(finalMatch.status));
  }

  // Custom League normally has no playoff stage at all, so completion falls through
  // to the generic "every match resolved and the target round reached" rule below.
  // But once a Final has actually been generated (the Custom-with-fixed-teams
  // playoffs feature), the tournament is done exactly when that Final is resolved --
  // same as League + Playoffs -- regardless of any still-pending League match that
  // organizer chose to skip past on the way to playoffs.
  if (format === 'custom' && finalMatch) {
    return isResolved(finalMatch.status);
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
