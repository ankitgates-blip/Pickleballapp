# Profile Photo Upload — Design

Status: Approved.

## Goal

Let organizers upload a photo for a player's profile, and show it in three
places: the organizer-facing Player Detail page, the public share page, and
the PDF stats export.

## Data & Storage

- New nullable `people.photo_url text` column (migration, same pattern as
  every prior profile field).
- New **public** Supabase Storage bucket `player-photos`. Path convention:
  `{organizer_id}/{person_id}.{ext}` (`ext` derived from the upload's MIME
  type), uploaded with `upsert: true` so a re-upload cleanly replaces the
  same slot.
- RLS on `storage.objects`: insert/update/delete policies scoped to
  `(storage.foldername(name))[1] = <the caller's own organizer id>`,
  mirroring `people_insert_own`/`people_update_own`. No select policy is
  needed — a public bucket serves reads via its public URL endpoint without
  going through RLS, so display never needs an authenticated client.
- `people.photo_url` stores the full public URL with a cache-busting
  `?v=<timestamp>` query param, refreshed on every upload (the same storage
  path is reused on replace, so this defeats stale browser/CDN caching).
- On explicit removal: best-effort delete of the stored object (try the 3
  possible extensions, ignore not-found errors), then null the column
  regardless of storage-delete outcome — app state stays consistent even if
  storage cleanup partially fails.
- **Accepted trade-off:** if a person re-uploads in a different image format
  than their previous upload, the old-format object becomes a small
  orphaned file in storage. Not cleaned up — harmless (a few KB), not worth
  the extra delete-all-extensions-before-upload logic.

## Validation

- Accepted MIME types: `image/jpeg`, `image/png`, `image/webp`.
- Max size: 2MB.
- Re-validated server-side (type and size) — the client `accept`/size hints
  are never trusted as the sole check.

## Server Actions

`apps/organizer-web/app/people/[id]/actions.ts`:

- `uploadPersonPhoto(personId, formData)`: `requireOrganizer()` → validate
  the file (type, size) → upload to storage → `getPublicUrl` → write
  `photo_url`, scoped `.eq('id', personId).eq('organizer_id', organizer.id)`
  (same guard as `updatePersonProfile`) → `revalidatePath` both
  `/people/[id]` and the public `/p/[id]`.
- `removePersonPhoto(personId)`: `requireOrganizer()` → best-effort storage
  delete → null the column → same two `revalidatePath` calls.
- Both throw a plain `Error` on validation failure, consistent with every
  other action in this app.

## Display — shared `PersonAvatar` component

New `apps/organizer-web/app/components/PersonAvatar.tsx`: takes
`photoUrl: string | null`, `name: string`, `size` (px). Renders a plain
`<img>` (not `next/image` — avoids adding Supabase's storage domain to
`next.config.js`'s remote-image allowlist for what's a small avatar with no
real optimization upside) in a circular frame when `photoUrl` is set;
otherwise a navy/gold circle showing the name's first initial, matching the
app's existing brand tokens.

Used in:

- **Player Detail page** (`/people/[id]`): next to the `<h1>` name, ~80px.
- **Public share page** (`/p/[id]`): same component, ~64px, placed between
  the existing logo and the name in that page's centered header.
- The upload/remove controls live inside the existing "Edit Profile"
  `<details>` disclosure: a file input + "Upload Photo" button, plus a
  "Remove photo" button shown only when a photo is already set.

## PDF export

`SharePlayerStatsButton.tsx` (client-side jsPDF), given a `photoUrl` prop:
`fetch()` it, convert the blob to a data URL via `FileReader`,
`doc.addImage(...)` near the top of the PDF. If the fetch fails for any
reason (network, CORS) or `photoUrl` is null, skip embedding silently — the
PDF still generates, just without a photo, the same graceful-omission
pattern already used for `profileSummary`.

## Out of scope

- Cropping/resizing UI — the browser accepts whatever is uploaded up to
  2MB, displayed as-is inside a circular frame (`object-fit: cover`).
- Photo display anywhere besides the 3 listed places (Bracket/Standings/
  Team listings stay text-only).
- DUPR ID field and DUPR real-time sync (deferred by the organizer
  separately, tracked outside this spec).
