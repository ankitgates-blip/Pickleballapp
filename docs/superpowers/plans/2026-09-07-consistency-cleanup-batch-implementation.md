# Consistency Cleanup Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 5 "Consistency cleanup" items from the design-audit's Medium tier (Batch 1 of 4): a header context strip filling the 80px dead band, one shared `<StandingsTable>` replacing 3 divergent implementations, a `<RoundActionCard>` extraction on the Bracket page, desktop container widening for the People/Tournaments browsing pages, and a single-color fix resolving the "two blacks" on the People profile.

**Architecture:** Five independent changes to `apps/organizer-web`, each touching its own files with no cross-task dependencies except: Task 3 depends on Task 2 (both use `<StandingsTable>`, Task 2 creates it). All other tasks (1, 4, 5, 6) can run in any order.

**Tech Stack:** Next.js App Router (React Server Components), Tailwind CSS, TypeScript, Supabase (server-side queries only — no schema or query-shape changes beyond widening 2 existing `.select()` calls to include already-existing columns).

## Global Constraints

- No visual change unless the spec explicitly calls for one (Task 1, 5, 6 are pure refactors/extractions with unchanged rendered output except widths noted in Task 5; Task 4 adds new content; Task 3 slightly restyles the bracket-page and public-page tables to already-correct tokens, per spec §2).
- Reuse existing tokens/classes (`actionCardClass`, `win`/`loss`/`navy-deep` tokens, `stat-num`) — no new colors or magic numbers introduced.
- Every new/modified file must pass `npx tsc --noEmit` and the existing `npx vitest run` suite (currently 431 tests) with no regressions.
- Verify presentational changes visually via a temporary `apps/organizer-web/app/dev-preview-<name>/page.tsx` route + browser screenshot (this app's established convention — no test framework renders JSX to a browser), then delete the route before committing (confirm `git status --short <path>` shows nothing, since it's never `git add`ed).
- Commit only the files a task actually names — never `git add -A` or `git add .` (this repo has ~28 unrelated pre-existing untracked files sitting in the working tree; two prior batches this session accidentally swept them into a commit this way).
- `--color-muted` (`#64748b`) and Tailwind's `slate-500` (`#64748b`) are the same color — a table cell moving from `text-slate-500` to `text-muted` is a no-op render-wise, not a visual change requiring extra scrutiny.

**Note on the spec's standings-table count:** The spec (and the audit it's based on) describes "4 divergent standings-table designs," listing "the bracket page's two plain W/L tables." Direct inspection of `bracket/page.tsx` found only ONE `<table>` element there (its heading text varies conditionally between "Team Standings (Playoff Seeding)" and "League Standings," which is what the audit's language was describing — not two separate table implementations). There are 3 actual standings-table implementations in the codebase: `standings/page.tsx`, `bracket/page.tsx`'s one table, and `/t/[id]/page.tsx`'s public table. Task 2 and Task 3 together unify all 3 that actually exist; this is a correction to the spec's count, not a change to its intent or architecture.

---

### Task 1: Extract `<RoundActionCard>` and adopt it on the Bracket page

**Files:**
- Create: `apps/organizer-web/app/components/RoundActionCard.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`

**Interfaces:**
- Produces: `RoundActionCard` — default export, props `{ as?: 'form' | 'div'; formAction?: (formData: FormData) => void | Promise<void>; children: React.ReactNode }`. Renders `<form action={formAction} className="${actionCardClass} text-center mb-6">{children}</form>` when `as` is `'form'` (the default) or omitted, `<div className="${actionCardClass} text-center mb-6">{children}</div>` when `as="div"`.

- [ ] **Step 1: Create the component**

```tsx
// apps/organizer-web/app/components/RoundActionCard.tsx
//
// Thin wrapper replacing ~15 duplicated `<form>`/`<div>` blocks on the Bracket page,
// all sharing the exact wrapper classes `${actionCardClass} text-center mb-6` around a
// message plus one or two action buttons. Deliberately not a rigid "message + one
// button" API: the ~15 call sites vary in what they render inside (a single button, two
// buttons side by side, a button with an extra input field, or a custom button
// component) -- only the wrapper markup was ever actually duplicated, so this only
// extracts that.
import { actionCardClass } from './ui';

export type RoundActionCardProps = {
  as?: 'form' | 'div';
  formAction?: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
};

export default function RoundActionCard({ as = 'form', formAction, children }: RoundActionCardProps) {
  if (as === 'div') {
    return <div className={`${actionCardClass} text-center mb-6`}>{children}</div>;
  }
  return (
    <form action={formAction} className={`${actionCardClass} text-center mb-6`}>
      {children}
    </form>
  );
}
```

- [ ] **Step 2: Add the import to `bracket/page.tsx`**

Find this line near the top of the file (around line 22):
```tsx
import ShareHint from '@/app/components/ShareHint';
```
Add directly after it:
```tsx
import RoundActionCard from '@/app/components/RoundActionCard';
```

- [ ] **Step 3: Replace all 15 `actionCardClass`-wrapped generate/skip blocks**

Each replacement below shows the exact current code and its exact replacement. The inner content (message text, buttons) is byte-for-byte unchanged in every case — only the outer `<form>`/`<div>` tag and its `className` are replaced by `<RoundActionCard>`.

**3a. Popcorn generate** — find:
```tsx
        <form action={generatePopcornBracketWithId} className={`${actionCardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            {playerCount} players ready. Generate the Popcorn schedule ({tournament?.popcorn_rounds ?? 5} rounds).
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Popcorn Schedule
          </SaveButton>
        </form>
```
replace with:
```tsx
        <RoundActionCard formAction={generatePopcornBracketWithId}>
          <p className="text-slate-600 mb-4">
            {playerCount} players ready. Generate the Popcorn schedule ({tournament?.popcorn_rounds ?? 5} rounds).
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Popcorn Schedule
          </SaveButton>
        </RoundActionCard>
```

**3b. Gauntlet round 1** — find:
```tsx
        <form action={advanceGauntletRoundWithId} className={`${actionCardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            {playerCount} players ready. Generate Round 1 of {gauntletRounds}.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Round 1
          </SaveButton>
        </form>
```
(this is the block immediately following the Popcorn one — there are two `advanceGauntletRoundWithId` forms later with different message text, so match on this exact message: "players ready. Generate Round 1 of {gauntletRounds}")
replace with:
```tsx
        <RoundActionCard formAction={advanceGauntletRoundWithId}>
          <p className="text-slate-600 mb-4">
            {playerCount} players ready. Generate Round 1 of {gauntletRounds}.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Round 1
          </SaveButton>
        </RoundActionCard>
```

**3c. Gauntlet next round** — find:
```tsx
        <form action={advanceGauntletRoundWithId} className={`${actionCardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            Round {currentGauntletRound} complete. Generate Round {currentGauntletRound + 1} of{' '}
            {gauntletRounds}.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Round {currentGauntletRound + 1}
          </SaveButton>
        </form>
```
replace with:
```tsx
        <RoundActionCard formAction={advanceGauntletRoundWithId}>
          <p className="text-slate-600 mb-4">
            Round {currentGauntletRound} complete. Generate Round {currentGauntletRound + 1} of{' '}
            {gauntletRounds}.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Round {currentGauntletRound + 1}
          </SaveButton>
        </RoundActionCard>
```

**3d. Gauntlet skip round** — find:
```tsx
        <form action={advanceGauntletRoundWithId} className={`${actionCardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            Round {currentGauntletRound} isn't finished yet. Skip it and generate Round{' '}
            {currentGauntletRound + 1} anyway — any unplayed matches in Round{' '}
            {currentGauntletRound} stay unscored and won't count toward anyone's record.
          </p>
          <SaveButton className={outlineButtonClass} pendingLabel="Skipping…">
            Skip to Round {currentGauntletRound + 1}
          </SaveButton>
        </form>
```
replace with:
```tsx
        <RoundActionCard formAction={advanceGauntletRoundWithId}>
          <p className="text-slate-600 mb-4">
            Round {currentGauntletRound} isn't finished yet. Skip it and generate Round{' '}
            {currentGauntletRound + 1} anyway — any unplayed matches in Round{' '}
            {currentGauntletRound} stay unscored and won't count toward anyone's record.
          </p>
          <SaveButton className={outlineButtonClass} pendingLabel="Skipping…">
            Skip to Round {currentGauntletRound + 1}
          </SaveButton>
        </RoundActionCard>
```

**3e. Claim the Throne round 1** — find:
```tsx
        <form action={advanceClaimTheThroneRoundWithId} className={`${actionCardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            {playerCount} players ready. Generate Round 1 of {claimTheThroneRounds}.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Round 1
          </SaveButton>
        </form>
```
replace with:
```tsx
        <RoundActionCard formAction={advanceClaimTheThroneRoundWithId}>
          <p className="text-slate-600 mb-4">
            {playerCount} players ready. Generate Round 1 of {claimTheThroneRounds}.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Round 1
          </SaveButton>
        </RoundActionCard>
```

**3f. Claim the Throne next round** — find:
```tsx
        <form
          action={advanceClaimTheThroneRoundWithId}
          className={`${actionCardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            Round {currentClaimTheThroneRound} complete. Generate Round{' '}
            {currentClaimTheThroneRound + 1} of {claimTheThroneRounds}.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Round {currentClaimTheThroneRound + 1}
          </SaveButton>
        </form>
```
replace with:
```tsx
        <RoundActionCard formAction={advanceClaimTheThroneRoundWithId}>
          <p className="text-slate-600 mb-4">
            Round {currentClaimTheThroneRound} complete. Generate Round{' '}
            {currentClaimTheThroneRound + 1} of {claimTheThroneRounds}.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Round {currentClaimTheThroneRound + 1}
          </SaveButton>
        </RoundActionCard>
```

**3g. Claim the Throne skip round** — find:
```tsx
        <form
          action={advanceClaimTheThroneRoundWithId}
          className={`${actionCardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            Round {currentClaimTheThroneRound} isn't finished yet. Skip it and generate Round{' '}
            {currentClaimTheThroneRound + 1} anyway — any unplayed matches in Round{' '}
            {currentClaimTheThroneRound} stay unscored and won't count toward anyone's record.
          </p>
          <SaveButton className={outlineButtonClass} pendingLabel="Skipping…">
            Skip to Round {currentClaimTheThroneRound + 1}
          </SaveButton>
        </form>
```
replace with:
```tsx
        <RoundActionCard formAction={advanceClaimTheThroneRoundWithId}>
          <p className="text-slate-600 mb-4">
            Round {currentClaimTheThroneRound} isn't finished yet. Skip it and generate Round{' '}
            {currentClaimTheThroneRound + 1} anyway — any unplayed matches in Round{' '}
            {currentClaimTheThroneRound} stay unscored and won't count toward anyone's record.
          </p>
          <SaveButton className={outlineButtonClass} pendingLabel="Skipping…">
            Skip to Round {currentClaimTheThroneRound + 1}
          </SaveButton>
        </RoundActionCard>
```

**3h. Up and Down the River round 1** — find:
```tsx
        <form
          action={advanceUpAndDownRiverRoundWithId}
          className={`${actionCardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            {playerCount} players ready. Generate Round 1 of {upAndDownRiverRounds}.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Round 1
          </SaveButton>
        </form>
```
replace with:
```tsx
        <RoundActionCard formAction={advanceUpAndDownRiverRoundWithId}>
          <p className="text-slate-600 mb-4">
            {playerCount} players ready. Generate Round 1 of {upAndDownRiverRounds}.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Round 1
          </SaveButton>
        </RoundActionCard>
```

**3i. Up and Down the River next round** — find:
```tsx
        <form
          action={advanceUpAndDownRiverRoundWithId}
          className={`${actionCardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            Round {currentUpAndDownRiverRound} complete. Generate Round{' '}
            {currentUpAndDownRiverRound + 1} of {upAndDownRiverRounds}.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Round {currentUpAndDownRiverRound + 1}
          </SaveButton>
        </form>
```
replace with:
```tsx
        <RoundActionCard formAction={advanceUpAndDownRiverRoundWithId}>
          <p className="text-slate-600 mb-4">
            Round {currentUpAndDownRiverRound} complete. Generate Round{' '}
            {currentUpAndDownRiverRound + 1} of {upAndDownRiverRounds}.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Round {currentUpAndDownRiverRound + 1}
          </SaveButton>
        </RoundActionCard>
```

**3j. Up and Down the River skip round** — find:
```tsx
        <form
          action={advanceUpAndDownRiverRoundWithId}
          className={`${actionCardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            Round {currentUpAndDownRiverRound} isn't finished yet. Skip it and generate Round{' '}
            {currentUpAndDownRiverRound + 1} anyway — any unplayed matches in Round{' '}
            {currentUpAndDownRiverRound} stay unscored and won't count toward anyone's record.
          </p>
          <SaveButton className={outlineButtonClass} pendingLabel="Skipping…">
            Skip to Round {currentUpAndDownRiverRound + 1}
          </SaveButton>
        </form>
```
replace with:
```tsx
        <RoundActionCard formAction={advanceUpAndDownRiverRoundWithId}>
          <p className="text-slate-600 mb-4">
            Round {currentUpAndDownRiverRound} isn't finished yet. Skip it and generate Round{' '}
            {currentUpAndDownRiverRound + 1} anyway — any unplayed matches in Round{' '}
            {currentUpAndDownRiverRound} stay unscored and won't count toward anyone's record.
          </p>
          <SaveButton className={outlineButtonClass} pendingLabel="Skipping…">
            Skip to Round {currentUpAndDownRiverRound + 1}
          </SaveButton>
        </RoundActionCard>
```

**3k. Round-robin generate** — find:
```tsx
        <form action={generateBracketWithId} className={`${actionCardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            {teamCount} teams ready. Generate a round-robin league schedule.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate League Bracket
          </SaveButton>
        </form>
```
replace with:
```tsx
        <RoundActionCard formAction={generateBracketWithId}>
          <p className="text-slate-600 mb-4">
            {teamCount} teams ready. Generate a round-robin league schedule.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate League Bracket
          </SaveButton>
        </RoundActionCard>
```

**3l. League Playoffs generate (has an extra rounds-input field)** — find:
```tsx
        <form
          action={generateLeaguePlayoffsBracketWithId}
          className={`${actionCardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            {teamCount} teams ready. Generate the full League schedule.
          </p>
          <div className="mb-4 max-w-[140px] mx-auto text-left">
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Number of rounds
            </label>
            <input
              name="rounds"
              type="number"
              defaultValue={leaguePlayoffsFullRounds}
              min={1}
              max={leaguePlayoffsFullRounds * MAX_LEAGUE_PLAYOFFS_ROUND_CYCLES}
              className={inputClass}
            />
            <p className="text-xs text-muted mt-1">
              Full round-robin is {leaguePlayoffsFullRounds}{' '}
              round{leaguePlayoffsFullRounds === 1 ? '' : 's'}. Ask for more to repeat it —
              e.g. {leaguePlayoffsFullRounds * 2} rounds plays everyone twice.
            </p>
          </div>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Full Schedule
          </SaveButton>
        </form>
```
replace with:
```tsx
        <RoundActionCard formAction={generateLeaguePlayoffsBracketWithId}>
          <p className="text-slate-600 mb-4">
            {teamCount} teams ready. Generate the full League schedule.
          </p>
          <div className="mb-4 max-w-[140px] mx-auto text-left">
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Number of rounds
            </label>
            <input
              name="rounds"
              type="number"
              defaultValue={leaguePlayoffsFullRounds}
              min={1}
              max={leaguePlayoffsFullRounds * MAX_LEAGUE_PLAYOFFS_ROUND_CYCLES}
              className={inputClass}
            />
            <p className="text-xs text-muted mt-1">
              Full round-robin is {leaguePlayoffsFullRounds}{' '}
              round{leaguePlayoffsFullRounds === 1 ? '' : 's'}. Ask for more to repeat it —
              e.g. {leaguePlayoffsFullRounds * 2} rounds plays everyone twice.
            </p>
          </div>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Full Schedule
          </SaveButton>
        </RoundActionCard>
```

**3m. Regenerate League Playoffs rounds (custom button component, `as="div"`)** — find:
```tsx
        <div className={`${actionCardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            Team roster changed? Regenerate the full {leaguePlayoffsRounds}-round schedule from
            the current teams.
          </p>
          <RegenerateLeagueRoundsButton
            regenerateAction={regenerateLeaguePlayoffsBracketWithId}
            hasScoredMatches={hasScoredLeagueMatches}
          />
        </div>
```
replace with:
```tsx
        <RoundActionCard as="div">
          <p className="text-slate-600 mb-4">
            Team roster changed? Regenerate the full {leaguePlayoffsRounds}-round schedule from
            the current teams.
          </p>
          <RegenerateLeagueRoundsButton
            regenerateAction={regenerateLeaguePlayoffsBracketWithId}
            hasScoredMatches={hasScoredLeagueMatches}
          />
        </RoundActionCard>
```

**3n. Skip to Final (two buttons side by side, `as="div"`)** — find:
```tsx
        <div className={`${actionCardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            {allLeagueComplete
              ? "League complete. Generate the semifinals from the top 4 teams, or skip straight to the final if you're short on time."
              : "Short on time? You don't have to finish every round — generate the semifinals from the top 4 teams by current standings, or skip straight to the final with the top 2."}
          </p>
          <div className="flex items-center justify-center gap-3">
            <form action={generateSemifinalMatchesWithId}>
              <SaveButton className={accentButtonClass} pendingLabel="Generating…">
                Generate Semifinals
              </SaveButton>
            </form>
            <form action={skipToFinalMatchWithId}>
              <SaveButton className={outlineButtonClass} pendingLabel="Skipping…">
                Skip Semifinals — Go to Final
              </SaveButton>
            </form>
          </div>
        </div>
```
replace with:
```tsx
        <RoundActionCard as="div">
          <p className="text-slate-600 mb-4">
            {allLeagueComplete
              ? "League complete. Generate the semifinals from the top 4 teams, or skip straight to the final if you're short on time."
              : "Short on time? You don't have to finish every round — generate the semifinals from the top 4 teams by current standings, or skip straight to the final with the top 2."}
          </p>
          <div className="flex items-center justify-center gap-3">
            <form action={generateSemifinalMatchesWithId}>
              <SaveButton className={accentButtonClass} pendingLabel="Generating…">
                Generate Semifinals
              </SaveButton>
            </form>
            <form action={skipToFinalMatchWithId}>
              <SaveButton className={outlineButtonClass} pendingLabel="Skipping…">
                Skip Semifinals — Go to Final
              </SaveButton>
            </form>
          </div>
        </RoundActionCard>
```

**3o. Generate Final** — find:
```tsx
        <form action={generateFinalMatchWithId} className={`${actionCardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">Semifinals complete. Generate the final.</p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Final
          </SaveButton>
        </form>
```
replace with:
```tsx
        <RoundActionCard formAction={generateFinalMatchWithId}>
          <p className="text-slate-600 mb-4">Semifinals complete. Generate the final.</p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Final
          </SaveButton>
        </RoundActionCard>
```

**Do not touch** the "Add Match" card (`className={`${actionCardClass} mb-6`}`, no `text-center`, around line 806) — it's a persistent form section, not a one-off generate/skip prompt, and its wrapper classes differ (no `text-center`).

- [ ] **Step 4: Verify `actionCardClass` is still imported but no longer needed directly in this file for these 15 sites**

`actionCardClass` is also used by the "Add Match" card (untouched), so its import on line 6 stays. Run:
```bash
cd apps/organizer-web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

```bash
cd apps/organizer-web && npx vitest run
```
Expected: 431/431 passing (no test covers this page's JSX shape directly, so this confirms no regression elsewhere).

- [ ] **Step 6: Visual verification**

Create a temporary route `apps/organizer-web/app/dev-preview-round-action-card/page.tsx`:
```tsx
import RoundActionCard from '@/app/components/RoundActionCard';
import SaveButton from '@/app/components/SaveButton';
import { accentButtonClass, outlineButtonClass } from '@/app/components/ui';

async function noop() {
  'use server';
}

export default function DevPreviewRoundActionCard() {
  return (
    <div className="max-w-md mx-auto p-8 space-y-4">
      <RoundActionCard formAction={noop}>
        <p className="text-slate-600 mb-4">4 players ready. Generate Round 1 of 5.</p>
        <SaveButton className={accentButtonClass} pendingLabel="Generating…">
          Generate Round 1
        </SaveButton>
      </RoundActionCard>
      <RoundActionCard as="div">
        <p className="text-slate-600 mb-4">Two-button variant.</p>
        <div className="flex items-center justify-center gap-3">
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Semifinals
          </SaveButton>
          <SaveButton className={outlineButtonClass} pendingLabel="Skipping…">
            Skip — Go to Final
          </SaveButton>
        </div>
      </RoundActionCard>
    </div>
  );
}
```
Use `preview_start` (`{name: "organizer-web"}`), navigate to `/dev-preview-round-action-card`, screenshot, confirm both cards render with the same gold-tinted `actionCardClass` card treatment as before (a gradient cream-to-white background, gold border, centered text). Then delete the temp route:
```bash
rm -rf apps/organizer-web/app/dev-preview-round-action-card
```
Confirm it leaves no trace: `git status --short apps/organizer-web/app/dev-preview-round-action-card` (expect empty output).

- [ ] **Step 7: Commit**

```bash
git add apps/organizer-web/app/components/RoundActionCard.tsx "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx"
git commit -m "refactor: extract RoundActionCard, de-duplicate Bracket page action blocks"
```

---

### Task 2: Create `<StandingsTable>` and adopt it in the Bracket page's table and the public `/t/[id]` table

**Files:**
- Create: `apps/organizer-web/app/components/StandingsTable.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`
- Modify: `apps/organizer-web/app/t/[id]/page.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type StandingsTableRow = {
    key: string;
    name: string;
    wins: number;
    losses: number;
    medal?: string;
    medalLabel?: string;
    nameClassName?: string;
  };
  export type StandingsTableColumn = {
    header: string;
    align?: 'left' | 'center'; // default 'center'
    cells: React.ReactNode[]; // same length and order as `rows`
  };
  export type StandingsTableProps = {
    nameColumnHeader: string;
    rows: StandingsTableRow[];
    columnsBeforeWL?: StandingsTableColumn[];
    columnsAfterWL?: StandingsTableColumn[];
    winLossStyle?: 'plain' | 'pill'; // default 'plain'
    highlightFirstRow?: boolean; // default false
  };
  ```
  Default export `StandingsTable(props: StandingsTableProps)`.
- Consumed by: this task's 2 call sites (plain style, no extra columns, no highlight) and Task 3's 3 call sites (pill style, extra columns, highlight — Task 3 depends on this task).

- [ ] **Step 1: Create the component**

```tsx
// apps/organizer-web/app/components/StandingsTable.tsx
//
// Shared standings table -- unifies what were 3 separate implementations
// (standings/page.tsx, bracket/page.tsx's league-standings table, and the public
// /t/[id] standings table). The common shape is rank (with medal on top 3), name, and
// W/L columns; each caller can add its own extra columns before or after W/L (e.g.
// standings/page.tsx's Ladder Pts and Point/Avg Diff columns, which only exist there --
// bracket and the public page show plain team W/L with no rank-movement or points data).
export type StandingsTableRow = {
  key: string;
  name: string;
  wins: number;
  losses: number;
  medal?: string;
  medalLabel?: string;
  nameClassName?: string;
};

export type StandingsTableColumn = {
  header: string;
  align?: 'left' | 'center';
  cells: React.ReactNode[];
};

export type StandingsTableProps = {
  nameColumnHeader: string;
  rows: StandingsTableRow[];
  columnsBeforeWL?: StandingsTableColumn[];
  columnsAfterWL?: StandingsTableColumn[];
  winLossStyle?: 'plain' | 'pill';
  highlightFirstRow?: boolean;
};

const WIN_PILL_CLASS =
  'stat-num inline-flex items-center justify-center min-w-7 h-7 px-1.5 rounded-full bg-navy-tint text-navy-deep font-extrabold';
const LOSS_PILL_CLASS =
  'stat-num inline-flex items-center justify-center min-w-7 h-7 px-1.5 rounded-full bg-slate-100 text-slate-500 font-extrabold';

export default function StandingsTable({
  nameColumnHeader,
  rows,
  columnsBeforeWL = [],
  columnsAfterWL = [],
  winLossStyle = 'plain',
  highlightFirstRow = false,
}: StandingsTableProps) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b border-slate-200">
          <th className="pb-2 font-semibold">{nameColumnHeader}</th>
          {columnsBeforeWL.map((col) => (
            <th
              key={col.header}
              className={`pb-2 font-semibold ${col.align === 'left' ? '' : 'text-center'}`}
            >
              {col.header}
            </th>
          ))}
          <th className="pb-2 font-semibold text-center">W</th>
          <th className="pb-2 font-semibold text-center">L</th>
          {columnsAfterWL.map((col) => (
            <th
              key={col.header}
              className={`pb-2 font-semibold ${col.align === 'left' ? '' : 'text-center'}`}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={row.key}
            className={
              highlightFirstRow && i === 0
                ? 'border-b border-slate-100 last:border-0 bg-gradient-to-r from-amber-50 via-amber-50/50 to-transparent'
                : 'border-b border-slate-100 last:border-0'
            }
          >
            <td className={`py-2 ${row.nameClassName ?? 'font-semibold text-slate-900'}`}>
              {row.medal && (
                <span className="mr-1.5" role="img" aria-label={row.medalLabel}>
                  {row.medal}
                </span>
              )}
              {row.name}
            </td>
            {columnsBeforeWL.map((col) => (
              <td key={col.header} className={`py-2 ${col.align === 'left' ? '' : 'text-center'}`}>
                {col.cells[i]}
              </td>
            ))}
            <td className="py-2 text-center">
              {winLossStyle === 'pill' ? (
                <span className={WIN_PILL_CLASS}>{row.wins}</span>
              ) : (
                <span className="stat-num text-navy-mid font-extrabold">{row.wins}</span>
              )}
            </td>
            <td className="py-2 text-center">
              {winLossStyle === 'pill' ? (
                <span className={LOSS_PILL_CLASS}>{row.losses}</span>
              ) : (
                <span className="stat-num text-muted font-semibold">{row.losses}</span>
              )}
            </td>
            {columnsAfterWL.map((col) => (
              <td key={col.header} className={`py-2 ${col.align === 'left' ? '' : 'text-center'}`}>
                {col.cells[i]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Adopt it in `bracket/page.tsx`'s League Standings table**

Add the import near the other component imports (after the `RoundActionCard` import added in Task 1):
```tsx
import StandingsTable from '@/app/components/StandingsTable';
```

Find (around line 1042-1066):
```tsx
      {supportsPlayoffs && leagueStandings.length > 0 && (
        <div className={`${cardClass} mb-6 overflow-x-auto`}>
          <h2 className="text-sm font-bold text-navy-mid uppercase tracking-wide mb-2">
            {isCustom ? 'Team Standings (Playoff Seeding)' : 'League Standings'}
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="pb-2 font-semibold">Team</th>
                <th className="pb-2 font-semibold text-center">W</th>
                <th className="pb-2 font-semibold text-center">L</th>
              </tr>
            </thead>
            <tbody>
              {leagueStandings.map((s) => (
                <tr key={s.teamId} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 font-semibold text-slate-900">{teamById.get(s.teamId)}</td>
                  <td className="py-2 text-center text-navy-mid font-bold">{s.wins}</td>
                  <td className="py-2 text-center text-slate-500">{s.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
```
replace with:
```tsx
      {supportsPlayoffs && leagueStandings.length > 0 && (
        <div className={`${cardClass} mb-6 overflow-x-auto`}>
          <h2 className="text-sm font-bold text-navy-mid uppercase tracking-wide mb-2">
            {isCustom ? 'Team Standings (Playoff Seeding)' : 'League Standings'}
          </h2>
          <StandingsTable
            nameColumnHeader="Team"
            rows={leagueStandings.map((s) => ({
              key: s.teamId,
              name: teamById.get(s.teamId) ?? '',
              wins: s.wins,
              losses: s.losses,
            }))}
          />
        </div>
      )}
```
(This moves `s.wins`/`s.losses` from `font-bold`/plain `text-slate-500` to the shared component's `stat-num font-extrabold text-navy-mid` / `stat-num font-semibold text-muted` — a pure token-consistency fix per the spec, matching what `/t/[id]`'s table already does; `text-muted` and `text-slate-500` are the same color, so only the weight and `stat-num` tabular-figures treatment change.)

- [ ] **Step 3: Adopt it in `/t/[id]/page.tsx`'s public standings table**

Add the import near the top of the file (after the `AlertBanner` import):
```tsx
import StandingsTable from '@/app/components/StandingsTable';
```

Find (around line 194-223):
```tsx
        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">
            {isLeaguePlayoffs ? 'League Standings' : 'Standings'}
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="pb-2 font-semibold">Team</th>
                <th className="pb-2 font-semibold text-center">W</th>
                <th className="pb-2 font-semibold text-center">L</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => {
                const medal = ['🥇', '🥈', '🥉'][i];
                const medalLabel = ['1st place', '2nd place', '3rd place'][i];
                return (
                  <tr key={s.teamId} className="border-b border-slate-100 last:border-0">
                    <td className={`py-2 ${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`}>
                      {medal && <span className="mr-1.5" role="img" aria-label={medalLabel}>{medal}</span>}
                      {teamById.get(s.teamId)}
                    </td>
                    <td className="stat-num py-2 text-center text-navy-mid font-extrabold">{s.wins}</td>
                    <td className="stat-num py-2 text-center text-muted font-semibold">{s.losses}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
```
replace with:
```tsx
        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">
            {isLeaguePlayoffs ? 'League Standings' : 'Standings'}
          </h2>
          <StandingsTable
            nameColumnHeader="Team"
            rows={standings.map((s, i) => ({
              key: s.teamId,
              name: teamById.get(s.teamId) ?? 'Unknown',
              wins: s.wins,
              losses: s.losses,
              medal: ['🥇', '🥈', '🥉'][i],
              medalLabel: ['1st place', '2nd place', '3rd place'][i],
              nameClassName: `${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`,
            }))}
          />
        </div>
```

- [ ] **Step 4: Run tsc and the test suite**

```bash
cd apps/organizer-web && npx tsc --noEmit && npx vitest run
```
Expected: no type errors, 431/431 tests passing.

- [ ] **Step 5: Visual verification**

Create `apps/organizer-web/app/dev-preview-standings-table/page.tsx`:
```tsx
import StandingsTable from '@/app/components/StandingsTable';

export default function DevPreviewStandingsTable() {
  return (
    <div className="max-w-xl mx-auto p-8 space-y-8 bg-white">
      <div>
        <h2 className="text-sm font-bold mb-2">Plain (bracket/public style)</h2>
        <StandingsTable
          nameColumnHeader="Team"
          rows={[
            { key: '1', name: 'Aisha / Omar', wins: 4, losses: 0, medal: '🥇', medalLabel: '1st place', nameClassName: 'font-extrabold text-base text-slate-900' },
            { key: '2', name: 'Sara / Youssef', wins: 3, losses: 1, medal: '🥈', medalLabel: '2nd place', nameClassName: 'font-semibold text-slate-900' },
            { key: '3', name: 'Fatima / Zayed', wins: 1, losses: 3, nameClassName: 'font-semibold text-slate-900' },
          ]}
        />
      </div>
    </div>
  );
}
```
Use `preview_start`, navigate to `/dev-preview-standings-table`, screenshot, confirm medal + tabular W/L render correctly. Delete the temp route and confirm no trace:
```bash
rm -rf apps/organizer-web/app/dev-preview-standings-table
git status --short apps/organizer-web/app/dev-preview-standings-table
```

- [ ] **Step 6: Commit**

```bash
git add apps/organizer-web/app/components/StandingsTable.tsx "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx" "apps/organizer-web/app/t/[id]/page.tsx"
git commit -m "refactor: extract StandingsTable, adopt in bracket and public standings"
```

---

### Task 3: Adopt `<StandingsTable>` in `standings/page.tsx` (all 3 format branches)

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/standings/page.tsx`

**Interfaces:**
- Consumes: `StandingsTable`, `StandingsTableRow`, `StandingsTableColumn` from Task 2 (`@/app/components/StandingsTable`).

**Depends on:** Task 2 (creates `StandingsTable`).

- [ ] **Step 1: Add the import**

Find (near the top of `standings/page.tsx`):
```tsx
import { cardClass, headingClass } from '@/app/components/ui';
```
Add directly after it:
```tsx
import StandingsTable from '@/app/components/StandingsTable';
```

- [ ] **Step 2: Replace the `<table>` block with `<StandingsTable>`, computing rows/columns per branch**

Find the entire table block (from `<div className={`${cardClass} overflow-x-auto`}>` through its closing `</div>`, currently lines 242-336):
```tsx
      <div className={`${cardClass} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="pb-2 font-semibold">{isIndividualFormat ? 'Player' : 'Team'}</th>
              {isLadderFormat && (
                <th className="pb-2 font-semibold text-center">Ladder Pts</th>
              )}
              <th className="pb-2 font-semibold text-center">W</th>
              <th className="pb-2 font-semibold text-center">L</th>
              <th className="pb-2 font-semibold text-center">
                {isLadderFormat ? 'Avg Diff' : 'Point Diff'}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLadderFormat
              ? ladderStandings.map((s, i) => {
                  const medal = ['🥇', '🥈', '🥉'][i];
                  const medalLabel = ['1st place', '2nd place', '3rd place'][i];
                  const games = s.wins + s.losses;
                  const avgDiff = games > 0 ? (s.pointsFor - s.pointsAgainst) / games : 0;
                  return (
                    <tr key={s.playerId} className={rowClass(i)}>
                      <td className={`py-2 ${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`}>
                        {medal && <span className="mr-1.5" role="img" aria-label={medalLabel}>{medal}</span>}
                        {playerById.get(s.playerId)}
                      </td>
                      <td className="stat-num py-2 text-center text-navy-mid font-extrabold">{s.ladderPoints}</td>
                      <td className="py-2 text-center">
                        <span className={winPillClass}>{s.wins}</span>
                      </td>
                      <td className="py-2 text-center">
                        <span className={lossPillClass}>{s.losses}</span>
                      </td>
                      <td className={`stat-num py-2 text-center font-bold ${diffClass(avgDiff)}`}>
                        {diffPrefix(avgDiff)}
                        {avgDiff > 0 ? '+' : ''}
                        {avgDiff.toFixed(1)}
                      </td>
                    </tr>
                  );
                })
              : isIndividualFormat
                ? individualStandings.map((s, i) => {
                    const medal = ['🥇', '🥈', '🥉'][i];
                    const medalLabel = ['1st place', '2nd place', '3rd place'][i];
                    const diff = s.pointsFor - s.pointsAgainst;
                    return (
                      <tr key={s.playerId} className={rowClass(i)}>
                        <td className={`py-2 ${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`}>
                          {medal && <span className="mr-1.5" role="img" aria-label={medalLabel}>{medal}</span>}
                          {playerById.get(s.playerId)}
                        </td>
                        <td className="py-2 text-center">
                          <span className={winPillClass}>{s.wins}</span>
                        </td>
                        <td className="py-2 text-center">
                          <span className={lossPillClass}>{s.losses}</span>
                        </td>
                        <td className={`stat-num py-2 text-center font-bold ${diffClass(diff)}`}>
                          {diffPrefix(diff)}
                          {diff > 0 ? '+' : ''}
                          {diff}
                        </td>
                      </tr>
                    );
                  })
                : standings.map((s, i) => {
                    const medal = ['🥇', '🥈', '🥉'][i];
                    const medalLabel = ['1st place', '2nd place', '3rd place'][i];
                    const diff = s.pointsFor - s.pointsAgainst;
                    return (
                      <tr key={s.teamId} className={rowClass(i)}>
                        <td className={`py-2 ${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`}>
                          {medal && <span className="mr-1.5" role="img" aria-label={medalLabel}>{medal}</span>}
                          {teamById.get(s.teamId)}
                        </td>
                        <td className="py-2 text-center">
                          <span className={winPillClass}>{s.wins}</span>
                        </td>
                        <td className="py-2 text-center">
                          <span className={lossPillClass}>{s.losses}</span>
                        </td>
                        <td className={`stat-num py-2 text-center font-bold ${diffClass(diff)}`}>
                          {diffPrefix(diff)}
                          {diff > 0 ? '+' : ''}
                          {diff}
                        </td>
                      </tr>
                    );
                  })}
          </tbody>
        </table>
      </div>
```
replace with:
```tsx
      <div className={`${cardClass} overflow-x-auto`}>
        <StandingsTable
          nameColumnHeader={isIndividualFormat ? 'Player' : 'Team'}
          winLossStyle="pill"
          highlightFirstRow
          columnsBeforeWL={
            isLadderFormat
              ? [
                  {
                    header: 'Ladder Pts',
                    cells: ladderStandings.map((s) => (
                      <span key={s.playerId} className="stat-num text-navy-mid font-extrabold">
                        {s.ladderPoints}
                      </span>
                    )),
                  },
                ]
              : []
          }
          columnsAfterWL={[
            {
              header: isLadderFormat ? 'Avg Diff' : 'Point Diff',
              cells: isLadderFormat
                ? ladderStandings.map((s) => {
                    const games = s.wins + s.losses;
                    const avgDiff = games > 0 ? (s.pointsFor - s.pointsAgainst) / games : 0;
                    return (
                      <span key={s.playerId} className={`stat-num font-bold ${diffClass(avgDiff)}`}>
                        {diffPrefix(avgDiff)}
                        {avgDiff > 0 ? '+' : ''}
                        {avgDiff.toFixed(1)}
                      </span>
                    );
                  })
                : isIndividualFormat
                  ? individualStandings.map((s) => {
                      const diff = s.pointsFor - s.pointsAgainst;
                      return (
                        <span key={s.playerId} className={`stat-num font-bold ${diffClass(diff)}`}>
                          {diffPrefix(diff)}
                          {diff > 0 ? '+' : ''}
                          {diff}
                        </span>
                      );
                    })
                  : standings.map((s) => {
                      const diff = s.pointsFor - s.pointsAgainst;
                      return (
                        <span key={s.teamId} className={`stat-num font-bold ${diffClass(diff)}`}>
                          {diffPrefix(diff)}
                          {diff > 0 ? '+' : ''}
                          {diff}
                        </span>
                      );
                    }),
            },
          ]}
          rows={
            isLadderFormat
              ? ladderStandings.map((s, i) => ({
                  key: s.playerId,
                  name: playerById.get(s.playerId) ?? 'Unknown',
                  wins: s.wins,
                  losses: s.losses,
                  medal: ['🥇', '🥈', '🥉'][i],
                  medalLabel: ['1st place', '2nd place', '3rd place'][i],
                  nameClassName: `${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`,
                }))
              : isIndividualFormat
                ? individualStandings.map((s, i) => ({
                    key: s.playerId,
                    name: playerById.get(s.playerId) ?? 'Unknown',
                    wins: s.wins,
                    losses: s.losses,
                    medal: ['🥇', '🥈', '🥉'][i],
                    medalLabel: ['1st place', '2nd place', '3rd place'][i],
                    nameClassName: `${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`,
                  }))
                : standings.map((s, i) => ({
                    key: s.teamId,
                    name: teamById.get(s.teamId) ?? 'Unknown',
                    wins: s.wins,
                    losses: s.losses,
                    medal: ['🥇', '🥈', '🥉'][i],
                    medalLabel: ['1st place', '2nd place', '3rd place'][i],
                    nameClassName: `${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`,
                  }))
          }
        />
      </div>
```

**Note:** `rowClass`, `winPillClass`, and `lossPillClass` (defined earlier in the file at lines 215-222) are no longer referenced after this change — remove their declarations too. Find:
```tsx
  const winPillClass =
    'stat-num inline-flex items-center justify-center min-w-7 h-7 px-1.5 rounded-full bg-navy-tint text-navy-deep font-extrabold';
  const lossPillClass =
    'stat-num inline-flex items-center justify-center min-w-7 h-7 px-1.5 rounded-full bg-slate-100 text-slate-500 font-extrabold';
  const rowClass = (rank: number) =>
    rank === 0
      ? 'border-b border-slate-100 last:border-0 bg-gradient-to-r from-amber-50 via-amber-50/50 to-transparent'
      : 'border-b border-slate-100 last:border-0';
  const diffClass = (diff: number) =>
    diff > 0 ? 'text-win' : diff < 0 ? 'text-loss' : 'text-muted';
  // Glyph-first signal (▲/▼) so win/loss direction isn't carried by color alone.
  const diffPrefix = (diff: number) => (diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : '');
```
replace with (keeping only `diffClass` and `diffPrefix`, which the new `columnsAfterWL` cells above still use):
```tsx
  const diffClass = (diff: number) =>
    diff > 0 ? 'text-win' : diff < 0 ? 'text-loss' : 'text-muted';
  // Glyph-first signal (▲/▼) so win/loss direction isn't carried by color alone.
  const diffPrefix = (diff: number) => (diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : '');
```

- [ ] **Step 3: Run tsc and the test suite**

```bash
cd apps/organizer-web && npx tsc --noEmit && npx vitest run
```
Expected: no type errors, 431/431 tests passing.

- [ ] **Step 4: Visual verification**

Since `standings/page.tsx` requires auth and real tournament data, verify via the running dev server against a real (or test) tournament instead of a synthetic dev-preview route: `preview_start` (`{name: "organizer-web"}`), sign in, navigate to `/tournaments/<id>/standings` for a team-format, an individual-format, and a ladder-format (Claim the Throne or Up and Down the River) tournament if available, screenshot each, and confirm: podium unchanged (Task 3 doesn't touch `Podium`), table shows medal + pill-styled W/L + Point Diff (and Ladder Pts, for the ladder case) exactly as before, first-place row keeps its amber highlight.

If no ladder-format tournament exists in the dev database, this branch is still covered by `npx tsc --noEmit` (verifies the ladder branch's types compile) — note this gap in the task report rather than fabricating data.

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/standings/page.tsx"
git commit -m "refactor: adopt StandingsTable in standings page across all 3 formats"
```

---

### Task 4: Header context strip — `OrganizerShell` prop + wire into the 5 tournament sub-pages

**Files:**
- Modify: `apps/organizer-web/app/components/OrganizerShell.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/roster/page.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/teams/page.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/standings/page.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/results/page.tsx`

**Interfaces:**
- Produces: `OrganizerShell` gains an optional prop `contextStrip?: { title: string; dateLabel: string; venueName: string }`.

- [ ] **Step 1: Add the prop and render it in `OrganizerShell.tsx`**

Find the props destructuring (lines 93-101):
```tsx
export default function OrganizerShell({
  children,
  organizerName,
  role,
}: {
  children: React.ReactNode;
  organizerName?: string;
  role: 'owner' | 'guest';
}) {
```
replace with:
```tsx
export default function OrganizerShell({
  children,
  organizerName,
  role,
  contextStrip,
}: {
  children: React.ReactNode;
  organizerName?: string;
  role: 'owner' | 'guest';
  contextStrip?: { title: string; dateLabel: string; venueName: string };
}) {
```

**Important positioning note:** the circular logo `<Link>` (lines 211-219) is NOT inside the `max-w-3xl mx-auto` wordmark div — it's a sibling of `<header>`, inside the outermost `<div className="relative">` that wraps the whole header, so its `left-[30px]` is measured from the true page edge, not from the centered content column. On desktop, the wordmark's `max-w-3xl` column is centered with margins on both sides, so nesting the context strip inside it (rather than in the same frame as the logo) would visibly misalign the two on any viewport wider than 768px — the strip would drift right along with the centered column while the logo stays pinned near the true left edge. The context strip must be positioned in the SAME frame as the logo (a sibling of it, inside the outer `<div className="relative">`), not nested inside the wordmark's constrained div.

Find the logo `<Link>` block (lines 211-219):
```tsx
        <Link href="/tournaments" className="absolute z-10 left-[30px] top-[196px] -translate-y-1/2">
          <Image
            src="/logo.png"
            alt="PicklerAlly DXB"
            width={140}
            height={140}
            className="rounded-full border-[5px] border-white shadow-xl object-cover"
          />
        </Link>
      </div>
```
replace with:
```tsx
        <Link href="/tournaments" className="absolute z-10 left-[30px] top-[196px] -translate-y-1/2">
          <Image
            src="/logo.png"
            alt="PicklerAlly DXB"
            width={140}
            height={140}
            className="rounded-full border-[5px] border-white shadow-xl object-cover"
          />
        </Link>
        {contextStrip && (
          <div
            className="absolute z-10 left-[186px] top-[196px] -translate-y-1/2 max-w-[160px] sm:max-w-xs text-left"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}
          >
            <div className="font-heading font-bold text-sm sm:text-base text-white truncate">
              {contextStrip.title}
            </div>
            <div className="text-xs text-[#dbe4f5] truncate">
              {contextStrip.dateLabel} · 📍 {contextStrip.venueName}
            </div>
          </div>
        )}
      </div>
```
(`left-[186px]` clears the circular logo — 140px wide starting at `left-[30px]`, so `30 + 140 + 16px gap = 186px` — and uses the exact same `top-[196px] -translate-y-1/2` vertical anchor as the logo itself, so the two always align regardless of viewport width. `max-w-[160px] sm:max-w-xs` keeps the text from stretching oddly wide on large screens while the header photo bleeds full-width behind it.)

- [ ] **Step 2: Wire it into `roster/page.tsx` (both `<OrganizerShell>` call sites)**

Find the first call site (around line 127, inside the `if (pendingNames)` early-return branch):
```tsx
      <OrganizerShell organizerName={organizer.name} role={role}>
        <TournamentNav tournamentId={id} current="roster" />
        <h1 className={`text-2xl ${headingClass} mb-6`}>Review Roster Additions</h1>
```
replace with:
```tsx
      <OrganizerShell
        organizerName={organizer.name}
        role={role}
        contextStrip={{ title: tournament?.name ?? '', dateLabel: tournament?.date ?? '', venueName }}
      >
        <TournamentNav tournamentId={id} current="roster" />
        <h1 className={`text-2xl ${headingClass} mb-6`}>Review Roster Additions</h1>
```

Find the second call site (around line 185, the main return):
```tsx
    <OrganizerShell organizerName={organizer.name} role={role}>
      <MarkRosterSeen tournamentId={id} playerCount={(players ?? []).length} />
      <TournamentNav tournamentId={id} current="roster" />
```
replace with:
```tsx
    <OrganizerShell
      organizerName={organizer.name}
      role={role}
      contextStrip={{ title: tournament?.name ?? '', dateLabel: tournament?.date ?? '', venueName }}
    >
      <MarkRosterSeen tournamentId={id} playerCount={(players ?? []).length} />
      <TournamentNav tournamentId={id} current="roster" />
```

- [ ] **Step 3: Wire it into `teams/page.tsx` (needs the tournament query widened first)**

Find:
```tsx
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('format')
    .eq('id', id)
    .single();

  const isLeaguePlayoffs = tournament?.format === 'league_playoffs';
  const isAutoPaired = isIndividualFormat(tournament?.format ?? '');
```
replace with:
```tsx
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, date, format, venues(name)')
    .eq('id', id)
    .single();

  const isLeaguePlayoffs = tournament?.format === 'league_playoffs';
  const isAutoPaired = isIndividualFormat(tournament?.format ?? '');

  const venue = tournament?.venues as { name: string } | { name: string }[] | null;
  const venueName = Array.isArray(venue) ? (venue[0]?.name ?? 'Pickleturf') : (venue?.name ?? 'Pickleturf');
```

Find:
```tsx
  return (
    <OrganizerShell organizerName={organizer.name} role={role}>
      <TournamentNav tournamentId={id} current="teams" />
```
replace with:
```tsx
  return (
    <OrganizerShell
      organizerName={organizer.name}
      role={role}
      contextStrip={{ title: tournament?.name ?? '', dateLabel: tournament?.date ?? '', venueName }}
    >
      <TournamentNav tournamentId={id} current="teams" />
```

- [ ] **Step 4: Wire it into `bracket/page.tsx`**

Find:
```tsx
    <OrganizerShell organizerName={organizer.name} role={role}>
      <TournamentNav tournamentId={id} current="bracket" />
```
replace with:
```tsx
    <OrganizerShell
      organizerName={organizer.name}
      role={role}
      contextStrip={{ title: tournament?.name ?? '', dateLabel: tournament?.date ?? '', venueName }}
    >
      <TournamentNav tournamentId={id} current="bracket" />
```
(`tournament?.name` and `venueName` already exist in scope — `tournament` is fetched with `name, date, ...` and `venueName` is computed at line 63.)

- [ ] **Step 5: Wire it into `standings/page.tsx` (needs the tournament query widened first)**

Find:
```tsx
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('format')
    .eq('id', id)
    .single();

  const isLadderFormat = isLadderFormatCheck(tournament?.format ?? '');
  const isIndividualFormat = usesIndividualStandings(tournament?.format ?? '');
```
replace with:
```tsx
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, date, format, venues(name)')
    .eq('id', id)
    .single();

  const isLadderFormat = isLadderFormatCheck(tournament?.format ?? '');
  const isIndividualFormat = usesIndividualStandings(tournament?.format ?? '');

  const venue = tournament?.venues as { name: string } | { name: string }[] | null;
  const venueName = Array.isArray(venue) ? (venue[0]?.name ?? 'Pickleturf') : (venue?.name ?? 'Pickleturf');
```

Find:
```tsx
    <OrganizerShell organizerName={organizer.name} role={role}>
      <TournamentNav tournamentId={id} current="standings" />
```
replace with:
```tsx
    <OrganizerShell
      organizerName={organizer.name}
      role={role}
      contextStrip={{ title: tournament?.name ?? '', dateLabel: tournament?.date ?? '', venueName }}
    >
      <TournamentNav tournamentId={id} current="standings" />
```

- [ ] **Step 6: Wire it into `results/page.tsx`**

Find:
```tsx
    <OrganizerShell organizerName={organizer.name} role={role}>
      <TournamentNav tournamentId={id} current="results" />
```
replace with:
```tsx
    <OrganizerShell
      organizerName={organizer.name}
      role={role}
      contextStrip={{ title: tournament.name, dateLabel: tournament.date, venueName }}
    >
      <TournamentNav tournamentId={id} current="results" />
```
(Note: `results/page.tsx` has already null-checked `tournament` via its own earlier early return when not found — by this point in the file `tournament` is non-nullable, so use `tournament.name`/`tournament.date` directly, not `tournament?.name`, matching the file's own existing convention elsewhere in this function.)

- [ ] **Step 7: Run tsc and the test suite**

```bash
cd apps/organizer-web && npx tsc --noEmit && npx vitest run
```
Expected: no type errors, 431/431 tests passing.

- [ ] **Step 8: Visual verification**

`preview_start` (`{name: "organizer-web"}`), sign in, navigate to `/tournaments/<id>/roster`, `/teams`, `/bracket`, `/standings`, `/results` for a real tournament. Screenshot each header. Confirm: the tournament name + date + venue appear to the right of the circular logo, legible against the header photo, truncating gracefully on narrow viewports (`resize_window` to `mobile` preset and re-screenshot at least one page). Confirm routes WITHOUT `contextStrip` (e.g. `/tournaments`, `/people`) render their header exactly as before (no strip, no layout shift).

- [ ] **Step 9: Commit**

```bash
git add apps/organizer-web/app/components/OrganizerShell.tsx \
  "apps/organizer-web/app/tournaments/[id]/roster/page.tsx" \
  "apps/organizer-web/app/tournaments/[id]/teams/page.tsx" \
  "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx" \
  "apps/organizer-web/app/tournaments/[id]/standings/page.tsx" \
  "apps/organizer-web/app/tournaments/[id]/results/page.tsx"
git commit -m "feat: header context strip on tournament sub-pages, fills the dead header band"
```

---

### Task 5: Desktop container widening — `OrganizerShell` prop + People/Tournaments pages

**Files:**
- Modify: `apps/organizer-web/app/components/OrganizerShell.tsx`
- Modify: `apps/organizer-web/app/people/page.tsx`
- Modify: `apps/organizer-web/app/tournaments/page.tsx`

**Interfaces:**
- Produces: `OrganizerShell` gains an optional prop `containerWidth?: 'default' | 'wide'` (default `'default'`).

- [ ] **Step 1: Add the prop to `OrganizerShell.tsx`**

Find (this is the same destructuring block Task 4 modifies — if Task 4 has already run, add `containerWidth` alongside `contextStrip`; if running independently, start from the original block):
```tsx
export default function OrganizerShell({
  children,
  organizerName,
  role,
  contextStrip,
}: {
  children: React.ReactNode;
  organizerName?: string;
  role: 'owner' | 'guest';
  contextStrip?: { title: string; dateLabel: string; venueName: string };
}) {
```
replace with:
```tsx
export default function OrganizerShell({
  children,
  organizerName,
  role,
  contextStrip,
  containerWidth = 'default',
}: {
  children: React.ReactNode;
  organizerName?: string;
  role: 'owner' | 'guest';
  contextStrip?: { title: string; dateLabel: string; venueName: string };
  containerWidth?: 'default' | 'wide';
}) {
```

Find:
```tsx
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 pt-20 pb-24">{children}</main>
```
replace with:
```tsx
      <main
        className={`flex-1 w-full mx-auto px-4 pt-20 pb-24 ${containerWidth === 'wide' ? 'max-w-5xl' : 'max-w-3xl'}`}
      >
        {children}
      </main>
```

- [ ] **Step 2: Apply it to `people/page.tsx`**

Find:
```tsx
    <OrganizerShell organizerName={organizer.name} role={role}>
      <h1 className={`text-2xl ${headingClass} mb-6`}>Player Profiles</h1>
```
replace with:
```tsx
    <OrganizerShell organizerName={organizer.name} role={role} containerWidth="wide">
      <h1 className={`text-2xl ${headingClass} mb-6`}>Player Profiles</h1>
```

Find:
```tsx
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
```
replace with:
```tsx
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
```

- [ ] **Step 3: Apply it to `tournaments/page.tsx`**

Find:
```tsx
    <OrganizerShell organizerName={organizer.name} role={role}>
      {(tournaments ?? []).length === 0 && (
```
replace with:
```tsx
    <OrganizerShell organizerName={organizer.name} role={role} containerWidth="wide">
      {(tournaments ?? []).length === 0 && (
```

Find (the "Upcoming Leagues" list):
```tsx
              <h2 className="text-xl font-bold text-white mb-3 font-heading">Upcoming Leagues</h2>
              <ul className="space-y-3">
```
replace with:
```tsx
              <h2 className="text-xl font-bold text-white mb-3 font-heading">Upcoming Leagues</h2>
              <ul className="grid gap-3 lg:grid-cols-2 lg:gap-4">
```

Find (the "Recently Completed" list):
```tsx
              <h2 className="text-xl font-bold text-white mb-3 font-heading">Recently Completed</h2>
              <ul className="space-y-3">
```
replace with:
```tsx
              <h2 className="text-xl font-bold text-white mb-3 font-heading">Recently Completed</h2>
              <ul className="grid gap-3 lg:grid-cols-2 lg:gap-4">
```

- [ ] **Step 4: Run tsc and the test suite**

```bash
cd apps/organizer-web && npx tsc --noEmit && npx vitest run
```
Expected: no type errors, 431/431 tests passing.

- [ ] **Step 5: Visual verification**

`preview_start` (`{name: "organizer-web"}`), sign in, `resize_window` to a desktop size (e.g. 1440x900 via custom width/height), navigate to `/people` and `/tournaments`. Screenshot both. Confirm: People shows up to 4 avatar columns, Tournaments shows a 2-column card grid, both wider than the app's other pages (e.g. `/locations`, still `max-w-3xl`). Then `resize_window` to `mobile` preset, re-screenshot both, confirm mobile layout is completely unchanged from before this task (2-column People grid, single-column Tournaments list).

- [ ] **Step 6: Commit**

```bash
git add apps/organizer-web/app/components/OrganizerShell.tsx apps/organizer-web/app/people/page.tsx apps/organizer-web/app/tournaments/page.tsx
git commit -m "feat: widen desktop container for People and Tournaments browsing pages"
```

---

### Task 6: Resolve the "two blacks" — recolor `#1c1917` to navy in ThreatBadge and PlayerStatsCard

**Files:**
- Modify: `apps/organizer-web/app/components/ThreatBadge.tsx`
- Modify: `apps/organizer-web/app/components/PlayerStatsCard.tsx`

**Interfaces:** None — pure fill-color values change, no prop or signature changes anywhere.

- [ ] **Step 1: Recolor `ThreatBadge.tsx`'s 2 backgrounds**

Find:
```tsx
        className="inline-flex items-center gap-3 rounded-lg border border-[#3f3f46] bg-[#1c1917] px-3 py-2"
```
replace with:
```tsx
        className="inline-flex items-center gap-3 rounded-lg border border-[#3f3f46] bg-[#0c1830] px-3 py-2"
```

Find:
```tsx
      className="inline-flex items-center gap-1.5 rounded-full bg-[#1c1917] py-1 pl-1 pr-2"
```
replace with:
```tsx
      className="inline-flex items-center gap-1.5 rounded-full bg-[#0c1830] py-1 pl-1 pr-2"
```

- [ ] **Step 2: Recolor `PlayerStatsCard.tsx`'s 3 stat tiles**

Find (3 occurrences — the Rating, Form, and Threat Level tiles):
```tsx
          <rect x="18" y="114" width="118" height="60" rx="8" fill="#1c1917" stroke="#3f3f46" />
```
replace with:
```tsx
          <rect x="18" y="114" width="118" height="60" rx="8" fill="#0c1830" stroke="#3f3f46" />
```

Find:
```tsx
          <rect x="144" y="114" width="118" height="60" rx="8" fill="#1c1917" stroke="#3f3f46" />
```
replace with:
```tsx
          <rect x="144" y="114" width="118" height="60" rx="8" fill="#0c1830" stroke="#3f3f46" />
```

Find:
```tsx
          <rect x="270" y="114" width="118" height="60" rx="8" fill="#1c1917" stroke="#3f3f46" />
```
replace with:
```tsx
          <rect x="270" y="114" width="118" height="60" rx="8" fill="#0c1830" stroke="#3f3f46" />
```

- [ ] **Step 3: Confirm no other `#1c1917` references remain in either file**

```bash
cd apps/organizer-web && grep -rn "1c1917" app/components/ThreatBadge.tsx app/components/PlayerStatsCard.tsx
```
Expected: no output (all 5 occurrences replaced).

- [ ] **Step 4: Run tsc and the test suite**

```bash
cd apps/organizer-web && npx tsc --noEmit && npx vitest run
```
Expected: no type errors, 431/431 tests passing.

- [ ] **Step 5: Visual verification**

`preview_start` (`{name: "organizer-web"}`), sign in, navigate to a person's profile page (`/people/<id>`) with a computed win percentage (so `ThreatBadge` renders) and a rendered `PlayerStatsCard`. Screenshot the profile header (avatar + name + ThreatBadge) and the Player Stats Card section together. Confirm both now use the same navy tone — no warm near-black visible anywhere on the page. Also check a roster or teams page row using `ThreatBadge size="compact"` to confirm the smaller badge recolored too.

- [ ] **Step 6: Commit**

```bash
git add apps/organizer-web/app/components/ThreatBadge.tsx apps/organizer-web/app/components/PlayerStatsCard.tsx
git commit -m "fix: resolve two-blacks inconsistency, recolor #1c1917 to navy-deep"
```

---

### Final: Push and confirm CI

- [ ] Run `npx tsc --noEmit && npx vitest run && npx next build` one more time from `apps/organizer-web` after all 6 tasks are committed, to catch any cross-task interaction (e.g. Task 4 and Task 5 both editing `OrganizerShell.tsx`'s prop list — confirm the final file has all 3 new props: `contextStrip`, `containerWidth`, existing `role`).
- [ ] `git push origin main` (only after the above passes).
- [ ] Poll GitHub Actions for the final pushed commit's conclusion before reporting done.
