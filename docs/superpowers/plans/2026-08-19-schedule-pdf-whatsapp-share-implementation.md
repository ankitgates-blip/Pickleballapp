# Schedule PDF + WhatsApp Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the organizer generate a PDF of a tournament's match schedule from the Bracket page and share it via the device share sheet, reusing the already-shipped `buildMatchGroups` pure functions and `pdfShare.ts` share/download utility.

**Architecture:** No new pure functions — `buildMatchGroups` (from the Results PDF feature) already produces exactly the schedule content needed. Add a new `ShareScheduleButton` Client Component that builds a schedule-only PDF body (title, metadata, match tables — no standings, no champion) and calls the shared `shareOrDownloadPdf`/`sanitizeFileNamePart` utilities. Wire it into the Bracket page, widening its tournament query for the PDF header fields.

**Tech Stack:** Next.js App Router (Server + Client Components), `jspdf`, `jspdf-autotable` (already dependencies), Vitest.

## Global Constraints

- PDF generation and the share/download logic run entirely client-side — no new server code, no new database columns.
- `jspdf`/`jspdf-autotable` are dynamically imported inside the click handler, never statically imported at module scope.
- Any `autoTable` call MUST use the named-function form `autoTable(doc, options)` — never `doc.autoTable(options)`, which is broken under this app's ESM/bundler import path (see the Results PDF feature's Critical fix, commit `7f364a3`). `doc.lastAutoTable.finalY` remains the correct (if untyped, requiring `@ts-expect-error`) way to read a table's end position after calling `autoTable`.
- `navigator.share` rejecting due to user cancellation (`AbortError`) is a silent no-op, not an error state.
- The Bracket page's Share Schedule button renders unconditionally — no gating on whether a schedule has been generated yet.
- Out of scope: Player Stats PDF, Leaderboard PDF (each a separate future increment), any change to `buildMatchGroups` or bracket generation logic, deduplicating the header-block-drawing code across the 3 PDF buttons.

---

### Task 1: `ShareScheduleButton` component

**Files:**
- Create: `apps/organizer-web/app/tournaments/[id]/bracket/ShareScheduleButton.tsx`

**Interfaces:**
- Consumes: `shareOrDownloadPdf`, `sanitizeFileNamePart` from `@/lib/pdf/pdfShare`; `ExportMatchGroup` type from `@/lib/tournament/resultsExport`; `jspdf` default export, `jspdf-autotable` default export — both dynamically imported inside the click handler.
- Produces: default-exported React component `ShareScheduleButton`, rendered by Task 2 with the props below.

- [ ] **Step 1: Create the component**

Create `apps/organizer-web/app/tournaments/[id]/bracket/ShareScheduleButton.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { outlineButtonClass } from '@/app/components/ui';
import { shareOrDownloadPdf, sanitizeFileNamePart } from '@/lib/pdf/pdfShare';
import type { ExportMatchGroup } from '@/lib/tournament/resultsExport';

type ShareScheduleButtonProps = {
  tournamentName: string;
  date: string;
  venueName: string;
  timeslotLabel: string;
  formatLabel: string;
  matchGroups: ExportMatchGroup[];
};

export default function ShareScheduleButton({
  tournamentName,
  date,
  venueName,
  timeslotLabel,
  formatLabel,
  matchGroups,
}: ShareScheduleButtonProps) {
  const [status, setStatus] = useState<'idle' | 'generating' | 'unsupported' | 'error'>('idle');

  const handleClick = async () => {
    setStatus('generating');
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);

      const doc = new jsPDF();
      let y = 16;

      doc.setFontSize(16);
      doc.text('PicklerAlly DXB', 14, y);
      y += 8;
      doc.setFontSize(13);
      doc.text(tournamentName, 14, y);
      y += 7;

      doc.setFontSize(10);
      doc.text([date, venueName, timeslotLabel, formatLabel].join(' · '), 14, y);
      y += 10;

      for (const group of matchGroups) {
        doc.setFontSize(11);
        doc.text(group.stageLabel, 14, y);
        y += 2;
        const body = group.matches.map((m) => [
          m.round !== null ? String(m.round) : '',
          m.teamAName,
          m.teamBName,
          m.scoreLabel,
        ]);
        autoTable(doc, { startY: y + 4, head: [['Round', 'Team A', 'Team B', 'Score']], body });
        // @ts-expect-error -- doc.lastAutoTable is set at runtime by jspdf-autotable, with no official type augmentation
        y = doc.lastAutoTable.finalY + 8;
      }

      const blob: Blob = doc.output('blob');
      const fileName = `${sanitizeFileNamePart(tournamentName)}-schedule.pdf`;
      const result = await shareOrDownloadPdf(blob, fileName, tournamentName);
      setStatus(result === 'downloaded' ? 'unsupported' : 'idle');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'generating'}
        className={outlineButtonClass}
      >
        {status === 'generating' ? 'Generating…' : '📤 Share Schedule'}
      </button>
      {status === 'unsupported' && (
        <p className="text-xs text-slate-500 mt-1.5">
          Downloaded — this browser doesn't support direct sharing. Attach the file to WhatsApp manually.
        </p>
      )}
      {status === 'error' && (
        <p className="text-xs text-red-600 mt-1.5">
          Something went wrong generating the PDF. Try again.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run the build to verify it compiles**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds. This component isn't wired into any page yet (Task 2 does that), so the build only confirms it type-checks and has no syntax errors — it's dead code until Task 2.

- [ ] **Step 3: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/ShareScheduleButton.tsx"
git commit -m "feat: add ShareScheduleButton component (schedule PDF generation + share/download)"
```

---

### Task 2: Wire `ShareScheduleButton` into the Bracket page

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`

**Interfaces:**
- Consumes: `buildMatchGroups` from `@/lib/tournament/resultsExport` (already shipped, Results PDF feature); `timeslotLabel` from `@/lib/tournament/timeslots`; default-exported `ShareScheduleButton` from `./ShareScheduleButton` (Task 1), with the exact prop names defined in Task 1's `ShareScheduleButtonProps`.

- [ ] **Step 1: Add the import statements**

In `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`, find:

```tsx
// apps/organizer-web/app/tournaments/[id]/bracket/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, accentButtonClass, linkClass, inputClass, primaryButtonClass } from '@/app/components/ui';
import { formatLabel } from '@/lib/tournament/formats';
import { computeStandings } from '@/lib/tournament/standings';
import type { MatchResult } from '@/lib/types';
import { generateBracket, generatePopcornBracket, advanceGauntletRound, advanceClaimTheThroneRound, advanceUpAndDownRiverRound, advanceLeaguePlayoffsRound, generateSemifinalMatches, generateFinalMatch } from './actions';
import { enterScore } from '../matches/actions';
```

Replace with:

```tsx
// apps/organizer-web/app/tournaments/[id]/bracket/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, accentButtonClass, linkClass, inputClass, primaryButtonClass } from '@/app/components/ui';
import { formatLabel } from '@/lib/tournament/formats';
import { timeslotLabel } from '@/lib/tournament/timeslots';
import { computeStandings } from '@/lib/tournament/standings';
import { buildMatchGroups } from '@/lib/tournament/resultsExport';
import type { MatchResult } from '@/lib/types';
import { generateBracket, generatePopcornBracket, advanceGauntletRound, advanceClaimTheThroneRound, advanceUpAndDownRiverRound, advanceLeaguePlayoffsRound, generateSemifinalMatches, generateFinalMatch } from './actions';
import { enterScore } from '../matches/actions';
import ShareScheduleButton from './ShareScheduleButton';
```

- [ ] **Step 2: Widen the tournament query**

Find:

```tsx
  const { data: tournament } = await supabase
    .from('tournaments')
    .select(
      'format, popcorn_rounds, gauntlet_rounds, claim_the_throne_rounds, up_and_down_the_river_rounds, league_playoffs_rounds'
    )
    .eq('id', id)
    .single();
```

Replace with:

```tsx
  const { data: tournament } = await supabase
    .from('tournaments')
    .select(
      'name, date, timeslot, format, popcorn_rounds, gauntlet_rounds, claim_the_throne_rounds, up_and_down_the_river_rounds, league_playoffs_rounds, venues(name)'
    )
    .eq('id', id)
    .single();
```

- [ ] **Step 3: Compute the venue name**

Find:

```tsx
  const isSupported =
    isRoundRobin ||
    isLeaguePlayoffs ||
    isDoubleHeader ||
    isPopcorn ||
    isGauntlet ||
    isClaimTheThrone ||
    isUpAndDownRiver;

  const { data: teams } = await supabase
```

Replace with:

```tsx
  const isSupported =
    isRoundRobin ||
    isLeaguePlayoffs ||
    isDoubleHeader ||
    isPopcorn ||
    isGauntlet ||
    isClaimTheThrone ||
    isUpAndDownRiver;

  const venue = tournament?.venues as { name: string } | { name: string }[] | null;
  const venueName = Array.isArray(venue) ? (venue[0]?.name ?? 'Pickle Turf') : (venue?.name ?? 'Pickle Turf');

  const { data: teams } = await supabase
```

- [ ] **Step 4: Compute `exportMatchGroups` right after the matches query**

Find:

```tsx
  const { data: matches } = await supabase
    .from('matches')
    .select('id, round, stage, team_a_id, team_b_id, score_a, score_b, status, court')
    .eq('tournament_id', id)
    .order('round', { ascending: true });

  const teamCount = (teams ?? []).length;
```

Replace with:

```tsx
  const { data: matches } = await supabase
    .from('matches')
    .select('id, round, stage, team_a_id, team_b_id, score_a, score_b, status, court')
    .eq('tournament_id', id)
    .order('round', { ascending: true });

  const exportMatchGroups = buildMatchGroups(
    (matches ?? []).map((m) => ({
      round: m.round,
      stage: m.stage,
      team_a_id: m.team_a_id,
      team_b_id: m.team_b_id,
      score_a: m.score_a,
      score_b: m.score_b,
      status: m.status,
    })),
    teamById,
    isLeaguePlayoffs
  );

  const teamCount = (teams ?? []).length;
```

- [ ] **Step 5: Render the button below the page header**

Find:

```tsx
      <TournamentNav tournamentId={id} current="bracket" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Bracket</h1>
        <span className="text-sm font-semibold text-teal-700 bg-teal-50 rounded-full px-3 py-1">
          {formatLabel(format)}
        </span>
      </div>

      {!isSupported && (
```

Replace with:

```tsx
      <TournamentNav tournamentId={id} current="bracket" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Bracket</h1>
        <span className="text-sm font-semibold text-teal-700 bg-teal-50 rounded-full px-3 py-1">
          {formatLabel(format)}
        </span>
      </div>

      <div className="mb-6">
        <ShareScheduleButton
          tournamentName={tournament?.name ?? ''}
          date={tournament?.date ?? ''}
          venueName={venueName}
          timeslotLabel={timeslotLabel(tournament?.timeslot ?? '')}
          formatLabel={formatLabel(format)}
          matchGroups={exportMatchGroups}
        />
        <p className="text-xs text-slate-400 mt-1.5">
          Opens your share sheet on mobile — downloads the file on desktop.
        </p>
      </div>

      {!isSupported && (
```

- [ ] **Step 6: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript errors — this confirms `ShareScheduleButtonProps`' field names match exactly what the page now passes, and that `exportMatchGroups` type-checks against `ExportMatchGroup[]`.

- [ ] **Step 7: Run the full test suite**

Run: `cd apps/organizer-web && npm test`
Expected: all tests still pass — this task adds no new pure-function logic (it's a Server Component composing existing, already-tested pieces), consistent with this codebase's convention that pages aren't unit-tested.

- [ ] **Step 8: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx"
git commit -m "feat: wire Share Schedule button into the Bracket page"
```

---

### Task 3: Push and verify CI + manual regression

**Files:** none (verification-only task).

- [ ] **Step 1: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 2: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 3: Manual regression**

No database migration is needed for this feature. On any tournament's Bracket page:

- Confirm a "📤 Share Schedule" button appears near the top, below the format label.
- On a tournament with a generated schedule (any format): click Share Schedule, confirm the PDF shows the tournament header/metadata and match tables — a single "Matches" table for Round Robin/Double Header/individual/ladder formats, separate League/Semifinal/Final tables for League + Playoffs — matching the same grouping the Results PDF already produces for the same data.
- Confirm round numbers only appear for League-stage rows (Semifinal/Final rows show a blank Round column), matching the Results PDF's established behavior.
- On a tournament with NO schedule generated yet: confirm Share Schedule still works and produces a PDF with just the header/metadata (no match tables) rather than crashing.
- Confirm on mobile the OS share sheet opens with WhatsApp selectable, and on desktop the file downloads directly.
- Confirm the existing "Generate Bracket" / "Generate Next Round" / semifinal / final controls on the Bracket page are all completely unaffected (this task is purely additive to the top of the page).

Clean up any disposable test tournament(s) used for this check afterward.
