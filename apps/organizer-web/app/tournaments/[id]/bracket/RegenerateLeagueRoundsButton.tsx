'use client';

import { useTransition } from 'react';
import { accentButtonClass } from '@/app/components/ui';

export default function RegenerateLeagueRoundsButton({
  regenerateAction,
  hasScoredMatches,
}: {
  regenerateAction: () => Promise<void>;
  hasScoredMatches: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    if (hasScoredMatches) {
      const confirmed = confirm(
        'Regenerate all rounds? This will permanently delete every League match and score for this tournament and rebuild the schedule from the current teams. This cannot be undone.'
      );
      if (!confirmed) return;
    }
    startTransition(() => {
      regenerateAction();
    });
  };

  return (
    <button type="button" onClick={handleClick} disabled={isPending} className={accentButtonClass}>
      {isPending ? 'Regenerating…' : '🔄 Regenerate All Rounds'}
    </button>
  );
}
