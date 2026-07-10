alter table public.tournaments
  add column format text not null default 'round_robin'
  check (format in (
    'round_robin',
    'popcorn',
    'gauntlet',
    'up_and_down_the_river',
    'claim_the_throne',
    'cream_of_the_crop',
    'double_header'
  ));
