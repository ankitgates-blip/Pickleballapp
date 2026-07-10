alter table public.tournaments drop constraint tournaments_format_check;
alter table public.tournaments add constraint tournaments_format_check check (format in (
  'round_robin',
  'popcorn',
  'gauntlet',
  'up_and_down_the_river',
  'claim_the_throne',
  'cream_of_the_crop',
  'double_header',
  'league_playoffs'
));

alter table public.matches add column stage text not null default 'league'
  check (stage in ('league', 'semifinal', 'final'));
