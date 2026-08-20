# Profile Photo Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let organizers upload a player photo, stored in a public Supabase Storage bucket, shown on the organizer's Player Detail page, the public share page, and the PDF stats export.

**Architecture:** A nullable `people.photo_url` column plus a public `player-photos` Storage bucket with organizer-scoped write RLS. Two new server actions (`uploadPersonPhoto`/`removePersonPhoto`) built on a small pure validation helper. A shared `PersonAvatar` component renders the photo (or an initials placeholder) on both pages; the PDF exporter fetches the photo client-side and embeds it as a data URL.

**Tech Stack:** Next.js App Router Server Actions, Supabase Storage + Postgres RLS, Vitest, jsPDF.

## Global Constraints

- Accepted photo MIME types: `image/jpeg`, `image/png`, `image/webp`. Max size: 2MB. Re-validated server-side — never trust client-side hints alone.
- Storage path convention: `{organizer_id}/{person_id}.{ext}`, uploaded with `upsert: true`.
- `people.photo_url` stores the full public URL with a cache-busting `?v=<timestamp>` query param, refreshed on every upload.
- Bucket `player-photos` is public (no select RLS policy needed); insert/update/delete RLS scoped to the caller's own organizer id via `(storage.foldername(name))[1]`.
- Removal is best-effort on storage (try all 3 possible extensions, ignore errors) but always nulls `photo_url` regardless of storage-delete outcome.
- Avatar display uses a plain `<img>`, not `next/image` (avoids adding a remote-image domain to `next.config.js` for a small avatar with no real optimization upside).
- PDF embedding must fail silently (skip the image, keep generating the rest of the PDF) if the fetch fails or `photoUrl` is null — same graceful-omission pattern already used for `profileSummary`.
- Upload/remove controls live inside the existing "Edit Profile" `<details>` disclosure on `/people/[id]`, not a separate always-visible widget.

---

### Task 1: Migration — `photo_url` column + storage bucket + RLS

**Files:**
- Create: `supabase/migrations/20260820150000_add_people_photo_url_and_storage.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260820150000_add_people_photo_url_and_storage.sql`:

```sql
alter table public.people add column photo_url text;

insert into storage.buckets (id, name, public)
values ('player-photos', 'player-photos', true)
on conflict (id) do nothing;

create policy "player_photos_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'player-photos'
    and (storage.foldername(name))[1] = (
      select id::text from public.organizers where auth_user_id = auth.uid()
    )
  );

create policy "player_photos_update_own" on storage.objects
  for update using (
    bucket_id = 'player-photos'
    and (storage.foldername(name))[1] = (
      select id::text from public.organizers where auth_user_id = auth.uid()
    )
  );

create policy "player_photos_delete_own" on storage.objects
  for delete using (
    bucket_id = 'player-photos'
    and (storage.foldername(name))[1] = (
      select id::text from public.organizers where auth_user_id = auth.uid()
    )
  );
```

This mirrors the existing `people_insert_own`/`people_update_own` policy shape
(`organizer_id in (select id from public.organizers where auth_user_id =
auth.uid())`), adapted to the storage path's first folder segment. No
`to authenticated` clause is added, matching the existing `people` policies —
an anonymous caller's `auth.uid()` is null, so the subquery matches zero
organizer rows and the folder comparison is false, denying by default.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260820150000_add_people_photo_url_and_storage.sql
git commit -m "feat: add photo_url column and player-photos storage bucket"
```

Note: not applied to the live database in this task — that happens in Task 7.

---

### Task 2: Photo validation helper (TDD)

**Files:**
- Create: `apps/organizer-web/lib/people/photoValidation.ts`
- Test: `apps/organizer-web/lib/people/photoValidation.test.ts`

**Interfaces:**
- Produces: `ALLOWED_PHOTO_MIME_TO_EXT: Record<string, string>`,
  `MAX_PHOTO_BYTES: number`,
  `validatePhotoFile(file: { type: string; size: number }): string | null`
  (returns an error message, or `null` if the file is valid) — consumed by
  Task 3's server actions.

- [ ] **Step 1: Write the failing tests**

Create `apps/organizer-web/lib/people/photoValidation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validatePhotoFile, ALLOWED_PHOTO_MIME_TO_EXT, MAX_PHOTO_BYTES } from './photoValidation';

describe('validatePhotoFile', () => {
  it('accepts a valid JPEG under the size limit', () => {
    expect(validatePhotoFile({ type: 'image/jpeg', size: 1024 })).toBeNull();
  });

  it('accepts a valid PNG under the size limit', () => {
    expect(validatePhotoFile({ type: 'image/png', size: 1024 })).toBeNull();
  });

  it('accepts a valid WebP under the size limit', () => {
    expect(validatePhotoFile({ type: 'image/webp', size: 1024 })).toBeNull();
  });

  it('accepts a file exactly at the size limit', () => {
    expect(validatePhotoFile({ type: 'image/jpeg', size: MAX_PHOTO_BYTES })).toBeNull();
  });

  it('rejects an unsupported MIME type', () => {
    expect(validatePhotoFile({ type: 'image/gif', size: 1024 })).toBe(
      'Photo must be a JPEG, PNG, or WebP image'
    );
  });

  it('rejects a non-image MIME type', () => {
    expect(validatePhotoFile({ type: 'application/pdf', size: 1024 })).toBe(
      'Photo must be a JPEG, PNG, or WebP image'
    );
  });

  it('rejects a file over the size limit', () => {
    expect(validatePhotoFile({ type: 'image/jpeg', size: MAX_PHOTO_BYTES + 1 })).toBe(
      'Photo must be 2MB or smaller'
    );
  });

  it('maps each allowed MIME type to its extension', () => {
    expect(ALLOWED_PHOTO_MIME_TO_EXT).toEqual({
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/organizer-web && npx vitest run lib/people/photoValidation.test.ts`
Expected: FAIL — `Cannot find module './photoValidation'` (the file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

Create `apps/organizer-web/lib/people/photoValidation.ts`:

```typescript
export const ALLOWED_PHOTO_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export function validatePhotoFile(file: { type: string; size: number }): string | null {
  if (!ALLOWED_PHOTO_MIME_TO_EXT[file.type]) {
    return 'Photo must be a JPEG, PNG, or WebP image';
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return 'Photo must be 2MB or smaller';
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/organizer-web && npx vitest run lib/people/photoValidation.test.ts`
Expected: PASS — 8/8 tests passing

- [ ] **Step 5: Run the full suite**

Run: `cd apps/organizer-web && npm test`
Expected: all tests pass (148 pre-existing + 8 new = 156)

- [ ] **Step 6: Commit**

```bash
git add apps/organizer-web/lib/people/photoValidation.ts apps/organizer-web/lib/people/photoValidation.test.ts
git commit -m "feat: add photo file validation helper"
```

---

### Task 3: Server actions — upload/remove photo

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/actions.ts`

**Interfaces:**
- Consumes: `validatePhotoFile`, `ALLOWED_PHOTO_MIME_TO_EXT` from
  `@/lib/people/photoValidation` (Task 2).
- Produces: `uploadPersonPhoto(personId: string, formData: FormData): Promise<void>`,
  `removePersonPhoto(personId: string): Promise<void>` — both server actions,
  consumed by Task 5's page wiring (bound via `.bind(null, person.id)`, the
  same pattern `updatePersonProfile` already uses in that file).

- [ ] **Step 1: Add the imports and new actions**

In `apps/organizer-web/app/people/[id]/actions.ts`, find:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
```

Replace with:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { ALLOWED_PHOTO_MIME_TO_EXT, validatePhotoFile } from '@/lib/people/photoValidation';

const PLAYER_PHOTOS_BUCKET = 'player-photos';
const PHOTO_EXTENSIONS = ['jpg', 'png', 'webp'];
```

- [ ] **Step 2: Append the two new actions**

At the end of `apps/organizer-web/app/people/[id]/actions.ts` (after the
closing `}` of `updatePersonProfile`), add:

```typescript

export async function uploadPersonPhoto(personId: string, formData: FormData) {
  const { supabase, organizer } = await requireOrganizer();

  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('Choose a photo to upload');
  }

  const validationError = validatePhotoFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const ext = ALLOWED_PHOTO_MIME_TO_EXT[file.type];
  const path = `${organizer.id}/${personId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(PLAYER_PHOTOS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data: publicUrlData } = supabase.storage.from(PLAYER_PHOTOS_BUCKET).getPublicUrl(path);
  const photoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error } = await supabase
    .from('people')
    .update({ photo_url: photoUrl })
    .eq('id', personId)
    .eq('organizer_id', organizer.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/people/${personId}`);
  revalidatePath(`/p/${personId}`);
}

export async function removePersonPhoto(personId: string) {
  const { supabase, organizer } = await requireOrganizer();

  const pathsToRemove = PHOTO_EXTENSIONS.map((ext) => `${organizer.id}/${personId}.${ext}`);
  await supabase.storage.from(PLAYER_PHOTOS_BUCKET).remove(pathsToRemove);

  const { error } = await supabase
    .from('people')
    .update({ photo_url: null })
    .eq('id', personId)
    .eq('organizer_id', organizer.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/people/${personId}`);
  revalidatePath(`/p/${personId}`);
}
```

`removePersonPhoto`'s storage `.remove()` call result is intentionally
unchecked (best-effort per the spec — a not-found object shouldn't block
clearing `photo_url`).

- [ ] **Step 3: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 156 tests pass (this
task adds no new pure-function logic beyond Task 2's, which is already
covered).

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/actions.ts"
git commit -m "feat: add uploadPersonPhoto and removePersonPhoto server actions"
```

---

### Task 4: `PersonAvatar` shared component

**Files:**
- Create: `apps/organizer-web/app/components/PersonAvatar.tsx`

**Interfaces:**
- Produces: `PersonAvatar({ photoUrl: string | null; name: string; size:
  number }): JSX.Element` — a default export, consumed by Task 5 (Player
  Detail page) and Task 6 (public share page).

- [ ] **Step 1: Create the component**

Create `apps/organizer-web/app/components/PersonAvatar.tsx`:

```tsx
type PersonAvatarProps = {
  photoUrl: string | null;
  name: string;
  size: number;
};

export default function PersonAvatar({ photoUrl, name, size }: PersonAvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const style = { width: size, height: size };

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset next/image can optimize
      <img
        src={photoUrl}
        alt={name}
        style={style}
        className="rounded-full object-cover border-2 border-gold flex-shrink-0"
      />
    );
  }

  return (
    <div
      style={{ ...style, fontSize: size * 0.4 }}
      className="rounded-full bg-navy-mid text-gold font-bold flex items-center justify-center border-2 border-gold flex-shrink-0"
    >
      {initial}
    </div>
  );
}
```

- [ ] **Step 2: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript or ESLint errors (the
`eslint-disable` comment suppresses the expected `<img>`-vs-`next/image`
warning; confirm no other warnings appear for this file).

- [ ] **Step 3: Commit**

```bash
git add apps/organizer-web/app/components/PersonAvatar.tsx
git commit -m "feat: add PersonAvatar shared component"
```

---

### Task 5: Wire photo upload/display + PDF embedding into the Player Detail page

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/page.tsx`
- Modify: `apps/organizer-web/app/people/[id]/SharePlayerStatsButton.tsx`

**Interfaces:**
- Consumes: `PersonAvatar` (Task 4), `uploadPersonPhoto`/`removePersonPhoto`
  (Task 3).

This task touches both files together deliberately: `page.tsx` is the only
caller of `SharePlayerStatsButton`, so adding a required `photoUrl` prop to
one without updating the other in the same task would leave the build
broken between commits. Do the `SharePlayerStatsButton` changes first (Steps
1-2), then the `page.tsx` changes (Steps 3-7), then build once at the end.

- [ ] **Step 1: Add the `photoUrl` prop and a data-URL loader to `SharePlayerStatsButton`**

In `apps/organizer-web/app/people/[id]/SharePlayerStatsButton.tsx`, find:

```tsx
type SharePlayerStatsButtonProps = {
  personName: string;
  lastPlayedDate: string | null;
```

Replace with:

```tsx
type SharePlayerStatsButtonProps = {
  personName: string;
  photoUrl: string | null;
  lastPlayedDate: string | null;
```

Find:

```tsx
export default function SharePlayerStatsButton({
  personName,
  lastPlayedDate,
```

Replace with:

```tsx
async function loadPhotoDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export default function SharePlayerStatsButton({
  personName,
  photoUrl,
  lastPlayedDate,
```

- [ ] **Step 2: Fetch the photo alongside the dynamic imports and embed it**

Find:

```tsx
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);

      const doc = new jsPDF();
      let y = 16;
```

Replace with:

```tsx
      const [{ default: jsPDF }, { default: autoTable }, photoDataUrl] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
        photoUrl ? loadPhotoDataUrl(photoUrl) : Promise.resolve(null),
      ]);

      const doc = new jsPDF();
      let y = 16;

      if (photoDataUrl) {
        try {
          const format = photoDataUrl.includes('image/png')
            ? 'PNG'
            : photoDataUrl.includes('image/webp')
              ? 'WEBP'
              : 'JPEG';
          doc.addImage(photoDataUrl, format, 160, 10, 30, 30);
        } catch {
          // Malformed image data shouldn't break the rest of the export.
        }
      }
```

The image is placed in the top-right corner at a fixed position/size,
independent of the `y` cursor used by the rest of the document — it doesn't
shift any existing text or table layout.

- [ ] **Step 3: Add imports to `page.tsx`**

In `apps/organizer-web/app/people/[id]/page.tsx`, find:

```tsx
import { updatePersonProfile } from './actions';
```

Replace with:

```tsx
import { updatePersonProfile, uploadPersonPhoto, removePersonPhoto } from './actions';
import PersonAvatar from '@/app/components/PersonAvatar';
```

- [ ] **Step 4: Widen the `person` query**

Find:

```tsx
    .select('id, name, handedness, age, playing_style, paddle_brand, signature_shot, strengths')
```

Replace with:

```tsx
    .select('id, name, handedness, age, playing_style, paddle_brand, signature_shot, photo_url, strengths')
```

- [ ] **Step 5: Bind the new actions and render the avatar next to the name**

Find:

```tsx
  const updatePersonProfileWithId = updatePersonProfile.bind(null, person.id);

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">{person.name}</h1>
      <p className="text-sm text-slate-500">
```

Replace with:

```tsx
  const updatePersonProfileWithId = updatePersonProfile.bind(null, person.id);
  const uploadPersonPhotoWithId = uploadPersonPhoto.bind(null, person.id);
  const removePersonPhotoWithId = removePersonPhoto.bind(null, person.id);

  return (
    <OrganizerShell organizerName={organizer.name}>
      <div className="flex items-center gap-4 mb-1">
        <PersonAvatar photoUrl={person.photo_url} name={person.name} size={80} />
        <h1 className="text-2xl font-bold text-slate-900">{person.name}</h1>
      </div>
      <p className="text-sm text-slate-500">
```

- [ ] **Step 6: Add the photo upload/remove controls inside Edit Profile**

Find:

```tsx
          <summary className="cursor-pointer text-sm font-bold text-teal-700 hover:text-teal-800 list-none mb-3">
            ✏️ Edit Profile
          </summary>
          <form action={updatePersonProfileWithId} className={`${cardClass} flex flex-col gap-3 max-w-md`}>
```

Replace with:

```tsx
          <summary className="cursor-pointer text-sm font-bold text-teal-700 hover:text-teal-800 list-none mb-3">
            ✏️ Edit Profile
          </summary>
          <div className={`${cardClass} flex flex-col gap-3 max-w-md mb-3`}>
            <p className="text-sm font-semibold text-slate-700">Photo</p>
            <form action={uploadPersonPhotoWithId} className="flex items-center gap-2">
              <input
                type="file"
                name="photo"
                accept="image/jpeg,image/png,image/webp"
                required
                className="text-sm flex-1"
              />
              <button type="submit" className={primaryButtonClass}>
                Upload
              </button>
            </form>
            {person.photo_url && (
              <form action={removePersonPhotoWithId}>
                <button type="submit" className="text-xs font-semibold text-red-600 hover:underline">
                  Remove photo
                </button>
              </form>
            )}
          </div>
          <form action={updatePersonProfileWithId} className={`${cardClass} flex flex-col gap-3 max-w-md`}>
```

- [ ] **Step 7: Pass `photoUrl` to `SharePlayerStatsButton`**

Find:

```tsx
        <SharePlayerStatsButton
          personName={person.name}
          lastPlayedDate={stats.lastPlayedDate}
          starLabel={starLabel}
          profileSummary={profileSummary}
```

Replace with:

```tsx
        <SharePlayerStatsButton
          personName={person.name}
          photoUrl={person.photo_url}
          lastPlayedDate={stats.lastPlayedDate}
          starLabel={starLabel}
          profileSummary={profileSummary}
```

- [ ] **Step 8: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors (the `photoUrl` prop is
now both defined on `SharePlayerStatsButtonProps` and supplied by its only
caller); all 156 tests pass.

- [ ] **Step 9: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/page.tsx" "apps/organizer-web/app/people/[id]/SharePlayerStatsButton.tsx"
git commit -m "feat: wire photo upload, display, and PDF embedding into Player Detail page"
```

---

### Task 6: Wire photo display into the public share page

**Files:**
- Modify: `apps/organizer-web/app/p/[id]/page.tsx`

**Interfaces:**
- Consumes: `PersonAvatar` (Task 4).

- [ ] **Step 1: Add the import**

In `apps/organizer-web/app/p/[id]/page.tsx`, find:

```tsx
import { cardClass, pillClass } from '@/app/components/ui';
```

Replace with:

```tsx
import { cardClass, pillClass } from '@/app/components/ui';
import PersonAvatar from '@/app/components/PersonAvatar';
```

- [ ] **Step 2: Widen the `person` query**

Find:

```tsx
    .select('id, name, organizer_id')
```

Replace with:

```tsx
    .select('id, name, organizer_id, photo_url')
```

- [ ] **Step 3: Render the avatar between the logo and the name**

Find:

```tsx
          <Image src="/logo.png" alt="PicklerAlly DXB" width={40} height={40} className="mx-auto mb-2 rounded-full" />
          <h1 className="text-2xl font-bold tracking-tight">{person.name}</h1>
```

Replace with:

```tsx
          <Image src="/logo.png" alt="PicklerAlly DXB" width={40} height={40} className="mx-auto mb-2 rounded-full" />
          <div className="flex justify-center mb-2">
            <PersonAvatar photoUrl={person.photo_url} name={person.name} size={64} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{person.name}</h1>
```

- [ ] **Step 4: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors (this page's `person`
type gains `photo_url` with no other consumers to break); all 156 tests
pass.

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/p/[id]/page.tsx"
git commit -m "feat: display player photo on the public share page"
```

---

### Task 7: Apply the migration, push, verify CI, manual regression

**Files:** none (verification-only task).

- [ ] **Step 1: Apply the migration to the live database**

Using a fresh, transient Supabase personal access token (never persisted to
disk), apply Task 1's migration via the Supabase Management API's SQL
execution endpoint. Verify afterward:
- `people.photo_url` exists, nullable, existing rows read `null`.
- The `player-photos` bucket exists with `public = true`.
- All 3 storage policies (`player_photos_insert_own`,
  `player_photos_update_own`, `player_photos_delete_own`) exist on
  `storage.objects`.

- [ ] **Step 2: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 3: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 4: Manual regression**

On a player's `/people/[id]` page:

- Open "Edit Profile", confirm a "Photo" section with a file picker and
  "Upload" button appears above the Name field.
- Choose a JPEG/PNG/WebP under 2MB, click Upload — confirm the page shows
  the new photo next to the player's name (circular, no page-load errors).
- Confirm a "Remove photo" link now appears; the placeholder initial circle
  is gone.
- Try uploading a non-image file or a file over 2MB — confirm a clear error
  surfaces rather than a silent failure.
- Click "Remove photo" — confirm the avatar reverts to the initials
  placeholder and the "Remove photo" link disappears.
- Re-upload a photo, then open the player's public share link (`/p/[id]`)
  in a new/incognito tab — confirm the same photo displays there too.
- Click "📤 Share Stats" to generate the PDF — confirm the photo appears in
  the top-right corner of the first page.
- Remove the photo again and re-generate the PDF — confirm it still
  generates successfully with no photo and no error.

Clean up any disposable test photo/data used for this check afterward.
