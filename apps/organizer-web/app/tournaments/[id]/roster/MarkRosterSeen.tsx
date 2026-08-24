'use client';

import { useEffect } from 'react';
import { rosterSeenCountKey } from '@/lib/signup/newSignupsSince';

// Renders nothing -- just records "the organizer has now seen this many players" so
// PlayerCountBadge on the Tournaments list stops showing a "+N new" badge for this
// league until more players sign up after this point.
export default function MarkRosterSeen({
  tournamentId,
  playerCount,
}: {
  tournamentId: string;
  playerCount: number;
}) {
  useEffect(() => {
    localStorage.setItem(rosterSeenCountKey(tournamentId), String(playerCount));
  }, [tournamentId, playerCount]);

  return null;
}
