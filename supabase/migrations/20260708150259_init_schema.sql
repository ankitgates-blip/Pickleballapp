create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

insert into public.venues (name) values ('Pickle Turf');

create table public.organizers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id),
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  name text not null,
  date date not null,
  target_score int not null default 11,
  win_by int not null default 2,
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  claimed_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_1_id uuid not null references public.players(id) on delete cascade,
  player_2_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round int not null,
  team_a_id uuid references public.teams(id) on delete cascade,
  team_b_id uuid references public.teams(id) on delete cascade,
  score_a int,
  score_b int,
  status text not null default 'pending' check (status in ('pending', 'complete')),
  created_at timestamptz not null default now()
);

-- Auto-create an organizer row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organizers (auth_user_id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper used by RLS policies below: is the current user the owner of this tournament?
create or replace function public.is_tournament_owner(t_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.tournaments t
    join public.organizers o on o.id = t.organizer_id
    where t.id = t_id and o.auth_user_id = auth.uid()
  );
$$;

alter table public.venues enable row level security;
alter table public.organizers enable row level security;
alter table public.tournaments enable row level security;
alter table public.players enable row level security;
alter table public.teams enable row level security;
alter table public.matches enable row level security;

-- Venues: readable by anyone (used by the public view and tournament creation).
create policy "venues_select_all" on public.venues for select using (true);

-- Organizers: a user can only see/manage their own row.
create policy "organizers_select_own" on public.organizers
  for select using (auth_user_id = auth.uid());
create policy "organizers_insert_own" on public.organizers
  for insert with check (auth_user_id = auth.uid());
create policy "organizers_update_own" on public.organizers
  for update using (auth_user_id = auth.uid());

-- Tournaments: readable by anyone (public view); writable only by the owning organizer.
create policy "tournaments_select_all" on public.tournaments for select using (true);
create policy "tournaments_insert_own" on public.tournaments
  for insert with check (
    organizer_id in (select id from public.organizers where auth_user_id = auth.uid())
  );
create policy "tournaments_update_own" on public.tournaments
  for update using (
    organizer_id in (select id from public.organizers where auth_user_id = auth.uid())
  );
create policy "tournaments_delete_own" on public.tournaments
  for delete using (
    organizer_id in (select id from public.organizers where auth_user_id = auth.uid())
  );

-- Players: readable by anyone (public view); writable only by the tournament's organizer.
create policy "players_select_all" on public.players for select using (true);
create policy "players_insert_own_tournament" on public.players
  for insert with check (public.is_tournament_owner(tournament_id));
create policy "players_update_own_tournament" on public.players
  for update using (public.is_tournament_owner(tournament_id));
create policy "players_delete_own_tournament" on public.players
  for delete using (public.is_tournament_owner(tournament_id));

-- Teams: same pattern as players.
create policy "teams_select_all" on public.teams for select using (true);
create policy "teams_insert_own_tournament" on public.teams
  for insert with check (public.is_tournament_owner(tournament_id));
create policy "teams_delete_own_tournament" on public.teams
  for delete using (public.is_tournament_owner(tournament_id));

-- Matches: same pattern, plus update (score entry).
create policy "matches_select_all" on public.matches for select using (true);
create policy "matches_insert_own_tournament" on public.matches
  for insert with check (public.is_tournament_owner(tournament_id));
create policy "matches_update_own_tournament" on public.matches
  for update using (public.is_tournament_owner(tournament_id));
