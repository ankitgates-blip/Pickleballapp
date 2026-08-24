'use client';

import { useState } from 'react';
import { outlineButtonClass } from '@/app/components/ui';
import { shareOrCopyText } from '@/lib/share/shareText';
import { slotsRemaining } from '@/lib/tournament/capacity';

type ShareSignupUpdateButtonProps = {
  tournamentId: string;
  tournamentName: string;
  maxPlayers: number | null;
  playerNames: string[];
};

export default function ShareSignupUpdateButton({
  tournamentId,
  tournamentName,
  maxPlayers,
  playerNames,
}: ShareSignupUpdateButtonProps) {
  const [status, setStatus] = useState<'idle' | 'sharing' | 'copied' | 'error'>('idle');

  const handleClick = async () => {
    setStatus('sharing');
    try {
      const url = `${window.location.origin}/t/${tournamentId}`;
      const remaining = slotsRemaining(maxPlayers, playerNames.length);
      const countLabel =
        maxPlayers != null
          ? `${playerNames.length}/${maxPlayers} signed up`
          : `${playerNames.length} signed up`;
      const remainingLabel =
        remaining != null ? ` ${remaining} spot${remaining === 1 ? '' : 's'} left!` : '';
      const text = `🏓 ${tournamentName}: ${countLabel} — ${playerNames.join(', ')}.${remainingLabel} Join: ${url}`;
      const result = await shareOrCopyText(text, tournamentName);
      setStatus(result === 'copied' ? 'copied' : 'idle');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === 'sharing'}
      className={`${outlineButtonClass} disabled:opacity-50`}
    >
      {status === 'sharing'
        ? 'Sharing…'
        : status === 'copied'
          ? '✓ Copied'
          : status === 'error'
            ? 'Try again'
            : 'Share Signup Update'}
    </button>
  );
}
