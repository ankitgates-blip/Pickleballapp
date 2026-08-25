-- Adds an optional contact line (phone/website/Instagram — whatever the organizer wants
-- shown) for use in the League Playoffs WhatsApp invite message. Nullable, no default:
-- every existing venue (Pickleturf, Picklers) starts as null, meaning "omit the contact
-- line" until the organizer has real text to enter. No RLS change needed -- venues has
-- no row-level security restricting read access beyond what already applies to the
-- existing `name` column, which is already readable everywhere venue names are shown
-- today, including the public /t/[id] page.
alter table public.venues add column contact_info text;
