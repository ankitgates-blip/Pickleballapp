'use client';

import { useState } from 'react';
import { outlineButtonClass } from '@/app/components/ui';
import { shareOrCopyText } from '@/lib/share/shareText';
import { buildLeagueInviteMessage } from '@/lib/tournament/inviteMessage';

type ShareLeagueInviteButtonProps = {
  tournamentId: string;
  tournamentName: string;
  date: string;
  venueName: string;
  timeslotLabel: string;
  format: string;
  venueContactInfo: string | null;
};

export default function ShareLeagueInviteButton({
  tournamentId,
  tournamentName,
  date,
  venueName,
  timeslotLabel,
  format,
  venueContactInfo,
}: ShareLeagueInviteButtonProps) {
  const [status, setStatus] = useState<'idle' | 'sharing' | 'copied' | 'error'>('idle');

  const handleClick = async () => {
    setStatus('sharing');
    try {
      const url = `${window.location.origin}/t/${tournamentId}`;
      const text =
        format === 'league_playoffs'
          ? buildLeagueInviteMessage({
              venueName,
              date,
              timeslotLabel,
              contactInfo: venueContactInfo,
              link: url,
            })
          : `🏓 ${tournamentName} — ${date} at ${venueName}, ${timeslotLabel}. Join here: ${url}`;
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
            : 'Share League Invite'}
    </button>
  );
}
