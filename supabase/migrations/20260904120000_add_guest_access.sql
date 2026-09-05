-- Guest access: a workspace ("organizer") can now have more than one
-- signed-in person acting on it. organizer_members is the membership row
-- that used to be implicit in organizers.auth_user_id being unique; email
-- is duplicated here (not looked up from auth.users, a protected schema
-- the app's normal client can't query) so the Settings page can show who a
-- guest is without a second privileged lookup.
create table public.organizer_members (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'guest')),
  created_at timestamptz not null default now()
);

-- Pending guest invites, matched by email at sign-in time and deleted once claimed.
create table public.guest_invites (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (organizer_id, email)
);

alter table public.organizer_members enable row level security;
alter table public.guest_invites enable row level security;

-- Backfill: every existing organizer becomes their own 'owner' member.
-- (organizers.name isn't necessarily an email, so email is copied from
-- auth.users -- this migration runs with elevated privileges and can read
-- the protected auth schema directly, unlike the app's normal client.)
insert into public.organizer_members (organizer_id, auth_user_id, email, role)
select o.id, o.auth_user_id, u.email, 'owner'
from public.organizers o
join auth.users u on u.id = o.auth_user_id;

-- Helper functions used by RLS policies below (security definer so they
-- read organizer_members/organizers without RLS recursion -- the exact
-- pattern is_tournament_owner() already used successfully in this schema).
create or replace function public.current_organizer_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select organizer_id from public.organizer_members where auth_user_id = auth.uid();
$$;

create or replace function public.current_organizer_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.organizer_members where auth_user_id = auth.uid();
$$;

-- Generalizes is_tournament_owner(t_id): true for the owner OR a guest of
-- the tournament's workspace. Existing callers of is_tournament_owner keep
-- working unchanged (kept as an alias) except where noted below.
create or replace function public.is_organizer_member(t_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = t_id and t.organizer_id = public.current_organizer_id()
  );
$$;

create or replace function public.is_organizer_owner(t_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_organizer_member(t_id) and public.current_organizer_role() = 'owner';
$$;

-- is_tournament_owner is still referenced by its original name nowhere
-- after this migration (every call site below is rewritten), but is kept
-- defined as an alias rather than dropped, in case anything outside this
-- repo's tracked migrations depends on it.
create or replace function public.is_tournament_owner(t_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_organizer_member(t_id);
$$;

-- Rewrite handle_new_user(): check the guest_invites allowlist before
-- creating a brand-new workspace.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_invite public.guest_invites%rowtype;
  new_organizer_id uuid;
begin
  -- If the same email were ever invited by two different organizers (not
  -- possible today -- there is exactly one real owner in this app -- but
  -- not prevented by the schema either), this picks one arbitrarily
  -- (no order by). Acceptable for the current single-owner scale; would
  -- need real handling before a second independent organizer workspace
  -- ever exists.
  select * into matched_invite
  from public.guest_invites
  where lower(email) = lower(new.email)
  limit 1;

  if found then
    insert into public.organizer_members (organizer_id, auth_user_id, email, role)
    values (matched_invite.organizer_id, new.id, new.email, 'guest');

    delete from public.guest_invites where id = matched_invite.id;
  else
    insert into public.organizers (auth_user_id, name)
    values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email))
    returning id into new_organizer_id;

    insert into public.organizer_members (organizer_id, auth_user_id, email, role)
    values (new_organizer_id, new.id, new.email, 'owner');
  end if;

  return new;
end;
$$;

-- organizer_members RLS: anyone can read their own membership row (needed
-- by requireOrganizer() before their organizer_id is known); an owner can
-- also read/remove the guest rows in their own workspace. Only the trigger
-- (security definer, bypasses RLS) ever inserts a row.
create policy "organizer_members_select_self" on public.organizer_members
  for select using (auth_user_id = auth.uid());
create policy "organizer_members_select_workspace_owner" on public.organizer_members
  for select using (
    organizer_id = public.current_organizer_id()
    and public.current_organizer_role() = 'owner'
  );
create policy "organizer_members_delete_guest_by_owner" on public.organizer_members
  for delete using (
    organizer_id = public.current_organizer_id()
    and public.current_organizer_role() = 'owner'
    and role = 'guest'
  );

-- guest_invites RLS: owner-only, scoped to their own workspace.
create policy "guest_invites_all_owner" on public.guest_invites
  for all using (
    organizer_id = public.current_organizer_id()
    and public.current_organizer_role() = 'owner'
  )
  with check (
    organizer_id = public.current_organizer_id()
    and public.current_organizer_role() = 'owner'
  );

-- tournaments: INSERT and UPDATE become member-level (owner OR guest) --
-- UPDATE can't be split further in SQL because enterScore/skipMatch
-- (guest-allowed) and generateLeaguePlayoffsBracket (guest-allowed) share
-- the UPDATE verb on this table with renameTournament/updateTournamentDetails/
-- unlockTournamentResults/lockTournamentResults (owner-only); that split is
-- enforced by requireOwner() in Task 3. DELETE (cancelTournament) becomes
-- owner-only.
drop policy "tournaments_insert_own" on public.tournaments;
drop policy "tournaments_update_own" on public.tournaments;
drop policy "tournaments_delete_own" on public.tournaments;

create policy "tournaments_insert_member" on public.tournaments
  for insert with check (organizer_id = public.current_organizer_id());
create policy "tournaments_update_member" on public.tournaments
  for update using (organizer_id = public.current_organizer_id());
create policy "tournaments_delete_owner" on public.tournaments
  for delete using (
    organizer_id = public.current_organizer_id()
    and public.current_organizer_role() = 'owner'
  );

-- players: INSERT stays member-level; DELETE (removePlayer) becomes
-- owner-only. UPDATE also becomes owner-only -- the only players UPDATE in
-- the app is the owner-only updatePersonProfile rename cascade, so this
-- needs no member/owner split, unlike tournaments/matches.
drop policy "players_update_own_tournament" on public.players;
drop policy "players_delete_own_tournament" on public.players;

create policy "players_update_owner" on public.players
  for update using (public.is_organizer_owner(tournament_id));
create policy "players_delete_owner" on public.players
  for delete using (public.is_organizer_owner(tournament_id));

-- teams: DELETE (removeTeam) becomes owner-only. (No teams UPDATE policy
-- exists today; none is added.)
drop policy "teams_delete_own_tournament" on public.teams;

create policy "teams_delete_owner" on public.teams
  for delete using (public.is_organizer_owner(tournament_id));

-- matches: UPDATE stays member-level for the same reason as tournaments
-- (enterScore/skipMatch vs. updateMatchTeams share the UPDATE verb; split
-- enforced by requireOwner() in Task 3). DELETE becomes owner-only.
drop policy "matches_update_own_tournament" on public.matches;
drop policy "matches_delete_own_tournament" on public.matches;

create policy "matches_update_member" on public.matches
  for update using (public.is_organizer_member(tournament_id));
create policy "matches_delete_owner" on public.matches
  for delete using (public.is_organizer_owner(tournament_id));

-- people: UPDATE and DELETE become owner-only (every people/[id]/actions.ts
-- action is owner-only). INSERT stays member-level (confirmAddPlayers /
-- addExistingPeople, both guest-allowed, insert into people).
drop policy "people_update_own" on public.people;
drop policy "people_delete_own" on public.people;

create policy "people_update_owner" on public.people
  for update using (
    organizer_id = public.current_organizer_id()
    and public.current_organizer_role() = 'owner'
  );
create policy "people_delete_owner" on public.people
  for delete using (
    organizer_id = public.current_organizer_id()
    and public.current_organizer_role() = 'owner'
  );
