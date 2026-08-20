alter table public.people
  alter column signature_shot type text[]
    using case when signature_shot is null then array[]::text[] else array[signature_shot] end,
  alter column signature_shot set default '{}',
  alter column signature_shot set not null;
