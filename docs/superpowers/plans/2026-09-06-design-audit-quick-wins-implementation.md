# Design Audit Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 11 "quick win" fixes from the app-wide design audit — token adoption, a real contrast bug, a settings restyle, two component extractions, dead-code cleanup, a11y labels, one copy fix, and two sizing fixes.

**Architecture:** No new architecture — every fix applies an already-existing pattern (tokens, `cardClass`/`inputClass`, `stat-num`) or extracts an already-duplicated pattern into a shared component. Twelve independent tasks, each touching a small, disjoint set of files.

**Tech Stack:** Next.js App Router, Tailwind, Vitest.

## Global Constraints

- No new visual language — every fix reuses a color, class, or component pattern already established elsewhere in this app.
- No new tests except for `AlertBanner`'s tone→class mapping (a small pure function, the same class of logic as `medalStops()` in `leaderboardPalette.ts`, which already has its own test file).
- Every commit message ends with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Token adoption on the public player page

**Files:**
- Modify: `apps/organizer-web/app/p/[id]/page.tsx`

- [ ] **Step 1: Fix the star color**

Find (line 390):
```tsx
                        <span className="text-amber-400">
```
Replace with:
```tsx
                        <span className="text-gold-bright">
```

- [ ] **Step 2: Fix the win/loss pill colors**

Find (line 508):
```tsx
                      <span className={`${pillClass} ${m.won ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
```
Replace with:
```tsx
                      <span className={`${pillClass} ${m.won ? 'bg-win/10 text-win' : 'bg-loss/10 text-loss'}`}>
```
(This matches exactly what `app/people/[id]/page.tsx:821` already does for the identical W/L pill.)

- [ ] **Step 3: Type-check, lint**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint "app/p/[id]/page.tsx"
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/p/[id]/page.tsx"
git commit -m "fix: adopt win/loss/gold tokens on the public player page"
```

---

### Task 2: Fix the podium metal color/contrast bug on Standings

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/standings/page.tsx`

**Interfaces:**
- Produces: an updated `PODIUM_BLOCK_STYLE` array shape (adds a `textColor` field), consumed only within this file.

- [ ] **Step 1: Fix the color values and add a per-rank text color**

Find:
```typescript
const PODIUM_BLOCK_STYLE = [
  { height: 108, background: 'linear-gradient(180deg,#fde68a,#d4a017)' }, // 1st -- gold
  { height: 56, background: 'linear-gradient(180deg,#cbd5e1,#94a3b8)' }, // 2nd -- silver
  { height: 50, background: 'linear-gradient(180deg,#fdba74,#c2703d)' }, // 3rd -- bronze
];
```
Replace with:
```typescript
// Colors match --color-silver-light/--color-silver and --color-bronze/
// --color-bronze-dark in globals.css (inline hex here, not Tailwind classes,
// since these feed a data-driven linear-gradient). The previous silver/bronze
// values had bronze's highlight LIGHTER than silver's, so the podium read
// gold/bronze/silver in greyscale -- these are reordered so silver is
// genuinely brighter than bronze. Silver's new lighter background also needs
// dark rank-number text instead of white (see textColor below), or the
// numeral disappears against it.
const PODIUM_BLOCK_STYLE = [
  { height: 108, background: 'linear-gradient(180deg,#fde68a,#d4a017)', textColor: 'text-white' }, // 1st -- gold
  { height: 56, background: 'linear-gradient(180deg,#d7d7d7,#a7a7ad)', textColor: 'text-navy-deep' }, // 2nd -- silver
  { height: 50, background: 'linear-gradient(180deg,#a77044,#824a02)', textColor: 'text-white' }, // 3rd -- bronze
];
```

- [ ] **Step 2: Use the new `textColor` field for the rank numeral**

Find:
```tsx
              <span className={rank === 0 ? 'text-white font-black text-2xl' : 'text-white font-black text-lg'}>
                {rank + 1}
              </span>
```
Replace with:
```tsx
              <span className={`${style.textColor} font-black ${rank === 0 ? 'text-2xl' : 'text-lg'}`}>
                {rank + 1}
              </span>
```

- [ ] **Step 3: Type-check, lint**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint "app/tournaments/[id]/standings/page.tsx"
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/standings/page.tsx"
git commit -m "fix: podium metal colors were inverted in greyscale; fix silver's rank-number contrast"
```

---

### Task 3: Restyle `/settings` onto the design system

**Files:**
- Modify: `apps/organizer-web/app/settings/page.tsx`

- [ ] **Step 1: Rewrite the page using the shared design tokens**

Replace the full contents of `apps/organizer-web/app/settings/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import SaveButton from '@/app/components/SaveButton';
import { cardClass, inputClass, primaryButtonClass, headingClass } from '@/app/components/ui';
import { addGuestInvite, removeGuestInvite, removeGuestMember } from './actions';

export default async function SettingsPage() {
  const { supabase, organizer, role } = await requireOrganizer();

  if (role !== 'owner') {
    redirect('/tournaments');
  }

  const { data: guests } = await supabase
    .from('organizer_members')
    .select('id, email')
    .eq('organizer_id', organizer.id)
    .eq('role', 'guest')
    .order('created_at', { ascending: true });

  const { data: invites } = await supabase
    .from('guest_invites')
    .select('id, email')
    .eq('organizer_id', organizer.id)
    .order('created_at', { ascending: true });

  return (
    <OrganizerShell organizerName={organizer.name} role={role}>
      <h1 className={`text-2xl ${headingClass} mb-2`}>Guests</h1>
      <p className="text-sm text-muted mb-4">
        A guest can create tournaments and leagues, generate rounds, and enter scores —
        they can never delete or edit anything.
      </p>

      <form action={addGuestInvite} className={`${cardClass} flex gap-2 mb-6`}>
        <input
          type="email"
          name="email"
          required
          placeholder="guest@gmail.com"
          className={`flex-1 ${inputClass}`}
        />
        <SaveButton className={primaryButtonClass} pendingLabel="Adding…">
          Add guest
        </SaveButton>
      </form>

      <div className="space-y-2">
        {(guests ?? []).map((g) => {
          const removeGuestMemberWithId = removeGuestMember.bind(null, g.id);
          return (
            <div key={g.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <span className="text-sm">{g.email}</span>
              <form action={removeGuestMemberWithId}>
                <SaveButton className="text-sm text-red-600 font-semibold" pendingLabel="Removing…">
                  Remove
                </SaveButton>
              </form>
            </div>
          );
        })}
        {(invites ?? []).map((i) => {
          const removeGuestInviteWithId = removeGuestInvite.bind(null, i.id);
          return (
            <div key={i.id} className="flex items-center justify-between rounded-lg border border-dashed border-slate-300 px-3 py-2">
              <span className="text-sm text-slate-500">{i.email} (pending)</span>
              <form action={removeGuestInviteWithId}>
                <SaveButton className="text-sm text-red-600 font-semibold" pendingLabel="Removing…">
                  Cancel invite
                </SaveButton>
              </form>
            </div>
          );
        })}
        {(guests ?? []).length === 0 && (invites ?? []).length === 0 && (
          <p className="text-sm text-slate-500">No guests yet.</p>
        )}
      </div>
    </OrganizerShell>
  );
}
```

(Every prop/logic line — `requireOrganizer()`, the redirect, both Supabase queries, the `.bind(null, id)` calls, the map/empty-state logic — is byte-identical to before. Only class names changed: `rounded`→`rounded-lg` on the guest/invite rows (matching this app's actual radius scale, since plain `rounded` appears nowhere else in the codebase), the input/button/heading swapped onto shared classes, and the add-guest form now sits inside `cardClass` instead of bare.)

- [ ] **Step 2: Type-check, lint**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint app/settings/page.tsx
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/organizer-web/app/settings/page.tsx
git commit -m "fix: restyle /settings onto the shared design system"
```

---

### Task 4: Move Danger Zone to the bottom of the profile page

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/page.tsx`

- [ ] **Step 1: Remove the Danger Zone block from its current position**

Find and delete this whole block (it currently sits directly after the Edit Profile `{role === 'owner' && (...)}` block closes):

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

- [ ] **Step 2: Re-add the identical block at the end of the page**

The page's last section is the Match History `<ul>`, wrapped in its own `<div>` that closes immediately before `</OrganizerShell>`. Find that closing structure:

```tsx
          {stats.matchHistory.length === 0 && (
            <li className="text-muted">No completed matches yet.</li>
          )}
        </ul>
      </div>
    </OrganizerShell>
  );
}
```

Replace with (inserting the Danger Zone block, unchanged from Step 1, right after Match History's closing `</div>` and before `</OrganizerShell>`):

```tsx
          {stats.matchHistory.length === 0 && (
            <li className="text-muted">No completed matches yet.</li>
          )}
        </ul>
      </div>

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
    </OrganizerShell>
  );
}
```

- [ ] **Step 3: Type-check, lint**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint "app/people/[id]/page.tsx"
```
Expected: `tsc` clean. `eslint` will show its known, pre-existing `react/no-unescaped-entities` error(s) (confirmed pre-existing many times this session) — confirm no NEW error appears (same count/rule as before this edit).

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/page.tsx"
git commit -m "fix: move Danger Zone to the bottom of the profile page"
```

---

### Task 5: Extract a shared `AlertBanner` component

**Files:**
- Create: `apps/organizer-web/app/components/AlertBanner.tsx`
- Test: `apps/organizer-web/app/components/AlertBanner.test.ts`
- Modify: `apps/organizer-web/app/tournaments/[id]/roster/page.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/teams/page.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`
- Modify: `apps/organizer-web/app/login/page.tsx`

**Interfaces:**
- Produces: `alertToneClass(tone: 'warning' | 'error'): string` (pure, tested) and the default-exported `AlertBanner` component (`{ tone: 'warning' | 'error'; className?: string; children: React.ReactNode }`), consumed by the 4 modified pages.

- [ ] **Step 1: Write the failing test**

Create `apps/organizer-web/app/components/AlertBanner.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { alertToneClass } from './AlertBanner';

describe('alertToneClass', () => {
  it('returns the amber warning classes', () => {
    expect(alertToneClass('warning')).toBe('bg-amber-50 border-amber-200 text-amber-800');
  });

  it('returns the red error classes', () => {
    expect(alertToneClass('error')).toBe('bg-red-50 border-red-200 text-red-700');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/organizer-web && npx vitest run app/components/AlertBanner.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the component**

Create `apps/organizer-web/app/components/AlertBanner.tsx`:

```tsx
// Shared warning/error banner -- replaces ~13 hand-rolled instances of the
// same `rounded-lg bg-{color}-50 border border-{color}-200 text-{color}-{shade}`
// pattern that had drifted slightly (some semibold, some not; amber-700 vs
// amber-800) across roster/teams/bracket/login.
export function alertToneClass(tone: 'warning' | 'error'): string {
  return tone === 'warning'
    ? 'bg-amber-50 border-amber-200 text-amber-800'
    : 'bg-red-50 border-red-200 text-red-700';
}

export default function AlertBanner({
  tone,
  className = '',
  children,
}: {
  tone: 'warning' | 'error';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border text-sm px-4 py-3 font-semibold ${alertToneClass(tone)} ${className}`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/organizer-web && npx vitest run app/components/AlertBanner.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Replace all 3 instances in the Roster page**

In `apps/organizer-web/app/tournaments/[id]/roster/page.tsx`, add the import:
```typescript
import AlertBanner from '@/app/components/AlertBanner';
```

Find:
```tsx
              <p className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 font-semibold">
                All Slots Full — the roster filled up since you started this. These players can't
                be added.
              </p>
```
Replace with:
```tsx
              <AlertBanner tone="warning">
                All Slots Full — the roster filled up since you started this. These players can't
                be added.
              </AlertBanner>
```

Find:
```tsx
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6 font-semibold">
          All Slots Full — no more sign up.
        </div>
```
Replace with:
```tsx
        <AlertBanner tone="warning" className="mb-6">
          All Slots Full — no more sign up.
        </AlertBanner>
```

Find:
```tsx
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            ⚠ Duplicate name(s) — double-check pairing later:{' '}
            {Array.from(duplicateNames).join(', ')}
          </p>
```
Replace with:
```tsx
          <AlertBanner tone="warning" className="mb-3">
            ⚠ Duplicate name(s) — double-check pairing later:{' '}
            {Array.from(duplicateNames).join(', ')}
          </AlertBanner>
```

- [ ] **Step 6: Replace both instances in the Teams page**

In `apps/organizer-web/app/tournaments/[id]/teams/page.tsx`, add the import:
```typescript
import AlertBanner from '@/app/components/AlertBanner';
```

Find (appears twice, with different inner text — replace each occurrence with its own matching text):
```tsx
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6">
          This tournament already has a generated schedule. Removing a team also deletes its
          existing matches and their scores. After changing teams, head to Bracket and use
          Regenerate All Rounds to rebuild a clean schedule from the current team list.
        </div>
```
Replace with:
```tsx
        <AlertBanner tone="warning" className="mb-6">
          This tournament already has a generated schedule. Removing a team also deletes its
          existing matches and their scores. After changing teams, head to Bracket and use
          Regenerate All Rounds to rebuild a clean schedule from the current team list.
        </AlertBanner>
```

Find:
```tsx
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6">
          8/8 teams — maximum reached for this format.
        </div>
```
Replace with:
```tsx
        <AlertBanner tone="warning" className="mb-6">
          8/8 teams — maximum reached for this format.
        </AlertBanner>
```

- [ ] **Step 7: Replace all 7 instances in the Bracket page**

In `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`, add the import:
```typescript
import AlertBanner from '@/app/components/AlertBanner';
```

Every one of these 7 blocks follows the identical shape `<div className="rounded-lg bg-{amber|red}-50 border border-{amber|red}-200 text-{amber|red}-{shade} text-sm px-4 py-3 mb-6">TEXT</div>` — replace each with `<AlertBanner tone="warning" className="mb-6">TEXT</AlertBanner>` (amber ones) or `<AlertBanner tone="error" className="mb-6">TEXT</AlertBanner>` (red ones), keeping each block's own inner text completely unchanged. The 7 blocks, identified by their surrounding condition (do not change the condition, only the alert markup inside it):

1. `{!isSupported && (...)}` — amber, text starting "isn't available yet — bracket generation for this format is coming soon..."
2. `{isSupported && !hasLeagueMatches && isPopcorn && playerCount < 4 && (...)}` — red, "Need at least 4 players to generate a Popcorn schedule..."
3. `{isSupported && !hasLeagueMatches && isGauntlet && playerCount < 4 && (...)}` — red, "Need at least 4 players to generate a Gauntlet round..."
4. `{isSupported && !hasLeagueMatches && isClaimTheThrone && !claimTheThronePlayerCountValid && (...)}` — red, "Claim the Throne needs a player count that's a multiple of 4..."
5. `{isSupported && !hasLeagueMatches && isUpAndDownRiver && !upAndDownRiverPlayerCountValid && (...)}` — red, "Up and Down the River needs a player count that's a multiple of 4..."
6. The condition ending `... teamCount < 2 && (...)` (first occurrence) — red, "Need at least 2 teams to generate a bracket..."
7. `{isSupported && !hasLeagueMatches && isLeaguePlayoffs && teamCount < 2 && (...)}` — red, "Need at least 2 teams to generate a bracket..." (near-identical text to #6, a different condition/location — both get the same treatment)

For each, the transformation is exactly: delete the `rounded-lg bg-... text-sm px-4 py-3 mb-6` className from the `<div>`, change the tag to `<AlertBanner tone="warning" className="mb-6">` or `<AlertBanner tone="error" className="mb-6">` as appropriate, and change the closing `</div>` to `</AlertBanner>`. Do not alter any inner text.

- [ ] **Step 8: Replace the instance in the Login page**

In `apps/organizer-web/app/login/page.tsx`, add the import:
```typescript
import AlertBanner from '@/app/components/AlertBanner';
```

Find:
```tsx
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
            {error}
          </div>
        )}
```
Replace with:
```tsx
        {error && (
          <AlertBanner tone="error">
            {error}
          </AlertBanner>
        )}
```

- [ ] **Step 9: Type-check, lint, full test run**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint app/components/AlertBanner.tsx "app/tournaments/[id]/roster/page.tsx" "app/tournaments/[id]/teams/page.tsx" "app/tournaments/[id]/bracket/page.tsx" app/login/page.tsx
npx vitest run
```
Expected: `tsc` clean; `eslint` clean (`bracket/page.tsx` and `roster/page.tsx` may show their known pre-existing unrelated errors — confirm no new ones); full suite passes at the pre-existing count plus 2 new `AlertBanner` tests.

- [ ] **Step 10: Commit**

```bash
git add apps/organizer-web/app/components/AlertBanner.tsx apps/organizer-web/app/components/AlertBanner.test.ts "apps/organizer-web/app/tournaments/[id]/roster/page.tsx" "apps/organizer-web/app/tournaments/[id]/teams/page.tsx" "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx" apps/organizer-web/app/login/page.tsx
git commit -m "feat: extract shared AlertBanner, replace 13 duplicated hand-rolled banners"
```

---

### Task 6: Apply `stat-num` to remaining numbers on the profile page

**Files:**
- Modify: `apps/organizer-web/app/people/[id]/page.tsx`

- [ ] **Step 1: Add `stat-num` to the "Games won" and "Leagues won" tiles**

Find:
```tsx
            <div className="flex-1 rounded-2xl bg-slate-50 p-3 flex flex-col items-center justify-center text-center">
              <div className="text-xl font-extrabold text-navy-mid">{thisMonth.gamesWon}</div>
              <div className="text-[11px] text-slate-500">Games won</div>
            </div>
            <div className="flex-1 rounded-2xl bg-gradient-to-br from-[#fdf6e8] to-white border-2 border-gold/50 p-3 flex flex-col items-center justify-center text-center">
              <div className="text-xl font-extrabold text-amber-600">
                {thisMonth.tournamentsWon}
              </div>
              <div className="text-[11px] text-slate-500">Leagues won</div>
            </div>
```
Replace with:
```tsx
            <div className="flex-1 rounded-2xl bg-slate-50 p-3 flex flex-col items-center justify-center text-center">
              <div className="stat-num text-xl font-extrabold text-navy-mid">{thisMonth.gamesWon}</div>
              <div className="text-[11px] text-slate-500">Games won</div>
            </div>
            <div className="flex-1 rounded-2xl bg-gradient-to-br from-[#fdf6e8] to-white border-2 border-gold/50 p-3 flex flex-col items-center justify-center text-center">
              <div className="stat-num text-xl font-extrabold text-amber-600">
                {thisMonth.tournamentsWon}
              </div>
              <div className="text-[11px] text-slate-500">Leagues won</div>
            </div>
```

- [ ] **Step 2: Add `stat-num` to the By Location match count and win percentage**

Find:
```tsx
                  <span className="text-right">
                    <span className="font-bold text-navy-mid">
                      {l.count} match{l.count === 1 ? '' : 'es'}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {locationWinPercentage}%{' '}
                      <span className="text-gold-bright">
                        {renderStars(starRating(locationWinPercentage))}
                      </span>
                    </span>
                  </span>
```
Replace with:
```tsx
                  <span className="text-right">
                    <span className="stat-num font-bold text-navy-mid">
                      {l.count} match{l.count === 1 ? '' : 'es'}
                    </span>
                    <span className="stat-num block text-xs text-slate-500">
                      {locationWinPercentage}%{' '}
                      <span className="text-gold-bright">
                        {renderStars(starRating(locationWinPercentage))}
                      </span>
                    </span>
                  </span>
```

- [ ] **Step 3: Add `stat-num` to the Match History score line**

Find:
```tsx
                    <span className={m.won ? 'font-bold text-navy-mid' : 'font-bold text-muted'}>
                      {m.scoreFor}-{m.scoreAgainst}
                    </span>
```
Replace with:
```tsx
                    <span className={`stat-num ${m.won ? 'font-bold text-navy-mid' : 'font-bold text-muted'}`}>
                      {m.scoreFor}-{m.scoreAgainst}
                    </span>
```

- [ ] **Step 4: Type-check, lint**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint "app/people/[id]/page.tsx"
```
Expected: `tsc` clean; `eslint`'s pre-existing error count unchanged.

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/people/[id]/page.tsx"
git commit -m "fix: apply stat-num to remaining un-styled numbers on the profile page"
```

---

### Task 7: Delete unused scaffold SVGs; add the wordmark to `LeaderboardTable`

**Files:**
- Delete: `apps/organizer-web/public/next.svg`, `apps/organizer-web/public/vercel.svg`, `apps/organizer-web/public/file.svg`, `apps/organizer-web/public/globe.svg`, `apps/organizer-web/public/window.svg`
- Modify: `apps/organizer-web/app/components/LeaderboardTable.tsx`

**Interfaces:**
- Consumes: `LeaderboardTableProps.title` (existing) — the wordmark's visibility check reuses the exact same venue-match convention `TournamentCard.tsx` already established: `title.trim().toLowerCase() === 'pickleturf'`.

- [ ] **Step 1: Delete the unused scaffold SVGs**

```bash
git rm apps/organizer-web/public/next.svg apps/organizer-web/public/vercel.svg apps/organizer-web/public/file.svg apps/organizer-web/public/globe.svg apps/organizer-web/public/window.svg
```

- [ ] **Step 2: Add the wordmark to `LeaderboardTable`'s header**

In `apps/organizer-web/app/components/LeaderboardTable.tsx`, find the component's opening (right after the function signature, where `Heading`/`podiumRows`/`bodyRows` are computed):

```tsx
export default function LeaderboardTable({ title, kicker, isLive = false, footerCaption, rows, headingLevel = 'h2' }: LeaderboardTableProps) {
  const Heading = headingLevel;
  const podiumRows = rows.filter((r) => r.rank <= 3);
  const bodyRows = rows.filter((r) => r.rank > 3);
```

Add one line after it:

```tsx
export default function LeaderboardTable({ title, kicker, isLive = false, footerCaption, rows, headingLevel = 'h2' }: LeaderboardTableProps) {
  const Heading = headingLevel;
  const podiumRows = rows.filter((r) => r.rank <= 3);
  const bodyRows = rows.filter((r) => r.rank > 3);
  const isPickleturf = title.trim().toLowerCase() === 'pickleturf';
```

Then find the header row:

```tsx
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          {isLive && (
            <span
              className="inline-block rounded-full px-3 py-1 text-xs font-extrabold text-white mb-2"
              style={{ background: LIVE_COLOR, letterSpacing: '1px' }}
            >
              LIVE
            </span>
          )}
          <Heading className="font-heading font-extrabold text-2xl" style={{ color: ON_NAVY_PRIMARY }}>
            {title}
          </Heading>
        </div>
        <span className="font-heading font-bold text-sm" style={{ color: ON_NAVY_SECOND, letterSpacing: '1.5px' }}>
          {kicker}
        </span>
      </div>
```

Replace with (adding the wordmark, right-aligned, above the kicker):

```tsx
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          {isLive && (
            <span
              className="inline-block rounded-full px-3 py-1 text-xs font-extrabold text-white mb-2"
              style={{ background: LIVE_COLOR, letterSpacing: '1px' }}
            >
              LIVE
            </span>
          )}
          <Heading className="font-heading font-extrabold text-2xl" style={{ color: ON_NAVY_PRIMARY }}>
            {title}
          </Heading>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {isPickleturf && (
            // eslint-disable-next-line @next/next/no-img-element -- static brand mark, not content that needs Next/Image optimization
            <img src="/pickleturf-logo.png" alt="Pickleturf" className="h-6 w-auto opacity-90" />
          )}
          <span className="font-heading font-bold text-sm" style={{ color: ON_NAVY_SECOND, letterSpacing: '1.5px' }}>
            {kicker}
          </span>
        </div>
      </div>
```

- [ ] **Step 3: Type-check, lint, build**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint app/components/LeaderboardTable.tsx
npm run build
```
Expected: all clean (the build step also confirms the deleted SVGs aren't referenced anywhere — `grep -rn "next.svg\|vercel.svg\|file.svg\|globe.svg\|window.svg" app/` should already return nothing, since these are unused Next.js scaffold defaults, but a clean build is the real proof).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: delete unused scaffold SVGs; add Pickleturf wordmark to LeaderboardTable"
```

---

### Task 8: Accessibility — medal labels and active-tab state

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/standings/page.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/results/page.tsx`
- Modify: `apps/organizer-web/app/t/[id]/page.tsx`
- Modify: `apps/organizer-web/app/components/TournamentNav.tsx`

- [ ] **Step 1: Add medal `aria-label`s in Standings (3 occurrences)**

In `apps/organizer-web/app/tournaments/[id]/standings/page.tsx`, every occurrence of `const medal = ['🥇', '🥈', '🥉'][i];` is immediately followed later in the same block by `{medal && <span className="mr-1.5">{medal}</span>}`. For each of the 3 occurrences, add a matching label array right after the `medal` line, and pass it as `aria-label` on the medal's `<span>`:

Find (appears 3 times — apply this same change at all 3):
```tsx
                  const medal = ['🥇', '🥈', '🥉'][i];
```
Replace each with:
```tsx
                  const medal = ['🥇', '🥈', '🥉'][i];
                  const medalLabel = ['1st place', '2nd place', '3rd place'][i];
```

Then find (appears 3 times, matching each of the above):
```tsx
                        {medal && <span className="mr-1.5">{medal}</span>}
```
Replace each with:
```tsx
                        {medal && <span className="mr-1.5" aria-label={medalLabel}>{medal}</span>}
```

(The exact surrounding indentation/context differs slightly between the 3 occurrences in this file — match each `medal &&` span to the `medalLabel` declared in the same block, using the surrounding code to disambiguate which of the 3 you're editing.)

- [ ] **Step 2: Add medal `aria-label`s in Results (3 occurrences)**

Apply the identical transformation from Step 1 to `apps/organizer-web/app/tournaments/[id]/results/page.tsx` — it has the same `const medal = ['🥇', '🥈', '🥉'][i];` pattern 3 times.

- [ ] **Step 3: Add a medal `aria-label` in the public tournament page (1 occurrence)**

Apply the identical transformation from Step 1 to `apps/organizer-web/app/t/[id]/page.tsx` — it has one `const medal = ['🥇', '🥈', '🥉'][i];`.

- [ ] **Step 4: Add `aria-current` to the active tab in `TournamentNav`**

In `apps/organizer-web/app/components/TournamentNav.tsx`, find:

```tsx
          <Link
            key={step.key}
            href={`/tournaments/${tournamentId}/${step.key}`}
            className={
              isActive
                ? 'flex-1 text-center pb-2.5 text-sm font-bold text-navy-deep border-b-2 border-brand-orange -mb-px'
                : 'flex-1 text-center pb-2.5 text-sm font-semibold text-muted hover:text-navy-mid border-b-2 border-transparent -mb-px transition-colors'
            }
          >
```

Replace with:

```tsx
          <Link
            key={step.key}
            href={`/tournaments/${tournamentId}/${step.key}`}
            aria-current={isActive ? 'page' : undefined}
            className={
              isActive
                ? 'flex-1 text-center pb-2.5 text-sm font-bold text-navy-deep border-b-2 border-brand-orange -mb-px'
                : 'flex-1 text-center pb-2.5 text-sm font-semibold text-muted hover:text-navy-mid border-b-2 border-transparent -mb-px transition-colors'
            }
          >
```

- [ ] **Step 5: Type-check, lint**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint "app/tournaments/[id]/standings/page.tsx" "app/tournaments/[id]/results/page.tsx" "app/t/[id]/page.tsx" app/components/TournamentNav.tsx
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/standings/page.tsx" "apps/organizer-web/app/tournaments/[id]/results/page.tsx" "apps/organizer-web/app/t/[id]/page.tsx" apps/organizer-web/app/components/TournamentNav.tsx
git commit -m "feat: add medal aria-labels and aria-current on the tournament sub-nav"
```

---

### Task 9: Extract a shared `ShareHint` component

**Files:**
- Create: `apps/organizer-web/app/components/ShareHint.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/roster/page.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/results/page.tsx`
- Modify: `apps/organizer-web/app/people/[id]/page.tsx`

**Interfaces:**
- Produces: the default-exported `ShareHint` component (no props), consumed by the 4 modified pages.

- [ ] **Step 1: Write the component**

Create `apps/organizer-web/app/components/ShareHint.tsx`:

```tsx
// The identical helper line under every "Share ..." button in the app --
// previously copy-pasted 4 times.
export default function ShareHint() {
  return (
    <p className="text-xs text-muted mt-1.5">
      Opens your share sheet on mobile — downloads the file on desktop.
    </p>
  );
}
```

- [ ] **Step 2: Replace all 4 usages**

In each of the 4 files below, add the import `import ShareHint from '@/app/components/ShareHint';`, then find the exact block and replace it with `<ShareHint />`:

`apps/organizer-web/app/tournaments/[id]/roster/page.tsx` — find:
```tsx
        <p className="text-xs text-muted mt-1.5">
          Opens your share sheet on mobile — downloads the file on desktop.
        </p>
```
Replace with:
```tsx
        <ShareHint />
```

`apps/organizer-web/app/tournaments/[id]/bracket/page.tsx` — find:
```tsx
            <p className="text-xs text-muted mt-1.5">
              Opens your share sheet on mobile — downloads the file on desktop.
            </p>
```
Replace with:
```tsx
            <ShareHint />
```

`apps/organizer-web/app/tournaments/[id]/results/page.tsx` — find:
```tsx
        <p className="text-xs text-muted mt-1.5">
          Opens your share sheet on mobile — downloads the file on desktop.
        </p>
```
Replace with:
```tsx
        <ShareHint />
```

`apps/organizer-web/app/people/[id]/page.tsx` — find:
```tsx
        <p className="text-xs text-muted mt-1.5">
          Opens your share sheet on mobile — downloads the file on desktop.
        </p>
```
Replace with:
```tsx
        <ShareHint />
```

- [ ] **Step 3: Type-check, lint**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint app/components/ShareHint.tsx "app/tournaments/[id]/roster/page.tsx" "app/tournaments/[id]/bracket/page.tsx" "app/tournaments/[id]/results/page.tsx" "app/people/[id]/page.tsx"
```
Expected: `tsc` clean; `eslint` clean (pre-existing unrelated errors on `roster`/`bracket`/`people/[id]` unchanged in count).

- [ ] **Step 4: Commit**

```bash
git add apps/organizer-web/app/components/ShareHint.tsx "apps/organizer-web/app/tournaments/[id]/roster/page.tsx" "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx" "apps/organizer-web/app/tournaments/[id]/results/page.tsx" "apps/organizer-web/app/people/[id]/page.tsx"
git commit -m "feat: extract shared ShareHint component, replace 4 duplicated instances"
```

---

### Task 10: Copy fix — "Upcoming Matches" → "Upcoming Leagues"

**Files:**
- Modify: `apps/organizer-web/app/tournaments/page.tsx`

- [ ] **Step 1: Fix the heading text**

Find (line 171):
```tsx
              <h2 className="text-xl font-bold text-white mb-3 font-heading">Upcoming Matches</h2>
```
Replace with:
```tsx
              <h2 className="text-xl font-bold text-white mb-3 font-heading">Upcoming Leagues</h2>
```

- [ ] **Step 2: Type-check, lint**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint app/tournaments/page.tsx
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/organizer-web/app/tournaments/page.tsx
git commit -m "fix: rename 'Upcoming Matches' to 'Upcoming Leagues' (match vs. league terminology)"
```

---

### Task 11: Sizing fixes — Achievements grid and score-entry inputs

**Files:**
- Modify: `apps/organizer-web/app/components/AchievementsGrid.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`

- [ ] **Step 1: Widen the Achievements grid at small breakpoints**

Find (line 87):
```tsx
          <div className="grid grid-cols-4 gap-3">
```
Replace with:
```tsx
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
```

- [ ] **Step 2: Raise the description text size**

Find (line 63):
```tsx
      <span className={`text-[8.5px] mt-0.5 leading-tight ${earned ? 'text-muted' : 'text-slate-400'}`}>
```
Replace with:
```tsx
      <span className={`text-[10px] mt-0.5 leading-tight ${earned ? 'text-muted' : 'text-slate-400'}`}>
```

(Line 58's tier-label text, also `text-[8.5px]`, is a short single word like "GOLD" — leave it as-is; only the longer description text at line 63 was flagged as illegible.)

- [ ] **Step 3: Enlarge the Bracket page's score-entry inputs**

Find (both occurrences, lines 412 and 421):
```tsx
                      className={`${inputClass} w-20 min-h-[48px] text-lg`}
```
Replace each with:
```tsx
                      className={`${inputClass} w-24 min-h-[56px] text-2xl`}
```

Also add `inputMode="numeric"` to each of these two `<input>` elements if it isn't already present — read the surrounding 5 lines of each to check, and add the attribute alongside the existing `type`/`name` props if missing.

- [ ] **Step 4: Type-check, lint**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint app/components/AchievementsGrid.tsx "app/tournaments/[id]/bracket/page.tsx"
```
Expected: `tsc` clean; `eslint`'s pre-existing unrelated error count on `bracket/page.tsx` unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/app/components/AchievementsGrid.tsx "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx"
git commit -m "fix: widen Achievements grid at small breakpoints, enlarge score-entry inputs"
```

---

### Task 12: Visual verification, cleanup, push

**Files:**
- Create (temporary): `apps/organizer-web/app/dev-preview-quick-wins/page.tsx`
- Delete (before finishing): the same temporary file.

- [ ] **Step 1: Write a temporary preview route**

Create `apps/organizer-web/app/dev-preview-quick-wins/page.tsx`:

```tsx
// TEMP dev-preview route -- not shipped. Delete before commit.
import AlertBanner from '@/app/components/AlertBanner';
import ShareHint from '@/app/components/ShareHint';
import AchievementsGrid from '@/app/components/AchievementsGrid';
import LeaderboardTable from '@/app/components/LeaderboardTable';

export default function Page() {
  return (
    <div className="min-h-screen p-4 space-y-6" style={{ background: '#f3efe6' }}>
      <div className="space-y-2 max-w-md">
        <AlertBanner tone="warning">A warning banner, for comparison.</AlertBanner>
        <AlertBanner tone="error">An error banner, for comparison.</AlertBanner>
        <ShareHint />
      </div>
      <div className="max-w-md">
        <AchievementsGrid
          achievements={[
            { key: 'first-win', emoji: '🏓', label: 'First Win', category: 'milestones', description: 'Win your first match on record', earned: true, tier: 'bronze', tierIndex: 1, value: 1, nextThreshold: null },
            { key: 'hot-streak', emoji: '🔥', label: 'Hot Streak', category: 'momentum', description: 'Win five matches in a row without a loss', earned: true, tier: 'gold', tierIndex: 3, value: 5, nextThreshold: 10 },
            { key: 'undefeated-season', emoji: '👑', label: 'Undefeated Season', category: 'championship-legacy', description: 'Complete a full league undefeated', earned: false, tier: null, tierIndex: 0, value: 0, nextThreshold: null },
          ]}
        />
      </div>
      <div className="max-w-md">
        <LeaderboardTable
          title="Pickleturf"
          kicker="MONTH TO DATE"
          footerCaption="Ranked by Total Points (75%) + matches played (15%) + league wins (10%)"
          rows={[
            { rank: 1, name: 'Ankit Gupta', overallWinPercentage: 78, matchWins: 22, losses: 6, totalPoints: 340, secondaryWins: 2 },
            { rank: 2, name: 'Nihad Rahman', overallWinPercentage: 71, matchWins: 19, losses: 8, totalPoints: 305, secondaryWins: 1 },
            { rank: 3, name: 'Ranjit Kaur Bhamra', overallWinPercentage: 64, matchWins: 17, losses: 10, totalPoints: 288, secondaryWins: 0 },
          ]}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: View it in the Browser pane at mobile width**

Using `mcp__Claude_Browser__preview_start` (`{name: "organizer-web"}`), navigate to `/dev-preview-quick-wins`, use `resize_window` with `preset: "mobile"`, then screenshot.

Check:
- Both alert banners render with the expected amber/red treatment and bold text.
- The Achievements grid shows 3 columns at this width, description text is legibly larger than before.
- The Pickleturf leaderboard card shows the wordmark logo in its header, next to/above "MONTH TO DATE".

If anything looks wrong, fix it and re-check before moving on.

- [ ] **Step 3: Delete the temporary preview route**

```bash
rm -rf apps/organizer-web/app/dev-preview-quick-wins
```

- [ ] **Step 4: Full verification**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx vitest run
npx eslint app/components/AlertBanner.tsx app/components/ShareHint.tsx app/components/AchievementsGrid.tsx app/components/TournamentNav.tsx app/components/LeaderboardTable.tsx app/settings/page.tsx app/tournaments/page.tsx "app/p/[id]/page.tsx" "app/t/[id]/page.tsx" app/login/page.tsx "app/people/[id]/page.tsx" "app/tournaments/[id]/standings/page.tsx" "app/tournaments/[id]/results/page.tsx" "app/tournaments/[id]/roster/page.tsx" "app/tournaments/[id]/teams/page.tsx" "app/tournaments/[id]/bracket/page.tsx"
npm run build
```
Expected: `tsc` clean; full suite passes at the pre-existing count plus 2 new `AlertBanner` tests; `eslint` shows only the already-confirmed pre-existing unrelated errors on `people/[id]/page.tsx`/`bracket/page.tsx`/`roster/page.tsx`, no new ones; build clean; the temporary preview route absent from the build's route list.

- [ ] **Step 5: Commit and push**

```bash
cd "C:\Users\ANKS\pickleball project"
git add -A
git commit -m "chore: remove temporary quick-wins preview route"
git push origin main
```

Then poll `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1` until the run for the pushed commit shows `"conclusion": "success"`.
