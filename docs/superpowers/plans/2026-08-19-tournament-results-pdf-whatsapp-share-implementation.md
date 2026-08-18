# Tournament Results PDF + WhatsApp Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the organizer generate a PDF of a tournament's results (standings, champion, match results) from the Results page and share it via the device share sheet (WhatsApp or any other app), with a plain-download fallback where the share sheet isn't supported.

**Architecture:** Pure data-shaping functions (`lib/tournament/resultsExport.ts`) convert the Results page's already-computed standings/match data into flat, PDF-ready shapes. A new Client Component (`ShareResultsButton.tsx`) dynamically imports `jspdf` + `jspdf-autotable` on click, builds the PDF as a `Blob`, and either opens the OS share sheet via `navigator.share` or falls back to a plain download.

**Tech Stack:** Next.js App Router (Server + Client Components), `jspdf`, `jspdf-autotable`, Vitest.

## Global Constraints

- PDF generation and the share/download logic run entirely client-side — no new server code, no new database columns, no persisted PDF files.
- `jspdf`/`jspdf-autotable` are dynamically imported inside the click handler, never statically imported at module scope, so they never enter the Results page's initial bundle.
- The Share Results button renders unconditionally on the Results page (any tournament, completed or not) — no gating on `completed_at`.
- `navigator.share` rejecting due to user cancellation (`AbortError`) is a silent no-op, not an error state.
- Out of scope: roster/schedule-only/player-stats/leaderboard PDFs, WhatsApp Business API, server-side PDF generation or storage, PDF branding beyond the fixed header.

---

### Task 1: Add PDF dependencies

**Files:**
- Modify: `apps/organizer-web/package.json`

**Interfaces:**
- Produces: `jspdf` and `jspdf-autotable` importable from `apps/organizer-web` (used by Task 3).

- [ ] **Step 1: Install the dependencies**

Run:

```bash
cd apps/organizer-web && npm install jspdf@^3 jspdf-autotable@^5
```

Expected: `package.json`'s `dependencies` gains `"jspdf"` and `"jspdf-autotable"` entries, `package-lock.json` updates accordingly.

- [ ] **Step 2: Verify the project still builds**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no errors (new dependencies present but unused so far).

- [ ] **Step 3: Commit**

```bash
git add apps/organizer-web/package.json apps/organizer-web/package-lock.json
git commit -m "chore: add jspdf and jspdf-autotable dependencies"
```

---

### Task 2: Pure data-shaping functions for the results export

**Files:**
- Create: `apps/organizer-web/lib/tournament/resultsExport.ts`
- Test: `apps/organizer-web/lib/tournament/resultsExport.test.ts`

**Interfaces:**
- Produces (consumed by Task 3's `ShareResultsButton` props and Task 4's Results page wiring):
  ```typescript
  export type ExportStandingsRow = {
    rank: number;
    name: string;
    primaryStat: string;
    wins: number;
    losses: number;
    diffLabel: string;
  };

  export type ExportMatch = {
    round: number | null;
    teamAName: string;
    teamBName: string;
    scoreLabel: string;
  };

  export type ExportMatchGroup = {
    stageLabel: string;
    matches: ExportMatch[];
  };

  export function buildTeamStandingsRows(
    standings: { teamId: string; wins: number; losses: number; pointsFor: number; pointsAgainst: number }[],
    nameById: Map<string, string>
  ): ExportStandingsRow[];

  export function buildIndividualStandingsRows(
    standings: { playerId: string; wins: number; losses: number; pointsFor: number; pointsAgainst: number }[],
    nameById: Map<string, string>
  ): ExportStandingsRow[];

  export function buildLadderStandingsRows(
    standings: { playerId: string; ladderPoints: number; wins: number; losses: number; pointsFor: number; pointsAgainst: number }[],
    nameById: Map<string, string>
  ): ExportStandingsRow[];

  export type ExportRawMatch = {
    round: number;
    stage: string;
    team_a_id: string | null;
    team_b_id: string | null;
    score_a: number | null;
    score_b: number | null;
    status: string;
  };

  export function buildMatchGroups(
    matches: ExportRawMatch[],
    teamById: Map<string, string>,
    isLeaguePlayoffs: boolean
  ): ExportMatchGroup[];

  export function sanitizeFileNamePart(name: string): string;
  ```

- [ ] **Step 1: Write the failing tests**

Create `apps/organizer-web/lib/tournament/resultsExport.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  buildTeamStandingsRows,
  buildIndividualStandingsRows,
  buildLadderStandingsRows,
  buildMatchGroups,
  sanitizeFileNamePart,
} from './resultsExport';

describe('buildTeamStandingsRows', () => {
  it('maps team standings to export rows with 1-based rank and a signed diff label', () => {
    const nameById = new Map([
      ['t1', 'Alice / Bob'],
      ['t2', 'Carol / Dave'],
    ]);
    const result = buildTeamStandingsRows(
      [
        { teamId: 't1', wins: 3, losses: 0, pointsFor: 33, pointsAgainst: 10 },
        { teamId: 't2', wins: 0, losses: 3, pointsFor: 10, pointsAgainst: 33 },
      ],
      nameById
    );
    expect(result).toEqual([
      { rank: 1, name: 'Alice / Bob', primaryStat: '', wins: 3, losses: 0, diffLabel: '+23' },
      { rank: 2, name: 'Carol / Dave', primaryStat: '', wins: 0, losses: 3, diffLabel: '-23' },
    ]);
  });

  it('falls back to "Unknown" when a team id is missing from nameById', () => {
    const result = buildTeamStandingsRows(
      [{ teamId: 'ghost', wins: 1, losses: 0, pointsFor: 11, pointsAgainst: 5 }],
      new Map()
    );
    expect(result[0].name).toBe('Unknown');
  });
});

describe('buildIndividualStandingsRows', () => {
  it('maps individual standings to export rows with an empty primaryStat', () => {
    const nameById = new Map([['p1', 'Alice']]);
    const result = buildIndividualStandingsRows(
      [{ playerId: 'p1', wins: 2, losses: 1, pointsFor: 30, pointsAgainst: 20 }],
      nameById
    );
    expect(result).toEqual([
      { rank: 1, name: 'Alice', primaryStat: '', wins: 2, losses: 1, diffLabel: '+10' },
    ]);
  });
});

describe('buildLadderStandingsRows', () => {
  it('maps ladder standings to export rows with ladderPoints as primaryStat and an averaged diff label', () => {
    const nameById = new Map([['p1', 'Alice']]);
    const result = buildLadderStandingsRows(
      [{ playerId: 'p1', ladderPoints: 7, wins: 2, losses: 1, pointsFor: 33, pointsAgainst: 24 }],
      nameById
    );
    expect(result).toEqual([
      { rank: 1, name: 'Alice', primaryStat: '7', wins: 2, losses: 1, diffLabel: '+3.0' },
    ]);
  });

  it('produces a diffLabel of "+0.0" when no games have been played', () => {
    const nameById = new Map([['p1', 'Alice']]);
    const result = buildLadderStandingsRows(
      [{ playerId: 'p1', ladderPoints: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }],
      nameById
    );
    expect(result[0].diffLabel).toBe('+0.0');
  });
});

describe('buildMatchGroups', () => {
  const teamById = new Map([
    ['t1', 'Alice / Bob'],
    ['t2', 'Carol / Dave'],
  ]);

  it('groups all matches under a single "Matches" group for non-league_playoffs formats, with round only shown for league-stage matches', () => {
    const result = buildMatchGroups(
      [
        { round: 1, stage: 'league', team_a_id: 't1', team_b_id: 't2', score_a: 11, score_b: 7, status: 'complete' },
      ],
      teamById,
      false
    );
    expect(result).toEqual([
      {
        stageLabel: 'Matches',
        matches: [{ round: 1, teamAName: 'Alice / Bob', teamBName: 'Carol / Dave', scoreLabel: '11-7' }],
      },
    ]);
  });

  it('returns an empty array for non-league_playoffs formats with no playable matches', () => {
    const result = buildMatchGroups([], teamById, false);
    expect(result).toEqual([]);
  });

  it('splits league_playoffs matches into separate League/Semifinal/Final groups, omitting empty stages, with round null outside league stage', () => {
    const result = buildMatchGroups(
      [
        { round: 1, stage: 'league', team_a_id: 't1', team_b_id: 't2', score_a: 11, score_b: 7, status: 'complete' },
        { round: 1, stage: 'final', team_a_id: 't1', team_b_id: 't2', score_a: null, score_b: null, status: 'pending' },
      ],
      teamById,
      true
    );
    expect(result).toEqual([
      {
        stageLabel: 'League',
        matches: [{ round: 1, teamAName: 'Alice / Bob', teamBName: 'Carol / Dave', scoreLabel: '11-7' }],
      },
      {
        stageLabel: 'Final',
        matches: [{ round: null, teamAName: 'Alice / Bob', teamBName: 'Carol / Dave', scoreLabel: 'Not yet played' }],
      },
    ]);
  });

  it('excludes bye matches (team_b_id null)', () => {
    const result = buildMatchGroups(
      [{ round: 1, stage: 'league', team_a_id: 't1', team_b_id: null, score_a: null, score_b: null, status: 'pending' }],
      teamById,
      false
    );
    expect(result).toEqual([]);
  });
});

describe('sanitizeFileNamePart', () => {
  it('replaces whitespace with hyphens and strips non-alphanumeric characters', () => {
    expect(sanitizeFileNamePart("Sunday Smash 8/16 (Pickle Turf)")).toBe('Sunday-Smash-816-Pickle-Turf');
  });

  it('falls back to "tournament" for an empty or all-punctuation input', () => {
    expect(sanitizeFileNamePart('   ')).toBe('tournament');
    expect(sanitizeFileNamePart('!!!')).toBe('tournament');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/organizer-web && npx vitest run lib/tournament/resultsExport.test.ts`
Expected: FAIL — `resultsExport.ts` does not exist yet (`Cannot find module './resultsExport'`).

- [ ] **Step 3: Implement `resultsExport.ts`**

Create `apps/organizer-web/lib/tournament/resultsExport.ts`:

```typescript
export type ExportStandingsRow = {
  rank: number;
  name: string;
  primaryStat: string;
  wins: number;
  losses: number;
  diffLabel: string;
};

function diffLabel(diff: number): string {
  return `${diff > 0 ? '+' : ''}${diff}`;
}

export function buildTeamStandingsRows(
  standings: { teamId: string; wins: number; losses: number; pointsFor: number; pointsAgainst: number }[],
  nameById: Map<string, string>
): ExportStandingsRow[] {
  return standings.map((s, i) => ({
    rank: i + 1,
    name: nameById.get(s.teamId) ?? 'Unknown',
    primaryStat: '',
    wins: s.wins,
    losses: s.losses,
    diffLabel: diffLabel(s.pointsFor - s.pointsAgainst),
  }));
}

export function buildIndividualStandingsRows(
  standings: { playerId: string; wins: number; losses: number; pointsFor: number; pointsAgainst: number }[],
  nameById: Map<string, string>
): ExportStandingsRow[] {
  return standings.map((s, i) => ({
    rank: i + 1,
    name: nameById.get(s.playerId) ?? 'Unknown',
    primaryStat: '',
    wins: s.wins,
    losses: s.losses,
    diffLabel: diffLabel(s.pointsFor - s.pointsAgainst),
  }));
}

export function buildLadderStandingsRows(
  standings: {
    playerId: string;
    ladderPoints: number;
    wins: number;
    losses: number;
    pointsFor: number;
    pointsAgainst: number;
  }[],
  nameById: Map<string, string>
): ExportStandingsRow[] {
  return standings.map((s, i) => {
    const games = s.wins + s.losses;
    const avgDiff = games > 0 ? (s.pointsFor - s.pointsAgainst) / games : 0;
    return {
      rank: i + 1,
      name: nameById.get(s.playerId) ?? 'Unknown',
      primaryStat: String(s.ladderPoints),
      wins: s.wins,
      losses: s.losses,
      diffLabel: `${avgDiff > 0 ? '+' : ''}${avgDiff.toFixed(1)}`,
    };
  });
}

export type ExportRawMatch = {
  round: number;
  stage: string;
  team_a_id: string | null;
  team_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  status: string;
};

export type ExportMatch = {
  round: number | null;
  teamAName: string;
  teamBName: string;
  scoreLabel: string;
};

export type ExportMatchGroup = {
  stageLabel: string;
  matches: ExportMatch[];
};

const STAGE_LABELS: Record<string, string> = {
  league: 'League',
  semifinal: 'Semifinal',
  final: 'Final',
};

function toExportMatch(m: ExportRawMatch, teamById: Map<string, string>): ExportMatch {
  return {
    round: m.stage === 'league' ? m.round : null,
    teamAName: (m.team_a_id && teamById.get(m.team_a_id)) ?? 'Unknown',
    teamBName: (m.team_b_id && teamById.get(m.team_b_id)) ?? 'Unknown',
    scoreLabel: m.status === 'complete' ? `${m.score_a}-${m.score_b}` : 'Not yet played',
  };
}

export function buildMatchGroups(
  matches: ExportRawMatch[],
  teamById: Map<string, string>,
  isLeaguePlayoffs: boolean
): ExportMatchGroup[] {
  const playable = matches.filter((m) => m.team_b_id !== null);

  if (!isLeaguePlayoffs) {
    return playable.length > 0
      ? [{ stageLabel: 'Matches', matches: playable.map((m) => toExportMatch(m, teamById)) }]
      : [];
  }

  const groups: ExportMatchGroup[] = [];
  for (const stage of ['league', 'semifinal', 'final'] as const) {
    const stageMatches = playable.filter((m) => m.stage === stage);
    if (stageMatches.length > 0) {
      groups.push({
        stageLabel: STAGE_LABELS[stage],
        matches: stageMatches.map((m) => toExportMatch(m, teamById)),
      });
    }
  }
  return groups;
}

export function sanitizeFileNamePart(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  return cleaned || 'tournament';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/organizer-web && npx vitest run lib/tournament/resultsExport.test.ts`
Expected: PASS, 11/11 tests.

- [ ] **Step 5: Run the full suite**

Run: `cd apps/organizer-web && npm test`
Expected: all tests pass (previous count + 11 new).

- [ ] **Step 6: Commit**

```bash
git add apps/organizer-web/lib/tournament/resultsExport.ts apps/organizer-web/lib/tournament/resultsExport.test.ts
git commit -m "feat: add pure data-shaping functions for results PDF export"
```

---

### Task 3: `ShareResultsButton` component

**Files:**
- Create: `apps/organizer-web/app/tournaments/[id]/results/ShareResultsButton.tsx`

**Interfaces:**
- Consumes: `ExportStandingsRow`, `ExportMatchGroup`, `sanitizeFileNamePart` from `@/lib/tournament/resultsExport` (Task 2). `jspdf` default export, `jspdf-autotable` default export (Task 1's dependencies) — both dynamically imported inside the click handler.
- Produces: default-exported React component `ShareResultsButton`, rendered by Task 4 with the props below.

- [ ] **Step 1: Create the component**

Create `apps/organizer-web/app/tournaments/[id]/results/ShareResultsButton.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { outlineButtonClass } from '@/app/components/ui';
import { sanitizeFileNamePart, type ExportStandingsRow, type ExportMatchGroup } from '@/lib/tournament/resultsExport';

type ShareResultsButtonProps = {
  tournamentName: string;
  date: string;
  venueName: string;
  timeslotLabel: string;
  formatLabel: string;
  completedAt: string | null;
  championName: string | undefined;
  standingsTitle: string;
  standingsRows: ExportStandingsRow[];
  matchGroups: ExportMatchGroup[];
};

export default function ShareResultsButton({
  tournamentName,
  date,
  venueName,
  timeslotLabel,
  formatLabel,
  completedAt,
  championName,
  standingsTitle,
  standingsRows,
  matchGroups,
}: ShareResultsButtonProps) {
  const [status, setStatus] = useState<'idle' | 'generating' | 'unsupported'>('idle');

  const handleClick = async () => {
    setStatus('generating');
    try {
      const [{ default: jsPDF }] = await Promise.all([
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
      const metaParts = [date, venueName, timeslotLabel, formatLabel];
      if (completedAt) metaParts.push(`Completed ${new Date(completedAt).toLocaleDateString()}`);
      doc.text(metaParts.join(' · '), 14, y);
      y += 8;

      if (championName) {
        doc.setFontSize(12);
        doc.text(`Champion: ${championName}`, 14, y);
        y += 8;
      }

      const hasPrimaryStat = standingsRows.some((r) => r.primaryStat !== '');
      const standingsHead = hasPrimaryStat
        ? [['#', standingsTitle, 'Pts', 'W', 'L', 'Diff']]
        : [['#', standingsTitle, 'W', 'L', 'Diff']];
      const standingsBody = standingsRows.map((r) =>
        hasPrimaryStat
          ? [String(r.rank), r.name, r.primaryStat, String(r.wins), String(r.losses), r.diffLabel]
          : [String(r.rank), r.name, String(r.wins), String(r.losses), r.diffLabel]
      );

      // @ts-expect-error -- autoTable attaches itself to the jsPDF instance as a side effect of the import above
      doc.autoTable({ startY: y, head: standingsHead, body: standingsBody });
      // @ts-expect-error -- autoTable augments jsPDF's instance type with lastAutoTable at runtime
      y = doc.lastAutoTable.finalY + 8;

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
        // @ts-expect-error -- see above
        doc.autoTable({ startY: y + 4, head: [['Round', 'Team A', 'Team B', 'Score']], body });
        // @ts-expect-error -- see above
        y = doc.lastAutoTable.finalY + 8;
      }

      const blob: Blob = doc.output('blob');
      const fileName = `${sanitizeFileNamePart(tournamentName)}-results.pdf`;
      const file = new File([blob], fileName, { type: 'application/pdf' });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: tournamentName });
        } catch (err) {
          if (!(err instanceof Error) || err.name !== 'AbortError') throw err;
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        setStatus('unsupported');
        return;
      }

      setStatus('idle');
    } catch {
      setStatus('idle');
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
        {status === 'generating' ? 'Generating…' : '📤 Share Results'}
      </button>
      {status === 'unsupported' && (
        <p className="text-xs text-slate-500 mt-1.5">
          Downloaded — this browser doesn't support direct sharing. Attach the file to WhatsApp manually.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run the build to verify it compiles**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds. This component isn't wired into any page yet (Task 4 does that), so the build only confirms it type-checks and has no syntax errors — it's dead code until Task 4.

- [ ] **Step 3: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/results/ShareResultsButton.tsx"
git commit -m "feat: add ShareResultsButton component (PDF generation + share/download)"
```

---

### Task 4: Wire `ShareResultsButton` into the Results page

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/results/page.tsx`

**Interfaces:**
- Consumes: `buildTeamStandingsRows`, `buildIndividualStandingsRows`, `buildLadderStandingsRows`, `buildMatchGroups` from `@/lib/tournament/resultsExport` (Task 2); default-exported `ShareResultsButton` from `./ShareResultsButton` (Task 3), with the exact prop names defined in Task 3's `ShareResultsButtonProps`.

- [ ] **Step 1: Add the import statements**

In `apps/organizer-web/app/tournaments/[id]/results/page.tsx`, find:

```tsx
import { computeTournamentChampionName } from '@/lib/tournament/champion';
import type { ClaimTheThroneRoundResult, MatchResult, Team } from '@/lib/types';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass } from '@/app/components/ui';
```

Replace with:

```tsx
import { computeTournamentChampionName } from '@/lib/tournament/champion';
import {
  buildTeamStandingsRows,
  buildIndividualStandingsRows,
  buildLadderStandingsRows,
  buildMatchGroups,
} from '@/lib/tournament/resultsExport';
import type { ClaimTheThroneRoundResult, MatchResult, Team } from '@/lib/types';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass } from '@/app/components/ui';
import ShareResultsButton from './ShareResultsButton';
```

- [ ] **Step 2: Compute the export props after `championName` is derived**

Find:

```tsx
  const championName = computeTournamentChampionName({
    format: tournament.format,
    completedAt: tournament.completed_at,
    matches: (matches ?? []).map((m) => ({
      stage: m.stage,
      team_a_id: m.team_a_id,
      team_b_id: m.team_b_id,
      score_a: m.score_a,
      score_b: m.score_b,
      status: m.status,
      round: m.round,
      court: m.court,
    })),
    teams: (teams ?? []).map((t) => ({
      id: t.id,
      player_1_id: t.player_1_id,
      player_2_id: t.player_2_id,
    })),
    players: (players ?? []).map((p) => ({ id: p.id, name: p.name })),
  });
```

Replace with:

```tsx
  const championName = computeTournamentChampionName({
    format: tournament.format,
    completedAt: tournament.completed_at,
    matches: (matches ?? []).map((m) => ({
      stage: m.stage,
      team_a_id: m.team_a_id,
      team_b_id: m.team_b_id,
      score_a: m.score_a,
      score_b: m.score_b,
      status: m.status,
      round: m.round,
      court: m.court,
    })),
    teams: (teams ?? []).map((t) => ({
      id: t.id,
      player_1_id: t.player_1_id,
      player_2_id: t.player_2_id,
    })),
    players: (players ?? []).map((p) => ({ id: p.id, name: p.name })),
  });

  const standingsTitle = isLadderFormat
    ? 'Ladder Standings'
    : isIndividualFormat
      ? 'Individual Standings'
      : isLeaguePlayoffs
        ? 'League Standings'
        : 'Final Standings';

  const exportStandingsRows = isLadderFormat
    ? buildLadderStandingsRows(ladderStandings, playerById)
    : isIndividualFormat
      ? buildIndividualStandingsRows(individualStandings, playerById)
      : buildTeamStandingsRows(standings, teamById);

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
```

- [ ] **Step 3: Render the button and reuse `standingsTitle` for the on-page heading**

Find:

```tsx
      {championName && (
        <div
          className={`${cardClass} mb-6 text-center bg-gradient-to-br from-amber-50 to-lime-50 border-amber-200`}
        >
          <div className="text-3xl mb-1">🏆</div>
          <div className="text-xs font-bold text-amber-700 uppercase tracking-wide">Champion</div>
          <div className="text-xl font-extrabold text-slate-900">{championName}</div>
        </div>
      )}
```

Replace with:

```tsx
      <div className="mb-6">
        <ShareResultsButton
          tournamentName={tournament.name}
          date={tournament.date}
          venueName={venueName}
          timeslotLabel={timeslotLabel(tournament.timeslot)}
          formatLabel={formatLabel(tournament.format)}
          completedAt={tournament.completed_at}
          championName={championName}
          standingsTitle={standingsTitle}
          standingsRows={exportStandingsRows}
          matchGroups={exportMatchGroups}
        />
        <p className="text-xs text-slate-400 mt-1.5">
          Opens your share sheet on mobile — downloads the file on desktop.
        </p>
      </div>

      {championName && (
        <div
          className={`${cardClass} mb-6 text-center bg-gradient-to-br from-amber-50 to-lime-50 border-amber-200`}
        >
          <div className="text-3xl mb-1">🏆</div>
          <div className="text-xs font-bold text-amber-700 uppercase tracking-wide">Champion</div>
          <div className="text-xl font-extrabold text-slate-900">{championName}</div>
        </div>
      )}
```

- [ ] **Step 4: Reuse `standingsTitle` in place of the existing inline heading expression**

Find:

```tsx
        <h2 className="text-lg font-bold text-slate-900 mb-3">
          {isLadderFormat
            ? 'Ladder Standings'
            : isIndividualFormat
              ? 'Individual Standings'
              : isLeaguePlayoffs
                ? 'League Standings'
                : 'Final Standings'}
        </h2>
```

Replace with:

```tsx
        <h2 className="text-lg font-bold text-slate-900 mb-3">{standingsTitle}</h2>
```

- [ ] **Step 5: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript errors — this confirms `ShareResultsButtonProps`' field names match exactly what the page now passes, and that `exportStandingsRows`/`exportMatchGroups` type-check against `ExportStandingsRow[]`/`ExportMatchGroup[]`.

- [ ] **Step 6: Run the full test suite**

Run: `cd apps/organizer-web && npm test`
Expected: all tests still pass — this task adds no new pure-function logic (it's a Server Component composing existing pieces), consistent with this codebase's convention that pages aren't unit-tested.

- [ ] **Step 7: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/results/page.tsx"
git commit -m "feat: wire Share Results button into the Results page"
```

---

### Task 5: Push and verify CI + manual regression

**Files:** none (verification-only task).

- [ ] **Step 1: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 2: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 3: Manual regression**

No database migration is needed for this feature. On any tournament's Results page:

- Confirm a "📤 Share Results" button appears near the top, above the champion banner (if any).
- On a mobile device or mobile browser emulation: click it, confirm the button shows "Generating…" briefly, then the OS share sheet opens with a PDF file attached; confirm WhatsApp is a selectable target and the PDF opens correctly showing the tournament name, metadata, champion (if completed), standings table, and match results grouped correctly (single "Matches" group for Round Robin/Double Header/individual/ladder formats; separate League/Semifinal/Final groups for League + Playoffs).
- On a desktop browser: click it, confirm the PDF downloads directly (no share sheet) and the note about downloading instead of sharing appears.
- Confirm a League + Playoffs tournament's PDF groups matches into League/Semifinal/Final sections matching the on-page grouping, and that round numbers only appear for League-stage rows (Semifinal/Final rows show a blank Round column, matching the on-page display).
- Confirm an incomplete tournament (no `completed_at`) still shows the Share Results button and produces a PDF with no Champion line.
- Confirm the on-page "Final Standings" / "League Standings" / "Individual Standings" / "Ladder Standings" heading text is unchanged from before this change (now driven by `standingsTitle` instead of the inline conditional).

Clean up any disposable test tournament(s) used for this check afterward.
