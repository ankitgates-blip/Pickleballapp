'use client';

import { useTransition } from 'react';

export default function CancelTournamentButton({
  tournamentName,
  cancelAction,
}: {
  tournamentName: string;
  cancelAction: () => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    const confirmed = confirm(
      `Cancel "${tournamentName}"? This will permanently delete it and all its players, teams, and matches. This cannot be undone.`
    );
    if (!confirmed) return;
    startTransition(() => {
      cancelAction();
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-xs font-bold text-red-600 hover:text-red-700 disabled:opacity-50"
    >
      {isPending ? 'Cancelling…' : '✕ Cancel'}
    </button>
  );
}
