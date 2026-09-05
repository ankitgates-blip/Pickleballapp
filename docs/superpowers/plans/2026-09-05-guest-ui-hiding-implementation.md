# Guest UI-Hiding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the 10 owner-only controls (Cancel, Remove team, Remove player, Edit league details, Rename, Remove match, team-reassignment, Lock/Unlock Editing, Regenerate schedule, Edit Profile/Danger Zone) from a guest's view, instead of showing them and letting the server action throw when clicked.

**Architecture:** Every one of these controls already lives behind a server action gated by `requireOwner()` (shipped in the guest-access feature) — this plan only adds a `role === 'owner'` check around each control's JSX, in the 6 pages that render them. No new components, no new server logic, no schema changes.

**Tech Stack:** Next.js App Router Server Components, TypeScript.

## Global Constraints

- This is a UI-only change. No server action, RLS policy, or database logic changes at all — every control this plan touches is already correctly blocked server-side by `requireOwner()` (verified in the guest-access feature's own review). This plan only removes the control from a guest's view; a guest who somehow still reached one (a stale cached page, a direct API call) is still blocked by the existing server-side check.
- Every changed page must still render identically for an owner (`role === 'owner'`) — nothing in this plan changes owner-facing behavior, only what a guest (`role === 'guest'`) sees.
- `role` comes from `requireOrganizer()` (`lib/supabase/requireOrganizer.ts`), already returning `{ supabase, organizer, role }` — this plan only adds `role` to the existing destructure in 5 of the 6 pages (`app/tournaments/page.tsx` already destructures it).
- No new tests: every control this plan touches is presentational JSX (no new business logic), matching how every other page-level component in this app is verified — visually, not with a test file. Verification for this plan is `tsc`/`eslint`/`build` staying clean plus a manual dev-preview check simulating both roles.
- Every commit message ends with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Hide Cancel on the Tournaments list

**Files:**
- Modify: `apps/organizer-web/app/tournaments/TournamentCard.tsx`
- Modify: `apps/organizer-web/app/tournaments/page.tsx`

**Interfaces:**
- Produces: `TournamentCard`'s new optional `canCancel?: boolean` prop (default `true`, so any other caller of this component — there are none today, but the default keeps the component's existing contract source-compatible). Consumed only within this task.

- [ ] **Step 1: Add the `canCancel` prop to `TournamentCard`**

In `apps/organizer-web/app/tournaments/TournamentCard.tsx`, add `canCancel` to the props type:

```typescript
export type TournamentCardProps = {
  tournamentId: string;
  status: TournamentCardStatus;
  dateLabel: string;
  format: string;
  title: string;
  champion?: string;
  runnerUp?: string;
  venue: string;
  playerCount: number;
  matchesCount?: number;
  ctaHref: string;
  ctaLabel: string;
  cancelAction: () => Promise<void>;
  isCompleted?: boolean;
  canCancel?: boolean;
};
```

Destructure it with a default in the component signature (find the existing destructure and add `canCancel = true,` to it):

```typescript
export default function TournamentCard({
  tournamentId,
  status,
  dateLabel,
  format,
  title,
  champion,
  runnerUp,
  venue,
  playerCount,
  matchesCount,
  ctaHref,
  ctaLabel,
  cancelAction,
  isCompleted = false,
  canCancel = true,
}: TournamentCardProps) {
```

Find the bottom row:

```tsx
        <div className="flex items-center justify-between mt-1">
          <Link href={ctaHref} className="text-sm font-bold hover:underline" style={{ color: '#d6af36' }}>
            {ctaLabel} →
          </Link>
          <CancelTournamentButton tournamentName={title} cancelAction={cancelAction} isCompleted={isCompleted} />
        </div>
```

Replace with:

```tsx
        <div className="flex items-center justify-between mt-1">
          <Link href={ctaHref} className="text-sm font-bold hover:underline" style={{ color: '#d6af36' }}>
            {ctaLabel} →
          </Link>
          {canCancel && (
            <CancelTournamentButton tournamentName={title} cancelAction={cancelAction} isCompleted={isCompleted} />
          )}
        </div>
```

- [ ] **Step 2: Pass `canCancel` from the Tournaments page**

`apps/organizer-web/app/tournaments/page.tsx` already destructures `role` from `requireOrganizer()` (line 35). Find both `<TournamentCard>` call sites (there are exactly two — one in the upcoming-tournaments section, one in the completed-tournaments section) and add `canCancel={role === 'owner'}` as a prop to each. Each call site currently ends with a line like:

```tsx
                        cancelAction={cancelTournament.bind(null, t.id)}
```

Add the new prop immediately after that line in both places:

```tsx
                        cancelAction={cancelTournament.bind(null, t.id)}
                        canCancel={role === 'owner'}
```

- [ ] **Step 3: Type-check, lint**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint app/tournaments/TournamentCard.tsx app/tournaments/page.tsx
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/organizer-web/app/tournaments/TournamentCard.tsx apps/organizer-web/app/tournaments/page.tsx
git commit -m "feat: hide Cancel from guests on the Tournaments list"
```

---

### Task 2: Hide Remove on the Teams page

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/teams/page.tsx`

**Interfaces:**
- Consumes: `role` from `requireOrganizer()`, newly added to this page's destructure.

- [ ] **Step 1: Add `role` to the existing destructure**

Find (line 20):

```typescript
  const { supabase, organizer } = await requireOrganizer();
```

Replace with:

```typescript
  const { supabase, organizer, role } = await requireOrganizer();
```

- [ ] **Step 2: Hide the Remove-team form for guests**

Find the Remove form (inside the `fixedTeams.map` loop):

```tsx
                <form action={removeTeamForTeam}>
                  <SaveButton
                    className="text-xs font-semibold text-navy-mid hover:text-red-600 transition-colors disabled:opacity-50"
                    pendingLabel="Removing…"
                  >
                    Remove
                  </SaveButton>
                </form>
```

Replace with:

```tsx
                {role === 'owner' && (
                  <form action={removeTeamForTeam}>
                    <SaveButton
                      className="text-xs font-semibold text-navy-mid hover:text-red-600 transition-colors disabled:opacity-50"
                      pendingLabel="Removing…"
                    >
                      Remove
                    </SaveButton>
                  </form>
                )}
```

- [ ] **Step 3: Type-check, lint**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint "app/tournaments/[id]/teams/page.tsx"
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/teams/page.tsx"
git commit -m "feat: hide Remove team from guests"
```

---

### Task 3: Hide League Details and Remove-player on the Roster page

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/roster/page.tsx`

**Interfaces:**
- Consumes: `role` from `requireOrganizer()`, newly added to this page's destructure.

- [ ] **Step 1: Add `role` to the existing destructure**

Find (line 38):

```typescript
  const { supabase, organizer } = await requireOrganizer();
```

Replace with:

```typescript
  const { supabase, organizer, role } = await requireOrganizer();
```

- [ ] **Step 2: Hide the League Details card for guests**

Find:

```tsx
      {!isCompleted && (
        <div className={`${cardClass} mb-6`}>
          <h2 className="text-lg font-bold text-slate-900 mb-2">League Details</h2>
          <form action={updateTournamentDetailsWithId} className="flex flex-col sm:flex-row gap-3">
```

Change the opening condition to:

```tsx
      {!isCompleted && role === 'owner' && (
        <div className={`${cardClass} mb-6`}>
          <h2 className="text-lg font-bold text-slate-900 mb-2">League Details</h2>
          <form action={updateTournamentDetailsWithId} className="flex flex-col sm:flex-row gap-3">
```

(Only the opening `{!isCompleted && (` line changes to `{!isCompleted && role === 'owner' && (` — the closing `)}` for this block stays exactly where it already is; do not touch anything else inside this card.)

- [ ] **Step 3: Hide the Remove-player form for guests**

Find:

```tsx
                {!isCompleted && (
                  <form action={removePlayerForPlayer}>
                    <SaveButton
                      className="text-xs font-semibold text-navy-mid hover:text-red-600 transition-colors disabled:opacity-50"
                      pendingLabel="Removing…"
                    >
                      Remove
                    </SaveButton>
                  </form>
                )}
```

Replace the condition with:

```tsx
                {!isCompleted && role === 'owner' && (
                  <form action={removePlayerForPlayer}>
                    <SaveButton
                      className="text-xs font-semibold text-navy-mid hover:text-red-600 transition-colors disabled:opacity-50"
                      pendingLabel="Removing…"
                    >
                      Remove
                    </SaveButton>
                  </form>
                )}
```

- [ ] **Step 4: Type-check, lint**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint "app/tournaments/[id]/roster/page.tsx"
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/roster/page.tsx"
git commit -m "feat: hide League Details and Remove player from guests"
```

---

### Task 4: Hide the rename affordance on the Results page

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/results/EditableTournamentName.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/results/page.tsx`

**Interfaces:**
- Produces: `EditableTournamentName`'s new optional `editable?: boolean` prop (default `true`). Consumed by `results/page.tsx`.

- [ ] **Step 1: Add the `editable` prop to `EditableTournamentName`**

In `apps/organizer-web/app/tournaments/[id]/results/EditableTournamentName.tsx`, change the props type and destructure:

```typescript
export default function EditableTournamentName({
  tournamentId,
  initialName,
  renameAction,
  editable = true,
}: {
  tournamentId: string;
  initialName: string;
  renameAction: (tournamentId: string, formData: FormData) => Promise<{ name: string }>;
  editable?: boolean;
}) {
```

Find the `if (!isEditing)` branch:

```tsx
  if (!isEditing) {
    return (
      <h1 className="mb-1">
        <button
          type="button"
          onClick={() => {
            setIsEditing(true);
            setError(null);
          }}
          className="text-2xl font-bold text-slate-900 text-left hover:text-navy-mid transition-colors"
        >
          {name}
        </button>
      </h1>
    );
  }
```

Replace with:

```tsx
  if (!isEditing) {
    if (!editable) {
      return <h1 className="mb-1 text-2xl font-bold text-slate-900">{name}</h1>;
    }
    return (
      <h1 className="mb-1">
        <button
          type="button"
          onClick={() => {
            setIsEditing(true);
            setError(null);
          }}
          className="text-2xl font-bold text-slate-900 text-left hover:text-navy-mid transition-colors"
        >
          {name}
        </button>
      </h1>
    );
  }
```

(A guest with `editable={false}` can never call `setIsEditing(true)` in the first place — this branch is the only entry point into edit mode, so the `isEditing` branch below it becomes unreachable for a guest and needs no change.)

- [ ] **Step 2: Add `role` to the page's destructure and pass `editable`**

In `apps/organizer-web/app/tournaments/[id]/results/page.tsx`, find (line 41):

```typescript
  const { supabase, organizer } = await requireOrganizer();
```

Replace with:

```typescript
  const { supabase, organizer, role } = await requireOrganizer();
```

Find:

```tsx
      <EditableTournamentName tournamentId={id} initialName={tournament.name} renameAction={renameTournament} />
```

Replace with:

```tsx
      <EditableTournamentName
        tournamentId={id}
        initialName={tournament.name}
        renameAction={renameTournament}
        editable={role === 'owner'}
      />
```

- [ ] **Step 3: Type-check, lint**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint "app/tournaments/[id]/results/EditableTournamentName.tsx" "app/tournaments/[id]/results/page.tsx"
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/results/EditableTournamentName.tsx" "apps/organizer-web/app/tournaments/[id]/results/page.tsx"
git commit -m "feat: hide the rename affordance from guests on the Results page"
```

---

### Task 5: Hide the 4 owner-only controls on the Bracket page

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`

**Interfaces:**
- Consumes: `role` from `requireOrganizer()`, newly added to this page's destructure.

This page has 4 owner-only controls: Remove match, team-reassignment, Lock/Unlock Editing, and Regenerate Full Schedule.

- [ ] **Step 1: Add `role` to the existing destructure**

Find (line 29):

```typescript
  const { supabase, organizer } = await requireOrganizer();
```

Replace with:

```typescript
  const { supabase, organizer, role } = await requireOrganizer();
```

- [ ] **Step 2: Hide the Remove-match form**

Find:

```tsx
                  {isCustom && !isComplete && (
                    <form action={removeCustomMatchForMatch} className="mt-2 pl-1">
                      <SaveButton
                        className="text-xs font-semibold text-red-600 hover:text-red-800 underline"
                        pendingLabel="Removing…"
                      >
                        Remove match
                      </SaveButton>
                    </form>
                  )}
```

Change the condition to:

```tsx
                  {isCustom && !isComplete && role === 'owner' && (
                    <form action={removeCustomMatchForMatch} className="mt-2 pl-1">
                      <SaveButton
                        className="text-xs font-semibold text-red-600 hover:text-red-800 underline"
                        pendingLabel="Removing…"
                      >
                        Remove match
                      </SaveButton>
                    </form>
                  )}
```

- [ ] **Step 3: Hide the team-reassignment block**

Find:

```tsx
              {canEditTeamsValue && (
                <div className="mt-3 pl-1">
```

Change to:

```tsx
              {canEditTeamsValue && role === 'owner' && (
                <div className="mt-3 pl-1">
```

(Only this one opening line changes — the rest of the block, including its closing tags, stays exactly as-is.)

- [ ] **Step 4: Hide the Lock/Unlock Editing button**

Find:

```tsx
      {tournament?.completed_at && (
        <form
          action={tournament?.results_unlocked_at ? lockTournamentResultsWithId : unlockTournamentResultsWithId}
          className="mb-6"
        >
```

Change to:

```tsx
      {tournament?.completed_at && role === 'owner' && (
        <form
          action={tournament?.results_unlocked_at ? lockTournamentResultsWithId : unlockTournamentResultsWithId}
          className="mb-6"
        >
```

- [ ] **Step 5: Hide the Regenerate Full Schedule block**

Find:

```tsx
      {showRegenerateLeaguePlayoffsRounds && (
        <div className={`${actionCardClass} text-center mb-6`}>
```

Change to:

```tsx
      {showRegenerateLeaguePlayoffsRounds && role === 'owner' && (
        <div className={`${actionCardClass} text-center mb-6`}>
```

- [ ] **Step 6: Type-check, lint**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint "app/tournaments/[id]/bracket/page.tsx"
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx"
git commit -m "feat: hide Remove match, team reassignment, Lock/Unlock, and Regenerate from guests"
```

---

### Task 6: Hide Edit Profile and Danger Zone on a person's page

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/page.tsx`

**Interfaces:**
- Consumes: `role` from `requireOrganizer()`, newly added to this page's destructure.

- [ ] **Step 1: Add `role` to the existing destructure**

Find (line 45):

```typescript
  const { supabase, organizer } = await requireOrganizer();
```

Replace with:

```typescript
  const { supabase, organizer, role } = await requireOrganizer();
```

- [ ] **Step 2: Hide the whole "Edit Profile" details block**

Find the opening of this block:

```tsx
      <div className="mb-6">
        <details>
          <summary className="cursor-pointer text-sm font-bold text-navy-mid hover:text-navy-deep list-none mb-3">
            ✏️ Edit Profile
          </summary>
```

Change the wrapping `<div>` to conditionally render:

```tsx
      {role === 'owner' && (
        <div className="mb-6">
          <details>
            <summary className="cursor-pointer text-sm font-bold text-navy-mid hover:text-navy-deep list-none mb-3">
              ✏️ Edit Profile
            </summary>
```

This block's own closing tags are currently:

```tsx
        </details>
      </div>
```

(immediately before the Danger Zone `<div>`). Change these to:

```tsx
          </details>
        </div>
      )}
```

(Every line of JSX between the `<summary>` and this closing `</details>` — the photo upload form, the remove-photo form, and the full profile-edit form — is unchanged in content, only re-indented one level deeper as a natural consequence of the new wrapping `{role === 'owner' && (...)}`. Do not alter any of the form fields, labels, or actions inside.)

- [ ] **Step 3: Hide the Danger Zone block**

Find:

```tsx
      <div className={`${cardClass} border-red-200 bg-red-50 mb-6 max-w-md`}>
        <h2 className="text-sm font-bold text-red-800 mb-1">Danger Zone</h2>
        <p className="text-xs text-red-700 mb-3">
          Permanently deletes this player from the database — not just this profile, but
          every tournament roster, team, and match they're part of. Use this to remove a
          wrongly-created or misspelled player, not to undo a real result.
        </p>
        <DeletePersonButton personName={person.name} deleteAction={deletePersonWithId} />
      </div>
```

Replace with:

```tsx
      {role === 'owner' && (
        <div className={`${cardClass} border-red-200 bg-red-50 mb-6 max-w-md`}>
          <h2 className="text-sm font-bold text-red-800 mb-1">Danger Zone</h2>
          <p className="text-xs text-red-700 mb-3">
            Permanently deletes this player from the database — not just this profile, but
            every tournament roster, team, and match they're part of. Use this to remove a
            wrongly-created or misspelled player, not to undo a real result.
          </p>
          <DeletePersonButton personName={person.name} deleteAction={deletePersonWithId} />
        </div>
      )}
```

- [ ] **Step 4: Type-check, lint**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint "app/people/[id]/page.tsx"
```
Expected: this file has known, pre-existing `react/no-unescaped-entities` lint errors unrelated to this change (confirmed pre-existing on `main` many times across this project's history). Confirm your diff didn't add any NEW lint errors by comparing the error count/lines before and after your edit (`git stash`, lint, note the baseline; `git stash pop`, lint again, confirm no new lines appear) — do not attempt to fix the pre-existing errors, they are out of scope for this task.

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/page.tsx"
git commit -m "feat: hide Edit Profile and Danger Zone from guests"
```

---

### Task 7: Manual verification, full suite, push

**Files:**
- Create (temporary): none required — this task verifies against the real pages using a role override, not a new preview route, since these are Server Components reading `role` from `requireOrganizer()` and can't easily be re-rendered standalone with sample data the way a presentational card component can.

- [ ] **Step 1: Full automated verification**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx vitest run
npm run build
```
Expected: `tsc` clean; full test suite passes at its pre-existing count (no new tests added by this plan); build clean.

- [ ] **Step 2: Manual verification checklist for the user**

This plan's actual effect — a guest seeing fewer controls than an owner — can only be confirmed against the live, deployed app with a second real Google account signed in as a guest (the same limitation noted in the original guest-access plan: this session's tooling cannot reach an authenticated page, confirmed by repeatedly hitting the Google sign-in wall). After pushing, ask the user to sign in as their test guest account and confirm, on a tournament the owner already created:

1. Tournaments list: no "✕ Cancel" on any card.
2. Teams page: no "Remove" next to any paired team.
3. Roster page: no "League Details" card, no "Remove" next to any player.
4. Results page: the title is plain text, not clickable.
5. Bracket page: no "Remove match" on any custom match, no team-reassignment dropdowns on a completed-and-unlocked tournament, no "Lock/Unlock Editing" button, no "Regenerate Full Schedule" card.
6. A person's profile page (`/people/{id}`): no "✏️ Edit Profile" section, no "Danger Zone" card.
7. As the owner (sign back in), confirm all 9 of the above are still visible and functional exactly as before — this plan must not have hidden anything from the owner.

- [ ] **Step 3: Commit and push**

```bash
cd "C:\Users\ANKS\pickleball project"
git push origin main
```

Then poll `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1` until the run for the pushed commit shows `"conclusion": "success"`.
