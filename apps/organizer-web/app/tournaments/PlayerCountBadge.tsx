'use client';

import { useEffect, useState } from 'react';
import { newSignupsSince, rosterSeenCountKey } from '@/lib/signup/newSignupsSince';

export default function PlayerCountBadge({
  tournamentId,
  playerCount,
}: {
  tournamentId: string;
  playerCount: number;
}) {
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    const seenRaw = localStorage.getItem(rosterSeenCountKey(tournamentId));
    const seenCount = seenRaw ? Number(seenRaw) : 0;
    setNewCount(newSignupsSince(seenCount, playerCount));
  }, [tournamentId, playerCount]);

  return (
    <span className="inline-flex items-center gap-1.5">
      <span>
        👥 {playerCount} player{playerCount === 1 ? '' : 's'}
      </span>
      {newCount > 0 && (
        <span className="inline-flex items-center rounded-full bg-brand-orange text-white text-[10px] font-extrabold px-2 py-0.5">
          +{newCount} new
        </span>
      )}
    </span>
  );
}
