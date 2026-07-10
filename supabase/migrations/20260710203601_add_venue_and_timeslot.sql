insert into public.venues (name) values ('Picklers');

alter table public.tournaments add column timeslot text not null default 'evening'
  check (timeslot in ('morning', 'afternoon', 'evening'));
