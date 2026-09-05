-- Post-merge fixes for the guest access feature (see final whole-branch
-- review, 2026-09-05): guests could never sign in, and one guest-allowed
-- action could silently corrupt a tournament's schedule.

-- Fix 1: organizers had no member-level SELECT policy, so
-- requireOrganizer()'s embedded `organizers(id, name)` lookup came back
-- null for every guest (the row belongs to the owner's auth_user_id, not
-- theirs) -- they were redirected to /login before ever reaching the app.
create policy "organizers_select_member" on public.organizers
  for select using (id = public.current_organizer_id());

-- Fix 4: claim the invite atomically (was: unlocked SELECT then a
-- separate DELETE, racy against a concurrent duplicate signup or an
-- owner revoking the invite mid-signup).
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
  delete from public.guest_invites
  where id = (
    select id from public.guest_invites
    where lower(email) = lower(new.email)
    limit 1
    for update skip locked
  )
  returning * into matched_invite;

  if matched_invite.id is not null then
    insert into public.organizer_members (organizer_id, auth_user_id, email, role)
    values (matched_invite.organizer_id, new.id, new.email, 'guest');
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

-- Fix 3: a second claim path for RETURNING users with no membership row
-- (e.g. a removed-then-reinvited guest) -- handle_new_user() above only
-- ever fires once, on original account creation, so it can't help them.
-- Safe to call unconditionally on every sign-in: a no-op if the caller
-- already has a membership row or there's nothing pending for their email.
create or replace function public.claim_pending_guest_invite()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_invite public.guest_invites%rowtype;
  caller_email text;
begin
  if exists (select 1 from public.organizer_members where auth_user_id = auth.uid()) then
    return;
  end if;

  select email into caller_email from auth.users where id = auth.uid();
  if caller_email is null then
    return;
  end if;

  delete from public.guest_invites
  where id = (
    select id from public.guest_invites
    where lower(email) = lower(caller_email)
    limit 1
    for update skip locked
  )
  returning * into matched_invite;

  if matched_invite.id is not null then
    insert into public.organizer_members (organizer_id, auth_user_id, email, role)
    values (matched_invite.organizer_id, auth.uid(), caller_email, 'guest');
  end if;
end;
$$;

grant execute on function public.claim_pending_guest_invite() to authenticated;
