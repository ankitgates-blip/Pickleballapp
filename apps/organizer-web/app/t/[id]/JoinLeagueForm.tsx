'use client';

import { useActionState } from 'react';
import { inputClass, primaryButtonClass } from '@/app/components/ui';
import { joinLeague, type JoinLeagueState } from './actions';

const initialState: JoinLeagueState = { error: null };

export default function JoinLeagueForm({ tournamentId }: { tournamentId: string }) {
  const [state, formAction, isPending] = useActionState(
    joinLeague.bind(null, tournamentId),
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col sm:flex-row gap-3">
      <div className="flex-1">
        <input
          name="name"
          type="text"
          placeholder="Your name"
          required
          className={inputClass}
        />
        {state.error && <p className="text-sm text-red-600 mt-1.5">{state.error}</p>}
      </div>
      <button
        type="submit"
        disabled={isPending}
        className={`${primaryButtonClass} disabled:opacity-50`}
      >
        {isPending ? 'Joining…' : "I'm in!"}
      </button>
    </form>
  );
}
