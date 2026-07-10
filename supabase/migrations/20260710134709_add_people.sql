create table public.people (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.people enable row level security;

create policy "people_select_own" on public.people
  for select using (
    organizer_id in (select id from public.organizers where auth_user_id = auth.uid())
  );
create policy "people_insert_own" on public.people
  for insert with check (
    organizer_id in (select id from public.organizers where auth_user_id = auth.uid())
  );
create policy "people_update_own" on public.people
  for update using (
    organizer_id in (select id from public.organizers where auth_user_id = auth.uid())
  );

alter table public.players add column person_id uuid references public.people(id);

-- Backfill: create exactly one Person per existing players row that doesn't have one yet
-- (no fuzzy merging — two rows both named "Mike" become two separate people).
do $$
declare
  r record;
  new_person_id uuid;
begin
  for r in
    select p.id as player_id, p.name, t.organizer_id, p.created_at
    from public.players p
    join public.tournaments t on t.id = p.tournament_id
    where p.person_id is null
  loop
    insert into public.people (organizer_id, name, created_at)
    values (r.organizer_id, r.name, r.created_at)
    returning id into new_person_id;

    update public.players set person_id = new_person_id where id = r.player_id;
  end loop;
end $$;
