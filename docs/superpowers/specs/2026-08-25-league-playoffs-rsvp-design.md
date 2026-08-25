# League Playoffs RSVP & Waiting List — Design

**Date:** 2026-08-25
**Status:** Approved for planning

## Problem

Organizers share a League Playoffs link via WhatsApp and currently get a free-text "type your name to join" form. The organizer wants the shared link to instead show every person they've ever recorded (their full People roster), each with a way to say **I'm In**, **I'm Out**, or **Tentative**. "In" responses fill the roster up to the tournament's `max_players` cap; once full, further "In" responses go to a live waiting list; dropping to "Out" (or "Tentative") frees the spot and immediately promotes the next waiting person. "Tentative" is purely informational — it never occupies a slot. All of this stays open until **5:00 PM Dubai time on the league's scheduled date**, after which responses lock.

## Scope decisions (resolved during brainstorming)

- **Invite list source:** every person in the organizer's `people` table (their full cross-tournament roster) — no manual per-tournament curation.
- **Replaces, not augments:** for League Playoffs specifically, this RSVP list replaces the existing free-text `JoinLeagueForm`/`joinLeague` sign-up entirely. Every other format keeps the existing free-text flow untouched.
- **Cap source:** reuses the tournament's existing `max_players` field (already on the creation form, already the basis for the current sign-up flow's capacity check) — not a new hardcoded number.
- **Tentative:** purely informational. Never counts toward `max_players`, never enters the waiting list, never blocks or triggers anyone else's promotion.
- **Cutoff:** 5:00 PM **Asia/Dubai** time on `tournaments.date`. After that instant, the set-RSVP function refuses all further changes — the public page renders read-only.
- **Scope:** League Playoffs only, matching the request literally. `joinLeague`/`JoinLeagueForm` are untouched for every other format.

## Architecture

### Data model

New table, one row per (tournament, person) response:

```sql
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

-- The public page needs to read current status for every invitee without being the organizer --
-- matches tournaments_select_all's existing "select using (true)" openness.
create policy "league_rsvps_select_public" on public.league_rsvps
  for select using (true);

-- No direct table-level INSERT/UPDATE grant to anon/authenticated -- all writes go through
-- the set_league_rsvp() function below, which is the sole, fully-validated write path. This
-- avoids the multi-round RLS hardening the earlier public-signup feature needed after the
-- fact (see supabase/migrations/20260824180000 and 20260824190000) by centralizing every
-- authorization check (person belongs to this organizer, tournament is League Playoffs, not
-- completed, cutoff not passed) in one reviewable place instead of spreading it across
-- policies and app code.
```

The existing `players` table is **unmodified** — a confirmed roster slot is exactly what it already is: an "in" RSVP that additionally has a `players` row (same `tournament_id`/`person_id` pair). The waiting list is derived, not stored separately: "in" RSVPs with no matching `players` row, ordered by `responded_at`. This means every other part of the app that reads `players` (teams, standings, bracket generation, roster counts) keeps working exactly as it does today — nothing downstream needs to learn a new "waiting" state.

### The state-machine function

A single `SECURITY DEFINER` Postgres function is the only way to change an RSVP. It does the whole upsert-then-promote sequence as one atomic transaction, so a drop-and-promote can never leave the roster in a half-updated state under concurrent requests:

```sql
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
    -- If there's no room, the RSVP row above is still 'in' with no players row --
    -- that absence of a players row IS the waiting-list membership.
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

`responded_at` resets to `now()` on every status change, including re-entering "in" after having been "out" — a re-join goes to the back of the waiting line, which is the fair, expected behavior. The `max_players is null` case (no cap set) means "in" always gets a `players` row immediately — no waiting list, matching how the existing free-text flow already treats an unset cap.

### Server Action wiring

`app/t/[id]/actions.ts` gets one new export:

```ts
export async function setLeagueRsvp(
  tournamentId: string,
  personId: string,
  status: 'in' | 'out' | 'tentative'
): Promise<{ error: string | null }> {
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

Deliberately not `requireOrganizer()` — this must be callable by an anonymous visitor, same trust model as `joinLeague` today. The function's own `raise exception` messages are short and organizer-authored (not raw Postgres codes), so surfacing `error.message` directly to the visitor is safe here, unlike the earlier public-signup feature's raw-PostgREST-error problem.

### Public page (`app/t/[id]/page.tsx`)

For `format === 'league_playoffs'` only, replace the `JoinLeagueForm` section with a new `LeagueRsvpList` client component. The page queries: every `people` row for this organizer, LEFT JOIN `league_rsvps` for this tournament (current status per person), and the current `players` roster (to know who already holds a confirmed slot). From that it derives, per person: `confirmed` (in `players`), `waiting` (status='in', not in `players`, with a 1-based waiting position), `tentative`, `out`, or no response yet. The page also computes the cutoff instant server-side (`tournament.date` + 17:00 Asia/Dubai) and passes `isLocked: boolean` down.

The component renders one row per person: name, a status badge ("Confirmed", "Waiting — #2", "Tentative", "Out", or nothing), and three buttons (I'm In / I'm Out / Tentative) that call `setLeagueRsvp` bound to that person, highlighting whichever is currently selected. When `isLocked` is true, the buttons render disabled with a "RSVP closed" note instead — the function would reject the write anyway, but disabling client-side avoids a pointless round trip and a confusing error.

No changes needed to how the link gets shared — the organizer's existing WhatsApp share button already points at `/t/[id]`; this feature only changes what that page shows for League Playoffs.

## Testing

- No new pure `lib/tournament/*.ts` logic is introduced — the state machine lives entirely in the Postgres function, which is the correct place for atomicity but means it isn't Vitest-testable the way this codebase's existing pure functions are. Verified instead via `npm run build` (typecheck) + manual testing against a real Supabase instance: create a League Playoffs tournament with `max_players` set low (e.g. 3) for testing, RSVP 4+ people "in," confirm the 4th shows "Waiting — #1," confirm dropping one of the first 3 to "out" promotes the waiting person, confirm "tentative" never appears in either count.
- `app/t/[id]/actions.ts`, `app/t/[id]/page.tsx`, and the new `LeagueRsvpList` component have zero automated test coverage, by this codebase's established convention (confirmed repeatedly this session) — `npm run build` + `npm test` (regression) only.
- Migration and function are schema-only; no test file, matching every other migration in this codebase.

## Out of scope

- Extending RSVP to other formats.
- Any admin UI for the organizer to see/override RSVPs directly (they can still use existing roster tools — Teams page pairing, player removal — after the cutoff).
- Notifying people when they're promoted off the waiting list (no notification system exists in this app).
- Editing `max_players` after RSVPs have started (existing tournament-edit surface doesn't cover this field today; not introduced here).
