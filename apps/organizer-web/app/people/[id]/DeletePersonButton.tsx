'use client';

import { useTransition } from 'react';

export default function DeletePersonButton({
  personName,
  deleteAction,
}: {
  personName: string;
  deleteAction: () => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    const confirmed = confirm(
      `Delete "${personName}" completely? This removes them from every tournament roster they're in, and permanently deletes any teams and matches they were part of — which may also remove match data for their partners and opponents in those matches. This cannot be undone.`
    );
    if (!confirmed) return;
    startTransition(() => {
      deleteAction();
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-sm font-bold text-red-600 hover:text-red-700 disabled:opacity-50"
    >
      {isPending ? 'Deleting…' : '🗑 Delete Player Completely'}
    </button>
  );
}
