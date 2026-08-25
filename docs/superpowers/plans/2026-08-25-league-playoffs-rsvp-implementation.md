# League Playoffs RSVP and Waiting List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The public League Playoffs page shows every person in the organizer's roster with In/Out/Tentative buttons; "In" fills the roster up to `max_players` and overflow goes to a live waiting list; dropping to Out/Tentative frees a spot and immediately promotes the next waiting person; everything locks at 5:00 PM Asia/Dubai on the league's date.

**Architecture:** A new `league_rsvps` table plus one `SECURITY DEFINER` Postgres function (`set_league_rsvp`) that atomically upserts the RSVP and, on every write, keeps the `players` table's confirmed roster in sync (insert on a fresh "in" with room, delete-then-promote on any drop) — the function is the sole write path, so no separate RLS write policies are needed on either table for this feature. A public Server Action calls the function via `supabase.rpc(...)`. A new server component queries people + RSVPs and renders one client row per person (its own `useActionState`, matching this codebase's existing `JoinLeagueForm` pattern). The existing free-text `JoinLeagueForm` stays exactly as-is for every format except League Playoffs.

**Tech Stack:** Supabase (Postgres, RLS, `SECURITY DEFINER` functions), Next.js Server Actions, React `useActionState`, TypeScript.

## Global Constraints

- Invite list = every row in the organizer's `people` table — no per-tournament curation.
- Cap = the tournament's existing `max_players` field (no new/hardcoded number). `max_players is null` means no cap (every "in" gets a roster spot immediately, matching how the existing free-text flow already treats an unset cap).
- Tentative is purely informational: never occupies a roster spot, never enters the waiting list, never affects anyone else's promotion.
- Cutoff: 5:00 PM **Asia/Dubai** (UTC+4, no DST) on `tournaments.date`. After that instant, `set_league_rsvp` refuses all further changes; the public page renders the buttons disabled instead of attempting a write that would fail.
- Scope: League Playoffs only (`format = 'league_playoffs'`). Every other format's public page keeps using the existing free-text `JoinLeagueForm`/`joinLeague` untouched.
- `players` table is not schema-changed. A confirmed roster slot is exactly what it already is: a `players` row. The waiting list is derived (an "in" `league_rsvps` row with no matching `players` row), never stored as its own status.
- `set_league_rsvp` is the **sole** write path for both `league_rsvps` and the `players` inserts/deletes this feature performs — no direct table-level INSERT/UPDATE/DELETE grants on `league_rsvps` for `anon`/`authenticated`, only `EXECUTE` on the function and `SELECT` on the table (for reading current status).
- Following this codebase's established public-Server-Action convention (`joinLeague`): return `{ error: string | null }` instead of throwing — Next.js masks thrown Server Action error messages in production, so a thrown error would reach the visitor as a generic crash page instead of an inline message.
- `app/t/[id]/actions.ts`, `app/t/[id]/page.tsx`, and new client/server components have zero automated test coverage anywhere in this codebase, by established convention (confirmed repeatedly this session) — verify via `npm run build` (typecheck) + `npm test` (regression) + manual testing against a real Supabase instance, not new test files. The migration/function is schema-only, matching every other migration in this codebase — no test file for it either.
- Test command: `npm test` (Vitest) from `apps/organizer-web`. Build/typecheck: `npm run build` from `apps/organizer-web`.

---

### Task 1: Migration — `league_rsvps` table and `set_league_rsvp` function

**Files:**
- Create: `supabase/migrations/20260825150000_add_league_rsvps.sql`

**Interfaces:**
- Produces: `public.league_rsvps` table, `public.set_league_rsvp(p_tournament_id uuid, p_person_id uuid, p_status text) returns void` — used by Task 2's Server Action via `supabase.rpc('set_league_rsvp', {...})`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260825150000_add_league_rsvps.sql`:

```sql
-- Tracks every RSVP response (in/out/tentative) for League Playoffs' public invite list.
-- A confirmed roster slot is NOT stored here -- it's derived: an 'in' row that also has a
-- matching public.players row (same tournament_id/person_id). The waiting list is the
-- complementary set: 'in' rows with no matching players row, ordered by responded_at. This
-- keeps public.players meaning exactly what it already means everywhere else in the app
-- (teams, standings, bracket generation) -- nothing downstream needs to learn a new state.
-- See docs/superpowers/specs/2026-08-25-league-playoffs-rsvp-design.md.
create table public.league_rsvps (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  status text not null check (status in ('in', 'out', 'tentative')),
  responded_at timestamptz not null default now(),
  unique (tournament_id, person_id)
);

create index league_rsvps_tournament_idx on public.league_rsvps(tournament_id);

alter table public.league_rsvps enable row level security;

-- Organizers can read RSVPs for their own tournaments.
create policy "league_rsvps_select_own" on public.league_rsvps
  for select using (
    tournament_id in (
      select id from public.tournaments
      where organizer_id in (select id from public.organizers where auth_user_id = auth.uid())
    )
  );

-- The public page needs to read current status for every invitee without being the
-- organizer -- matches tournaments_select_all's existing "select using (true)" openness.
create policy "league_rsvps_select_public" on public.league_rsvps
  for select using (true);

-- Deliberately NO insert/update/delete grants to anon/authenticated on this table, and NO
-- grants at all on public.players from this migration. All writes this feature performs go
-- through set_league_rsvp() below (SECURITY DEFINER), which is the sole, fully-validated
-- write path -- centralizing every authorization check (person belongs to this organizer,
-- tournament is League Playoffs, not completed, cutoff not passed) in one reviewable place
-- instead of spreading it across RLS policies and app code.

create or replace function public.set_league_rsvp(
  p_tournament_id uuid,
  p_person_id uuid,
  p_status text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament record;
  v_person_exists boolean;
  v_cutoff timestamptz;
  v_existing_player_id uuid;
  v_next_waiting record;
begin
  if p_status not in ('in', 'out', 'tentative') then
    raise exception 'Invalid status';
  end if;

  select id, organizer_id, format, date, max_players, completed_at
    into v_tournament
    from public.tournaments
    where id = p_tournament_id;

  if v_tournament.id is null then
    raise exception 'League not found';
  end if;
  if v_tournament.format <> 'league_playoffs' then
    raise exception 'RSVP is only available for League Playoffs';
  end if;
  if v_tournament.completed_at is not null then
    raise exception 'This league has already finished';
  end if;

  v_cutoff := (v_tournament.date::text || ' 17:00:00')::timestamp at time zone 'Asia/Dubai';
  if now() >= v_cutoff then
    raise exception 'RSVP is closed for this league';
  end if;

  select exists(
    select 1 from public.people where id = p_person_id and organizer_id = v_tournament.organizer_id
  ) into v_person_exists;
  if not v_person_exists then
    raise exception 'Person not found';
  end if;

  insert into public.league_rsvps (tournament_id, person_id, status, responded_at)
  values (p_tournament_id, p_person_id, p_status, now())
  on conflict (tournament_id, person_id)
  do update set status = excluded.status, responded_at = excluded.responded_at;

  select id into v_existing_player_id from public.players
    where tournament_id = p_tournament_id and person_id = p_person_id;

  if p_status = 'in' then
    if v_existing_player_id is null
       and (v_tournament.max_players is null
            or (select count(*) from public.players where tournament_id = p_tournament_id) < v_tournament.max_players)
    then
      insert into public.players (tournament_id, name, person_id)
      select p_tournament_id, name, id from public.people where id = p_person_id;
    end if;
    -- If there's no room, the RSVP row above is still 'in' with no players row -- that
    -- absence of a players row IS the waiting-list membership.
  else
    if v_existing_player_id is not null then
      delete from public.players where id = v_existing_player_id;

      select r.person_id, pe.name into v_next_waiting
        from public.league_rsvps r
        join public.people pe on pe.id = r.person_id
        where r.tournament_id = p_tournament_id
          and r.status = 'in'
          and not exists (
            select 1 from public.players pl
            where pl.tournament_id = p_tournament_id and pl.person_id = r.person_id
          )
        order by r.responded_at asc
        limit 1;

      if v_next_waiting.person_id is not null then
        insert into public.players (tournament_id, name, person_id)
        values (p_tournament_id, v_next_waiting.name, v_next_waiting.person_id);
      end if;
    end if;
  end if;
end;
$$;

grant execute on function public.set_league_rsvp(uuid, uuid, text) to anon, authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260825150000_add_league_rsvps.sql
git commit -m "feat: add league_rsvps table and set_league_rsvp function"
```

**Note for the controller (not a task step):** this migration needs to be applied to the live Supabase project (same as the earlier `is_ad_hoc` migration this session) before this feature works at runtime. Confirm with the user how they want it applied — do not assume it happens automatically.

---

### Task 2: RSVP UI on the public League Playoffs page

**Files:**
- Modify: `apps/organizer-web/app/t/[id]/actions.ts`
- Create: `apps/organizer-web/app/t/[id]/RsvpRow.tsx`
- Create: `apps/organizer-web/app/t/[id]/LeagueRsvpList.tsx`
- Modify: `apps/organizer-web/app/t/[id]/page.tsx`

**Interfaces:**
- Consumes: `set_league_rsvp` RPC function (Task 1).
- Produces: `setLeagueRsvp(tournamentId: string, personId: string, prevState: SetRsvpState, formData: FormData): Promise<SetRsvpState>` and `type SetRsvpState = { error: string | null }`, exported from `actions.ts`; `RsvpRow` component with props `{ tournamentId: string; personId: string; personName: string; currentStatus: 'in' | 'out' | 'tentative' | null; statusLabel: string | null; isLocked: boolean }`; `LeagueRsvpList` component with props `{ tournamentId: string; organizerId: string; isLocked: boolean; confirmedPersonIds: Set<string> }`.

- [ ] **Step 1: Add the `setLeagueRsvp` Server Action**

The current `apps/organizer-web/app/t/[id]/actions.ts` ends with the `joinLeague` function (its last lines are the `revalidatePath` call and closing brace). Append this new export at the end of the file:

```ts

export type SetRsvpState = { error: string | null };

// Public, unauthenticated RSVP -- same trust model as joinLeague above: deliberately does
// NOT call requireOrganizer(). The set_league_rsvp() Postgres function (SECURITY DEFINER,
// supabase/migrations/20260825150000_add_league_rsvps.sql) is the sole write path and does
// its own authorization (person belongs to this organizer, tournament is League Playoffs,
// not completed, cutoff not passed) -- its raise exception messages are short and
// organizer-authored, so returning error.message directly here is safe, unlike a raw
// PostgREST error would be.
export async function setLeagueRsvp(
  tournamentId: string,
  personId: string,
  _prevState: SetRsvpState,
  formData: FormData
): Promise<SetRsvpState> {
  const status = formData.get('status');
  if (status !== 'in' && status !== 'out' && status !== 'tentative') {
    return { error: 'Invalid response.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_league_rsvp', {
    p_tournament_id: tournamentId,
    p_person_id: personId,
    p_status: status,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/t/${tournamentId}`);
  return { error: null };
}
```

(`createClient` and `revalidatePath` are already imported at the top of this file for `joinLeague` — no new imports needed.)

- [ ] **Step 2: Create `RsvpRow`**

Create `apps/organizer-web/app/t/[id]/RsvpRow.tsx`:

```tsx
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
```

- [ ] **Step 3: Create `LeagueRsvpList`**

Create `apps/organizer-web/app/t/[id]/LeagueRsvpList.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';
import RsvpRow from './RsvpRow';

export default async function LeagueRsvpList({
  tournamentId,
  organizerId,
  isLocked,
  confirmedPersonIds,
}: {
  tournamentId: string;
  organizerId: string;
  isLocked: boolean;
  confirmedPersonIds: Set<string>;
}) {
  const supabase = await createClient();

  const { data: people } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', organizerId)
    .order('name', { ascending: true });

  const { data: rsvps } = await supabase
    .from('league_rsvps')
    .select('person_id, status, responded_at')
    .eq('tournament_id', tournamentId);

  const rsvpByPersonId = new Map((rsvps ?? []).map((r) => [r.person_id, r]));

  const waitingIds = (rsvps ?? [])
    .filter((r) => r.status === 'in' && !confirmedPersonIds.has(r.person_id))
    .sort((a, b) => new Date(a.responded_at).getTime() - new Date(b.responded_at).getTime())
    .map((r) => r.person_id);
  const waitingPositionByPersonId = new Map(waitingIds.map((id, i) => [id, i + 1]));

  return (
    <ul className="space-y-2">
      {(people ?? []).map((person) => {
        const rsvp = rsvpByPersonId.get(person.id);
        const status = (rsvp?.status ?? null) as 'in' | 'out' | 'tentative' | null;
        let statusLabel: string | null = null;
        if (confirmedPersonIds.has(person.id)) {
          statusLabel = 'Confirmed';
        } else if (status === 'in') {
          statusLabel = `Waiting — #${waitingPositionByPersonId.get(person.id)}`;
        } else if (status === 'tentative') {
          statusLabel = 'Tentative';
        } else if (status === 'out') {
          statusLabel = 'Out';
        }

        return (
          <RsvpRow
            key={person.id}
            tournamentId={tournamentId}
            personId={person.id}
            personName={person.name}
            currentStatus={status}
            statusLabel={statusLabel}
            isLocked={isLocked}
          />
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Wire into the public page**

`apps/organizer-web/app/t/[id]/page.tsx` currently selects the tournament without `organizer_id`:

```ts
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, date, format, timeslot, max_players, completed_at, venues(name)')
    .eq('id', id)
    .single();
```

Change to:

```ts
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, date, format, timeslot, max_players, completed_at, organizer_id, venues(name)')
    .eq('id', id)
    .single();
```

Add two new imports after the existing `JoinLeagueForm` import:

```ts
import JoinLeagueForm from './JoinLeagueForm';
import LeagueRsvpList from './LeagueRsvpList';
```

After the existing:

```ts
  const playerCount = (players ?? []).length;
  const rosterFull = isRosterFull(tournament.max_players, playerCount);
  const remaining = slotsRemaining(tournament.max_players, playerCount);
```

add:

```ts
  const confirmedPersonIds = new Set(
    (players ?? [])
      .filter((p): p is typeof p & { person_id: string } => p.person_id !== null)
      .map((p) => p.person_id)
  );
  const isRsvpLocked = isLeaguePlayoffs && new Date(`${tournament.date}T17:00:00+04:00`) <= new Date();
```

Then change the whole "Join This League" card:

```tsx
        {!tournament.completed_at && (
          <div className={cardClass}>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Join This League</h2>
            <p className="text-sm text-slate-500 mb-3">
              {tournament.max_players != null
                ? `${playerCount}/${tournament.max_players} signed up — ${remaining} spot${remaining === 1 ? '' : 's'} left`
                : `${playerCount} signed up so far`}
            </p>
            {rosterFull ? (
              <p className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 font-semibold">
                This league is full ({playerCount}/{tournament.max_players}).
              </p>
            ) : (
              <JoinLeagueForm tournamentId={id} />
            )}
          </div>
        )}
```

to:

```tsx
        {!tournament.completed_at && (
          <div className={cardClass}>
            {isLeaguePlayoffs ? (
              <>
                <h2 className="text-lg font-bold text-slate-900 mb-2">Who&apos;s Playing</h2>
                <p className="text-sm text-slate-500 mb-3">
                  {tournament.max_players != null
                    ? `${playerCount}/${tournament.max_players} confirmed`
                    : `${playerCount} confirmed`}
                  {isRsvpLocked && ' · RSVP closed'}
                </p>
                <LeagueRsvpList
                  tournamentId={id}
                  organizerId={tournament.organizer_id}
                  isLocked={isRsvpLocked}
                  confirmedPersonIds={confirmedPersonIds}
                />
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-slate-900 mb-2">Join This League</h2>
                <p className="text-sm text-slate-500 mb-3">
                  {tournament.max_players != null
                    ? `${playerCount}/${tournament.max_players} signed up — ${remaining} spot${remaining === 1 ? '' : 's'} left`
                    : `${playerCount} signed up so far`}
                </p>
                {rosterFull ? (
                  <p className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 font-semibold">
                    This league is full ({playerCount}/{tournament.max_players}).
                  </p>
                ) : (
                  <JoinLeagueForm tournamentId={id} />
                )}
              </>
            )}
          </div>
        )}
```

(`isLeaguePlayoffs` is already declared earlier in this component as `const isLeaguePlayoffs = tournament.format === 'league_playoffs';` — no new variable needed there.)

- [ ] **Step 5: Verify**

Run: `npm run build` (from `apps/organizer-web`) — expect a clean TypeScript build.
Run: `npm test` (from `apps/organizer-web`) — expect all existing tests to still pass (none of these files have their own tests — see Global Constraints).

- [ ] **Step 6: Commit**

```bash
git add "apps/organizer-web/app/t/[id]/actions.ts" "apps/organizer-web/app/t/[id]/RsvpRow.tsx" "apps/organizer-web/app/t/[id]/LeagueRsvpList.tsx" "apps/organizer-web/app/t/[id]/page.tsx"
git commit -m "feat: add League Playoffs RSVP list with waiting list to public page"
```

---

## After all tasks

Run the full suite once more from `apps/organizer-web`: `npm test && npm run build`. Then:

1. **Apply the Task 1 migration to the live Supabase project** — the code will not work correctly at runtime without it, and neither `npm test` nor `npm run build` can catch a missing table/function in this codebase (no schema-typed Supabase client).
2. Manual verification against the live app: create a League Playoffs tournament with `max_players` set low (e.g. 3) for testing, open the public link, RSVP 4+ people "in" (as different browser sessions/incognito tabs, since there's no login gating who can click), confirm the 4th shows "Waiting — #1", confirm dropping one of the first 3 to "Out" promotes the waiting person into "Confirmed", confirm "Tentative" never appears in the confirmed count. Then set the tournament's date to today and manually verify the 5 PM Asia/Dubai cutoff disables the buttons (or test with a past date, where it should already be locked).
