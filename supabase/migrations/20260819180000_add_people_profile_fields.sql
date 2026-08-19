alter table public.people add column handedness text;
alter table public.people add column age integer;
alter table public.people add column playing_style text;
alter table public.people add column strengths text[] not null default '{}';
