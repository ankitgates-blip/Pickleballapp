'use client';

import { useActionState } from 'react';
import { setLeagueRsvp, type SetRsvpState } from './actions';

const initialState: SetRsvpState = { error: null };

export default function RsvpRow({
  tournamentId,
  personId,
  personName,
  currentStatus,
  statusLabel,
  isLocked,
}: {
  tournamentId: string;
  personId: string;
  personName: string;
  currentStatus: 'in' | 'out' | 'tentative' | null;
  statusLabel: string | null;
  isLocked: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    setLeagueRsvp.bind(null, tournamentId, personId),
    initialState
  );

  const confirmDemote = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (
      statusLabel === 'Confirmed' &&
      !window.confirm(`${personName} currently has a confirmed spot. Remove it?`)
    ) {
      event.preventDefault();
    }
  };

  return (
    <li className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
      <div>
        <span className="font-semibold text-slate-900">{personName}</span>
        {statusLabel && (
          <span className="ml-2 text-xs font-semibold text-navy-mid">{statusLabel}</span>
        )}
        {state.error && <p className="text-xs text-red-600 mt-1">{state.error}</p>}
      </div>
      {!isLocked && (
        <form action={formAction} className="flex gap-1.5 flex-shrink-0">
          <button
            type="submit"
            name="status"
            value="in"
            disabled={isPending}
            className={`text-xs font-semibold rounded-full px-2.5 py-1 disabled:opacity-50 ${
              currentStatus === 'in'
                ? 'bg-green-600 text-white'
                : 'bg-white border border-slate-300 text-slate-600'
            }`}
          >
            I&apos;m In
          </button>
          <button
            type="submit"
            name="status"
            value="tentative"
            disabled={isPending}
            onClick={confirmDemote}
            className={`text-xs font-semibold rounded-full px-2.5 py-1 disabled:opacity-50 ${
              currentStatus === 'tentative'
                ? 'bg-amber-500 text-white'
                : 'bg-white border border-slate-300 text-slate-600'
            }`}
          >
            Tentative
          </button>
          <button
            type="submit"
            name="status"
            value="out"
            disabled={isPending}
            onClick={confirmDemote}
            className={`text-xs font-semibold rounded-full px-2.5 py-1 disabled:opacity-50 ${
              currentStatus === 'out'
                ? 'bg-slate-500 text-white'
                : 'bg-white border border-slate-300 text-slate-600'
            }`}
          >
            I&apos;m Out
          </button>
        </form>
      )}
    </li>
  );
}
