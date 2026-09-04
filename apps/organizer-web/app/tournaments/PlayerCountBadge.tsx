'use client';

import { useEffect, useState } from 'react';
import { newSignupsSince, rosterSeenCountKey } from '@/lib/signup/newSignupsSince';

export default function PlayerCountBadge({
  tournamentId,
  playerCount,
  hideCount = false,
}: {
  tournamentId: string;
  playerCount: number;
  // When the surrounding layout already shows the player count itself (e.g. the
  // dark tournament card's own PLAYERS stat), this renders just the "+N new"
  // pill -- not a second, redundant count.
  hideCount?: boolean;
}) {
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    const seenRaw = localStorage.getItem(rosterSeenCountKey(tournamentId));
    const seenCount = seenRaw ? Number(seenRaw) : 0;
    setNewCount(newSignupsSince(seenCount, playerCount));
  }, [tournamentId, playerCount]);

  return (
    <span className="inline-flex items-center gap-1.5">
      {!hideCount && (
        <span>
          👥 {playerCount} player{playerCount === 1 ? '' : 's'}
        </span>
      )}
      {newCount > 0 && (
        <span className="inline-flex items-center rounded-full bg-brand-orange text-white text-[10px] font-extrabold px-2 py-0.5">
          +{newCount} new
        </span>
      )}
    </span>
  );
}
