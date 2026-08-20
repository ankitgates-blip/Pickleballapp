# Nickname Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free-text "Nickname" profile field, displayed as `Name (Nickname)` in the three places the player's name appears as a heading: the organizer's Player Detail page, the public share page, and the PDF export.

**Architecture:** A nullable `people.nickname text` column, a new field in the existing `updatePersonProfile` action, an input in the existing edit form, and a `Name (Nickname)` display computed at each of the three render sites.

**Tech Stack:** Next.js App Router Server Actions, Supabase Postgres, jsPDF (client-side).

## Global Constraints

- `people.nickname` is nullable free text, no length limit, no fixed options.
- Display format everywhere: `Name (Nickname)` when set, plain `Name` when not.
- Does NOT propagate to `players.name` or any other page showing a player's name (Bracket, Standings, Matches, Tournaments list, Match History) — those stay real-name-only.
- The PDF export's file name and native share-sheet title stay based on the real name only (not the combined display string) — only the PDF's visible heading line changes.
- `PersonAvatar`'s `name` prop (used for the initials fallback) stays the real name only, not the combined display string.

---

### Task 1: Migration — add `nickname` to `people`

**Files:**
- Create: `supabase/migrations/20260820180000_add_people_nickname.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260820180000_add_people_nickname.sql`:

```sql
alter table public.people add column nickname text;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260820180000_add_people_nickname.sql
git commit -m "feat: add nickname migration"
```

Note: not applied to the live database in this task — that happens in Task 5.

---

### Task 2: Add `nickname` to `updatePersonProfile`

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/actions.ts`

**Interfaces:**
- No new exports — `updatePersonProfile` keeps its exact signature, only its internals gain one more field.

- [ ] **Step 1: Read and write the `nickname` field**

In `apps/organizer-web/app/people/[id]/actions.ts`, find:

```typescript
  const name = (formData.get('name') as string)?.trim();
  if (!name) {
    throw new Error('Name is required');
  }

  const ageRaw = formData.get('age') as string;
```

Replace with:

```typescript
  const name = (formData.get('name') as string)?.trim();
  if (!name) {
    throw new Error('Name is required');
  }

  const nickname = (formData.get('nickname') as string)?.trim() || null;

  const ageRaw = formData.get('age') as string;
```

Find:

```typescript
    .update({
      name,
      age,
      handedness,
```

Replace with:

```typescript
    .update({
      name,
      nickname,
      age,
      handedness,
```

- [ ] **Step 2: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 156 tests still pass — this task adds no new pure-function logic.

- [ ] **Step 3: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/actions.ts"
git commit -m "feat: add nickname field to updatePersonProfile"
```

---

### Task 3: Wire nickname into the Player Detail page, edit form, and PDF export

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/page.tsx`
- Modify: `apps/organizer-web/app/people/[id]/SharePlayerStatsButton.tsx`

**Interfaces:**
- `SharePlayerStatsButtonProps` gains `nickname: string | null`.

This task touches both files together deliberately: `SharePlayerStatsButton`'s
new required `nickname` prop and its only caller in `page.tsx` must land in
the same commit, or the build breaks in between. Do the
`SharePlayerStatsButton.tsx` edits first (Steps 1-3), then the `page.tsx`
edits (Steps 4-8), then build once at the end (Step 9).

- [ ] **Step 1: Add the `nickname` prop type**

In `apps/organizer-web/app/people/[id]/SharePlayerStatsButton.tsx`, find:

```tsx
type SharePlayerStatsButtonProps = {
  personName: string;
  photoUrl: string | null;
```

Replace with:

```tsx
type SharePlayerStatsButtonProps = {
  personName: string;
  nickname: string | null;
  photoUrl: string | null;
```

- [ ] **Step 2: Destructure the new prop**

Find:

```tsx
export default function SharePlayerStatsButton({
  personName,
  photoUrl,
```

Replace with:

```tsx
export default function SharePlayerStatsButton({
  personName,
  nickname,
  photoUrl,
```

- [ ] **Step 3: Show the nickname in the PDF's name heading**

Find:

```tsx
      doc.setFontSize(13);
      doc.text(personName, 14, y);
      y += 7;
```

Replace with:

```tsx
      doc.setFontSize(13);
      doc.text(nickname ? `${personName} (${nickname})` : personName, 14, y);
      y += 7;
```

The file name (`sanitizeFileNamePart(personName)}-stats.pdf`) and the
native share-sheet title (`shareOrDownloadPdf(blob, fileName, personName)`)
further down are untouched — both keep using plain `personName`, per the
Global Constraints.

- [ ] **Step 4: Widen the `person` query in `page.tsx`**

In `apps/organizer-web/app/people/[id]/page.tsx`, find:

```tsx
    .select('id, name, handedness, age, playing_style, paddle_brand, signature_shot, photo_url, strengths')
```

Replace with:

```tsx
    .select('id, name, nickname, handedness, age, playing_style, paddle_brand, signature_shot, photo_url, strengths')
```

- [ ] **Step 5: Compute the display name and use it in the heading**

Find:

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
```

Replace with:

```tsx
  const updatePersonProfileWithId = updatePersonProfile.bind(null, person.id);
  const uploadPersonPhotoWithId = uploadPersonPhoto.bind(null, person.id);
  const removePersonPhotoWithId = removePersonPhoto.bind(null, person.id);
  const displayName = person.nickname ? `${person.name} (${person.nickname})` : person.name;

  return (
    <OrganizerShell organizerName={organizer.name}>
      <div className="flex items-center gap-4 mb-1">
        <PersonAvatar photoUrl={person.photo_url} name={person.name} size={80} />
        <h1 className="text-2xl font-bold text-slate-900">{displayName}</h1>
      </div>
```

`PersonAvatar`'s `name` prop stays `person.name` (real name only, used for
the initials fallback) — untouched, per the Global Constraints.

- [ ] **Step 6: Add the Nickname input to the edit form**

Find:

```tsx
            <label className="text-sm font-semibold text-slate-700">
              Name
              <input
                type="text"
                name="name"
                defaultValue={person.name}
                required
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Handedness
```

Replace with:

```tsx
            <label className="text-sm font-semibold text-slate-700">
              Name
              <input
                type="text"
                name="name"
                defaultValue={person.name}
                required
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Nickname
              <input
                type="text"
                name="nickname"
                defaultValue={person.nickname ?? ''}
                placeholder="e.g. Rocket"
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Handedness
```

- [ ] **Step 7: Pass `nickname` to `SharePlayerStatsButton`**

Find:

```tsx
        <SharePlayerStatsButton
          personName={person.name}
          photoUrl={person.photo_url}
```

Replace with:

```tsx
        <SharePlayerStatsButton
          personName={person.name}
          nickname={person.nickname}
          photoUrl={person.photo_url}
```

- [ ] **Step 8: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors (the `nickname` prop is
now both defined on `SharePlayerStatsButtonProps` and supplied by its only
caller); all 156 tests pass.

- [ ] **Step 9: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/page.tsx" "apps/organizer-web/app/people/[id]/SharePlayerStatsButton.tsx"
git commit -m "feat: display nickname on the Player Detail page and in the PDF"
```

---

### Task 4: Wire nickname into the public share page

**Files:**
- Modify: `apps/organizer-web/app/p/[id]/page.tsx`

- [ ] **Step 1: Widen the `person` query**

In `apps/organizer-web/app/p/[id]/page.tsx`, find:

```tsx
    .select('id, name, organizer_id, photo_url')
```

Replace with:

```tsx
    .select('id, name, nickname, organizer_id, photo_url')
```

- [ ] **Step 2: Show the nickname in the heading**

Find:

```tsx
          <div className="flex justify-center mb-2">
            <PersonAvatar photoUrl={person.photo_url} name={person.name} size={64} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{person.name}</h1>
```

Replace with:

```tsx
          <div className="flex justify-center mb-2">
            <PersonAvatar photoUrl={person.photo_url} name={person.name} size={64} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {person.nickname ? `${person.name} (${person.nickname})` : person.name}
          </h1>
```

- [ ] **Step 3: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 156 tests pass.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/p/[id]/page.tsx"
git commit -m "feat: display nickname on the public share page"
```

---

### Task 5: Apply the migration, push, verify CI, manual regression

**Files:** none (verification-only task).

- [ ] **Step 1: Apply the migration to the live database**

Using a fresh, transient Supabase personal access token (never persisted
to disk), apply Task 1's migration via the Supabase Management API's SQL
execution endpoint. Verify afterward: `people.nickname` exists, nullable,
existing rows read `null`.

- [ ] **Step 2: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 3: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 4: Manual regression**

On a player's `/people/[id]` page:

- Open "Edit Profile", confirm a "Nickname" text input appears right after
  Name, with the placeholder text.
- Type a nickname (e.g. "Rocket"), Save — confirm the heading now reads
  "Name (Rocket)".
- Confirm every other page section is unaffected.
- Open that player's public share link (`/p/[id]`) — confirm the heading
  there also reads "Name (Rocket)".
- Click "📤 Share Stats" — confirm the PDF's name line reads
  "Name (Rocket)", but the downloaded file's NAME (the actual filename) is
  still based on the plain name, with no "(Rocket)" in it.
- Clear the nickname, Save — confirm the heading reverts to plain "Name"
  everywhere (page, public link, PDF).
- Confirm the Bracket, Standings, Matches, Tournaments list, and Match
  History still show only the real name — no "(Rocket)" anywhere outside
  the 3 specified places.

Clean up any disposable test data used for this check afterward.
