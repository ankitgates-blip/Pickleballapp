// apps/organizer-web/app/tournaments/[id]/roster/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, primaryButtonClass, accentButtonClass, pillClass, linkClass } from '@/app/components/ui';
import { matchNamesToPeople } from '@/lib/people/matchNames';
import { TIME_SLOTS, timeslotLabel } from '@/lib/tournament/timeslots';
import { formatLabel, isIndividualFormat } from '@/lib/tournament/formats';
import { buildRosterTeams, buildUnpairedPlayerNames } from '@/lib/tournament/rosterExport';
import { isRosterFull } from '@/lib/tournament/capacity';
import ThreatBadge from '@/app/components/ThreatBadge';
import PersonAvatar from '@/app/components/PersonAvatar';
import { buildWinPercentageByPersonId } from '@/lib/stats/buildWinPercentageByPersonId';
import SaveButton from '@/app/components/SaveButton';
import CopyLinkButton from '../standings/CopyLinkButton';
import ShareRosterButton from './ShareRosterButton';
import {
  startAddPlayers,
  confirmAddPlayers,
  addExistingPeople,
  removePlayer,
  updateTournamentDetails,
} from './actions';

export default async function RosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pendingNames?: string }>;
}) {
  const { id } = await params;
  const { pendingNames } = await searchParams;
  const { supabase, organizer } = await requireOrganizer();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, date, format, completed_at, venue_id, timeslot, max_players, venues(name)')
    .eq('id', id)
    .single();

  const isCompleted = Boolean(tournament?.completed_at);

  const venue = tournament?.venues as { name: string } | { name: string }[] | null;
  const venueName = Array.isArray(venue) ? (venue[0]?.name ?? 'Pickleturf') : (venue?.name ?? 'Pickleturf');

  const isIndividual = isIndividualFormat(tournament?.format ?? '');

  const { data: venues } = await supabase.from('venues').select('id, name').order('name');

  const { data: players } = await supabase
    .from('players')
    .select('id, name, person_id')
    .eq('tournament_id', id)
    .order('created_at', { ascending: true });

  const rosterFull = isRosterFull(tournament?.max_players ?? null, (players ?? []).length);

  const winPercentageByPersonId = await buildWinPercentageByPersonId(
    supabase,
    organizer.id,
    (players ?? []).map((p) => p.person_id)
  );

  const { data: teams } = !isIndividual
    ? await supabase.from('teams').select('player_1_id, player_2_id').eq('tournament_id', id)
    : { data: [] };

  const { data: allPeople } = await supabase
    .from('people')
    .select('id, name, photo_url')
    .eq('organizer_id', organizer.id)
    .order('name', { ascending: true });

  const photoUrlByPersonId = new Map((allPeople ?? []).map((p) => [p.id, p.photo_url as string | null]));

  const personIdsOnRoster = new Set(
    (players ?? []).map((p) => p.person_id).filter((personId): personId is string => Boolean(personId))
  );
  const availablePeople = (allPeople ?? []).filter((p) => !personIdsOnRoster.has(p.id));

  const playerById = new Map((players ?? []).map((p) => [p.id, p.name]));
  const rosterTeams = buildRosterTeams(teams ?? [], playerById);
  const unpairedPlayerNames = buildUnpairedPlayerNames(
    (players ?? []).map((p) => ({ id: p.id, name: p.name })),
    teams ?? []
  );
  const hasTeams = rosterTeams.length > 0;
  const allPlayerNames = (players ?? []).map((p) => p.name);

  const nameCounts = new Map<string, number>();
  for (const p of players ?? []) {
    const key = p.name.trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const duplicateNames = new Set(
    (players ?? [])
      .map((p) => p.name)
      .filter((name) => (nameCounts.get(name.trim().toLowerCase()) ?? 0) > 1)
  );

  if (pendingNames) {
    const names = pendingNames
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    const { data: existingPeople } = await supabase
      .from('people')
      .select('id, name')
      .eq('organizer_id', organizer.id);

    const { matched, newNames } = matchNamesToPeople(names, existingPeople ?? []);
    const confirmAddPlayersWithId = confirmAddPlayers.bind(null, id);

    return (
      <OrganizerShell organizerName={organizer.name}>
        <TournamentNav tournamentId={id} current="roster" />
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Review Roster Additions</h1>

        <div className={`${cardClass} mb-6`}>
          <h2 className="text-lg font-bold text-slate-900 mb-2">
            Matched to existing person ({matched.length})
          </h2>
          <ul className="flex flex-wrap gap-2 mb-4">
            {matched.map((m, i) => (
              <li key={i} className={`${pillClass} bg-navy-tint text-navy-deep`}>
                {m.name}
              </li>
            ))}
            {matched.length === 0 && <li className="text-sm text-slate-400">None</li>}
          </ul>

          <h2 className="text-lg font-bold text-slate-900 mb-2">New people ({newNames.length})</h2>
          <ul className="flex flex-wrap gap-2 mb-4">
            {newNames.map((name, i) => (
              <li key={i} className={`${pillClass} bg-amber-50 text-amber-800`}>
                {name}
              </li>
            ))}
            {newNames.length === 0 && <li className="text-sm text-slate-400">None</li>}
          </ul>

          {rosterFull ? (
            <div className="space-y-3">
              <p className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 font-semibold">
                All Slots Full — the roster filled up since you started this. These players can't
                be added.
              </p>
              <Link href={`/tournaments/${id}/roster`} className={linkClass}>
                Back to roster
              </Link>
            </div>
          ) : (
            <form action={confirmAddPlayersWithId} className="flex items-center gap-4">
              <input type="hidden" name="names" value={pendingNames} />
              <SaveButton className={accentButtonClass} pendingLabel="Confirming…">
                Confirm
              </SaveButton>
              <Link href={`/tournaments/${id}/roster`} className={linkClass}>
                Cancel
              </Link>
            </form>
          )}
        </div>
      </OrganizerShell>
    );
  }

  const startAddPlayersWithId = startAddPlayers.bind(null, id);
  const addExistingPeopleWithId = addExistingPeople.bind(null, id);
  const updateTournamentDetailsWithId = updateTournamentDetails.bind(null, id);

  return (
    <OrganizerShell organizerName={organizer.name}>
      <TournamentNav tournamentId={id} current="roster" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Roster</h1>
        <CopyLinkButton tournamentId={id} />
      </div>

      <div className="mb-6">
        <ShareRosterButton
          tournamentName={tournament?.name ?? ''}
          date={tournament?.date ?? ''}
          venueName={venueName}
          timeslotLabel={timeslotLabel(tournament?.timeslot ?? '')}
          formatLabel={formatLabel(tournament?.format ?? '')}
          hasTeams={hasTeams}
          rosterTeams={rosterTeams}
          unpairedPlayerNames={unpairedPlayerNames}
          allPlayerNames={allPlayerNames}
        />
        <p className="text-xs text-slate-400 mt-1.5">
          Opens your share sheet on mobile — downloads the file on desktop.
        </p>
      </div>

      {!isCompleted && (
        <div className={`${cardClass} mb-6`}>
          <h2 className="text-lg font-bold text-slate-900 mb-2">League Details</h2>
          <form action={updateTournamentDetailsWithId} className="flex flex-col sm:flex-row gap-3">
            <select
              name="venueId"
              required
              defaultValue={tournament?.venue_id ?? ''}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-mid focus:border-navy-mid"
            >
              {(venues ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <select
              name="timeslot"
              required
              defaultValue={tournament?.timeslot ?? ''}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-mid focus:border-navy-mid"
            >
              {TIME_SLOTS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <input
              name="maxPlayers"
              type="number"
              min={1}
              placeholder="Max players"
              aria-label="Max players"
              defaultValue={tournament?.max_players ?? ''}
              className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-mid focus:border-navy-mid"
            />
            <SaveButton className={primaryButtonClass} pendingLabel="Saving…">
              Save
            </SaveButton>
          </form>
        </div>
      )}

      {!isCompleted && !rosterFull && availablePeople.length > 0 && (
        <div className={`${cardClass} mb-6`}>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Add Existing Players</h2>
          <p className="text-sm text-slate-500 mb-3">
            Select players you've added before — no need to retype their names.
          </p>
          <form action={addExistingPeopleWithId} className="space-y-3">
            <div className="flex flex-wrap gap-3 max-h-48 overflow-y-auto">
              {availablePeople.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm cursor-pointer hover:border-navy-light"
                >
                  <input type="checkbox" name="personIds" value={p.id} className="accent-navy-mid" />
                  {p.name}
                </label>
              ))}
            </div>
            <SaveButton className={primaryButtonClass} pendingLabel="Adding…">
              Add Selected
            </SaveButton>
          </form>
        </div>
      )}

      {!isCompleted && !rosterFull && (
        <div className={`${cardClass} mb-6`}>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Add New Players</h2>
          <form action={startAddPlayersWithId} className="space-y-3">
            <textarea
              name="names"
              rows={8}
              placeholder="One player name per line"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-navy-mid focus:border-navy-mid"
            />
            <SaveButton className={primaryButtonClass} pendingLabel="Adding…">
              Add Players
            </SaveButton>
          </form>
        </div>
      )}

      {!isCompleted && rosterFull && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6 font-semibold">
          All Slots Full — no more sign up.
        </div>
      )}

      <div className={cardClass}>
        <h2 className="text-lg font-bold text-slate-900 mb-2">
          Players ({(players ?? []).length}
          {tournament?.max_players ? `/${tournament.max_players}` : ''})
        </h2>
        {duplicateNames.size > 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            ⚠ Duplicate name(s) — double-check pairing later:{' '}
            {Array.from(duplicateNames).join(', ')}
          </p>
        )}
        <ul className="space-y-2">
          {(players ?? []).map((p) => {
            const removePlayerForPlayer = removePlayer.bind(null, id, p.id);
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-navy-tint px-3 py-2 text-sm font-semibold text-navy-deep"
              >
                <span className="flex items-center gap-2.5 flex-wrap">
                  <PersonAvatar
                    photoUrl={p.person_id ? (photoUrlByPersonId.get(p.person_id) ?? null) : null}
                    name={p.name}
                    size={28}
                  />
                  {p.name}
                  <ThreatBadge
                    winPercentage={p.person_id ? (winPercentageByPersonId.get(p.person_id) ?? null) : null}
                  />
                </span>
                {!isCompleted && (
                  <form action={removePlayerForPlayer}>
                    <SaveButton
                      className="text-xs font-semibold text-navy-mid hover:text-red-600 transition-colors disabled:opacity-50"
                      pendingLabel="Removing…"
                    >
                      Remove
                    </SaveButton>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="mt-6">
        <Link href={`/tournaments/${id}/teams`} className={linkClass}>
          Next: pair teams →
        </Link>
      </p>
    </OrganizerShell>
  );
}
