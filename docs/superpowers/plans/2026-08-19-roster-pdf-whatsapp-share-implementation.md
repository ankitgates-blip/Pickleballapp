# Roster PDF + WhatsApp Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the organizer generate a PDF of a tournament's roster (player list, and team pairings for team-based formats) from the Roster page and share it via the device share sheet, reusing and de-duplicating the share/download mechanism the Results PDF feature already shipped.

**Architecture:** Extract the Results PDF feature's inline share-vs-download logic into a shared `lib/pdf/pdfShare.ts` utility (retrofitting `ShareResultsButton` to use it, no behavior change). Add pure data-shaping functions (`lib/tournament/rosterExport.ts`) and a new `ShareRosterButton` Client Component that builds a roster-specific PDF body and calls the shared utility for the share/download tail.

**Tech Stack:** Next.js App Router (Server + Client Components), `jspdf`, `jspdf-autotable` (both already dependencies as of the Results PDF feature), Vitest.

## Global Constraints

- PDF generation and the share/download logic run entirely client-side — no new server code, no new database columns.
- `jspdf`/`jspdf-autotable` are dynamically imported inside the click handler, never statically imported at module scope.
- Any `autoTable` call MUST use the named-function form `autoTable(doc, options)` — never `doc.autoTable(options)`, which is broken under this app's ESM/bundler import path (see the Results PDF feature's Critical fix, commit `7f364a3`). `doc.lastAutoTable.finalY` remains the correct (if untyped, requiring `@ts-expect-error`) way to read a table's end position after calling `autoTable`.
- `navigator.share` rejecting due to user cancellation (`AbortError`) is a silent no-op, not an error state.
- The Roster page's Share Roster button renders unconditionally — no gating on player/team count or `completed_at`.
- Out of scope: Schedule-only PDF, Player Stats PDF, Leaderboard PDF (each a separate future increment), any change to the Teams page itself, editing roster/teams from the PDF.

---

### Task 1: Extract shared PDF share/download utilities

**Files:**
- Create: `apps/organizer-web/lib/pdf/pdfShare.ts`
- Test: `apps/organizer-web/lib/pdf/pdfShare.test.ts`
- Modify: `apps/organizer-web/app/tournaments/[id]/results/ShareResultsButton.tsx`
- Modify: `apps/organizer-web/lib/tournament/resultsExport.ts`
- Modify: `apps/organizer-web/lib/tournament/resultsExport.test.ts`

**Interfaces:**
- Produces (consumed by Task 3's `ShareRosterButton` and this task's retrofitted `ShareResultsButton`):
  ```typescript
  export type ShareOrDownloadResult = 'shared' | 'downloaded' | 'cancelled';

  export async function shareOrDownloadPdf(
    blob: Blob,
    fileName: string,
    title: string
  ): Promise<ShareOrDownloadResult>;

  export function sanitizeFileNamePart(name: string): string;
  ```

- [ ] **Step 1: Write the failing tests**

Create `apps/organizer-web/lib/pdf/pdfShare.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { shareOrDownloadPdf, sanitizeFileNamePart } from './pdfShare';

const blob = new Blob(['test'], { type: 'application/pdf' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shareOrDownloadPdf', () => {
  it('shares the file via navigator.share when canShare returns true, and returns "shared"', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: shareMock,
    });

    const result = await shareOrDownloadPdf(blob, 'test.pdf', 'Test Title');

    expect(result).toBe('shared');
    expect(shareMock).toHaveBeenCalledTimes(1);
    const callArg = shareMock.mock.calls[0][0];
    expect(callArg.title).toBe('Test Title');
    expect(callArg.files).toHaveLength(1);
    expect(callArg.files[0].name).toBe('test.pdf');
  });

  it('returns "cancelled" when navigator.share rejects with an AbortError', async () => {
    const abortError = new Error('cancelled');
    abortError.name = 'AbortError';
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: vi.fn().mockRejectedValue(abortError),
    });

    const result = await shareOrDownloadPdf(blob, 'test.pdf', 'Test Title');
    expect(result).toBe('cancelled');
  });

  it('re-throws non-AbortError errors from navigator.share', async () => {
    const realError = new Error('permission denied');
    realError.name = 'NotAllowedError';
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: vi.fn().mockRejectedValue(realError),
    });

    await expect(shareOrDownloadPdf(blob, 'test.pdf', 'Test Title')).rejects.toThrow('permission denied');
  });

  it('falls back to a download when canShare is absent, and returns "downloaded"', async () => {
    vi.stubGlobal('navigator', {});
    const clickMock = vi.fn();
    const anchorStub = { href: '', download: '', click: clickMock };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchorStub),
    });
    const createObjectURLMock = vi.fn(() => 'blob:mock-url');
    const revokeObjectURLMock = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    });

    const result = await shareOrDownloadPdf(blob, 'test.pdf', 'Test Title');

    expect(result).toBe('downloaded');
    expect(createObjectURLMock).toHaveBeenCalledWith(blob);
    expect(anchorStub.href).toBe('blob:mock-url');
    expect(anchorStub.download).toBe('test.pdf');
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
  });

  it('falls back to a download when canShare returns false', async () => {
    vi.stubGlobal('navigator', { canShare: () => false });
    const clickMock = vi.fn();
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ href: '', download: '', click: clickMock })),
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });

    const result = await shareOrDownloadPdf(blob, 'test.pdf', 'Test Title');
    expect(result).toBe('downloaded');
    expect(clickMock).toHaveBeenCalledTimes(1);
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

Run: `cd apps/organizer-web && npx vitest run lib/pdf/pdfShare.test.ts`
Expected: FAIL — `pdfShare.ts` does not exist yet (`Cannot find module './pdfShare'`).

- [ ] **Step 3: Implement `pdfShare.ts`**

Create `apps/organizer-web/lib/pdf/pdfShare.ts`:

```typescript
export type ShareOrDownloadResult = 'shared' | 'downloaded' | 'cancelled';

export async function shareOrDownloadPdf(
  blob: Blob,
  fileName: string,
  title: string
): Promise<ShareOrDownloadResult> {
  const file = new File([blob], fileName, { type: 'application/pdf' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return 'cancelled';
      }
      throw err;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}

export function sanitizeFileNamePart(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  return cleaned || 'tournament';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/organizer-web && npx vitest run lib/pdf/pdfShare.test.ts`
Expected: PASS, 7/7 tests.

- [ ] **Step 5: Retrofit `ShareResultsButton.tsx` to use the shared utility**

In `apps/organizer-web/app/tournaments/[id]/results/ShareResultsButton.tsx`, find:

```tsx
import { useState } from 'react';
import { outlineButtonClass } from '@/app/components/ui';
import { sanitizeFileNamePart, type ExportStandingsRow, type ExportMatchGroup } from '@/lib/tournament/resultsExport';
```

Replace with:

```tsx
import { useState } from 'react';
import { outlineButtonClass } from '@/app/components/ui';
import { shareOrDownloadPdf, sanitizeFileNamePart } from '@/lib/pdf/pdfShare';
import type { ExportStandingsRow, ExportMatchGroup } from '@/lib/tournament/resultsExport';
```

Find:

```tsx
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
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };
```

Replace with:

```tsx
      const blob: Blob = doc.output('blob');
      const fileName = `${sanitizeFileNamePart(tournamentName)}-results.pdf`;
      const result = await shareOrDownloadPdf(blob, fileName, tournamentName);
      setStatus(result === 'downloaded' ? 'unsupported' : 'idle');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };
```

- [ ] **Step 6: Remove `sanitizeFileNamePart` from `resultsExport.ts` (now lives only in `pdfShare.ts`)**

In `apps/organizer-web/lib/tournament/resultsExport.ts`, find (at the end of the file):

```typescript
export function sanitizeFileNamePart(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  return cleaned || 'tournament';
}
```

Delete this block entirely (the file should now end with the closing `}` of `buildMatchGroups`).

- [ ] **Step 7: Remove the now-redundant `sanitizeFileNamePart` tests from `resultsExport.test.ts`**

In `apps/organizer-web/lib/tournament/resultsExport.test.ts`, find:

```typescript
import { describe, it, expect } from 'vitest';
import {
  buildTeamStandingsRows,
  buildIndividualStandingsRows,
  buildLadderStandingsRows,
  buildMatchGroups,
  sanitizeFileNamePart,
} from './resultsExport';
```

Replace with:

```typescript
import { describe, it, expect } from 'vitest';
import {
  buildTeamStandingsRows,
  buildIndividualStandingsRows,
  buildLadderStandingsRows,
  buildMatchGroups,
} from './resultsExport';
```

Find (at the end of the file):

```typescript

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

Delete this block entirely (the file should now end with the closing `});` of the `buildMatchGroups` describe block).

- [ ] **Step 8: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors. Test suite passes with the same total minus 2 (removed `sanitizeFileNamePart` tests from `resultsExport.test.ts`) plus 7 (new `pdfShare.test.ts`) — a net increase of 5 over the pre-task count.

- [ ] **Step 9: Commit**

```bash
git add apps/organizer-web/lib/pdf/pdfShare.ts apps/organizer-web/lib/pdf/pdfShare.test.ts "apps/organizer-web/app/tournaments/[id]/results/ShareResultsButton.tsx" apps/organizer-web/lib/tournament/resultsExport.ts apps/organizer-web/lib/tournament/resultsExport.test.ts
git commit -m "refactor: extract shared PDF share/download utility from ShareResultsButton"
```

---

### Task 2: Pure data-shaping functions for the roster export

**Files:**
- Create: `apps/organizer-web/lib/tournament/rosterExport.ts`
- Test: `apps/organizer-web/lib/tournament/rosterExport.test.ts`

**Interfaces:**
- Produces (consumed by Task 3's `ShareRosterButton` props and Task 4's Roster page wiring):
  ```typescript
  export type ExportRosterTeam = {
    player1Name: string;
    player2Name: string;
  };

  export function buildRosterTeams(
    teams: { player_1_id: string; player_2_id: string }[],
    playerById: Map<string, string>
  ): ExportRosterTeam[];

  export function buildUnpairedPlayerNames(
    players: { id: string; name: string }[],
    teams: { player_1_id: string; player_2_id: string }[]
  ): string[];
  ```

- [ ] **Step 1: Write the failing tests**

Create `apps/organizer-web/lib/tournament/rosterExport.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildRosterTeams, buildUnpairedPlayerNames } from './rosterExport';

describe('buildRosterTeams', () => {
  it("resolves each team's two player IDs to names", () => {
    const playerById = new Map([
      ['p1', 'Alice'],
      ['p2', 'Bob'],
      ['p3', 'Carol'],
      ['p4', 'Dave'],
    ]);
    const result = buildRosterTeams(
      [
        { player_1_id: 'p1', player_2_id: 'p2' },
        { player_1_id: 'p3', player_2_id: 'p4' },
      ],
      playerById
    );
    expect(result).toEqual([
      { player1Name: 'Alice', player2Name: 'Bob' },
      { player1Name: 'Carol', player2Name: 'Dave' },
    ]);
  });

  it('falls back to "Unknown" when a player id is missing from playerById', () => {
    const result = buildRosterTeams([{ player_1_id: 'ghost', player_2_id: 'p2' }], new Map());
    expect(result).toEqual([{ player1Name: 'Unknown', player2Name: 'Unknown' }]);
  });

  it('returns an empty array for no teams', () => {
    expect(buildRosterTeams([], new Map())).toEqual([]);
  });
});

describe('buildUnpairedPlayerNames', () => {
  it('returns names of players not present in any team', () => {
    const players = [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Carol' },
    ];
    const teams = [{ player_1_id: 'p1', player_2_id: 'p2' }];
    expect(buildUnpairedPlayerNames(players, teams)).toEqual(['Carol']);
  });

  it('returns all player names when there are no teams', () => {
    const players = [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ];
    expect(buildUnpairedPlayerNames(players, [])).toEqual(['Alice', 'Bob']);
  });

  it('returns an empty array when every player is paired', () => {
    const players = [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ];
    const teams = [{ player_1_id: 'p1', player_2_id: 'p2' }];
    expect(buildUnpairedPlayerNames(players, teams)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/organizer-web && npx vitest run lib/tournament/rosterExport.test.ts`
Expected: FAIL — `rosterExport.ts` does not exist yet.

- [ ] **Step 3: Implement `rosterExport.ts`**

Create `apps/organizer-web/lib/tournament/rosterExport.ts`:

```typescript
export type ExportRosterTeam = {
  player1Name: string;
  player2Name: string;
};

export function buildRosterTeams(
  teams: { player_1_id: string; player_2_id: string }[],
  playerById: Map<string, string>
): ExportRosterTeam[] {
  return teams.map((t) => ({
    player1Name: playerById.get(t.player_1_id) ?? 'Unknown',
    player2Name: playerById.get(t.player_2_id) ?? 'Unknown',
  }));
}

export function buildUnpairedPlayerNames(
  players: { id: string; name: string }[],
  teams: { player_1_id: string; player_2_id: string }[]
): string[] {
  const pairedIds = new Set(teams.flatMap((t) => [t.player_1_id, t.player_2_id]));
  return players.filter((p) => !pairedIds.has(p.id)).map((p) => p.name);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/organizer-web && npx vitest run lib/tournament/rosterExport.test.ts`
Expected: PASS, 6/6 tests.

- [ ] **Step 5: Run the full suite**

Run: `cd apps/organizer-web && npm test`
Expected: all tests pass (Task 1's count + 6 new).

- [ ] **Step 6: Commit**

```bash
git add apps/organizer-web/lib/tournament/rosterExport.ts apps/organizer-web/lib/tournament/rosterExport.test.ts
git commit -m "feat: add pure data-shaping functions for roster PDF export"
```

---

### Task 3: `ShareRosterButton` component

**Files:**
- Create: `apps/organizer-web/app/tournaments/[id]/roster/ShareRosterButton.tsx`

**Interfaces:**
- Consumes: `shareOrDownloadPdf`, `sanitizeFileNamePart` from `@/lib/pdf/pdfShare` (Task 1); `ExportRosterTeam` type from `@/lib/tournament/rosterExport` (Task 2); `jspdf` default export, `jspdf-autotable` default export — both dynamically imported inside the click handler.
- Produces: default-exported React component `ShareRosterButton`, rendered by Task 4 with the props below.

- [ ] **Step 1: Create the component**

Create `apps/organizer-web/app/tournaments/[id]/roster/ShareRosterButton.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { outlineButtonClass } from '@/app/components/ui';
import { shareOrDownloadPdf, sanitizeFileNamePart } from '@/lib/pdf/pdfShare';
import type { ExportRosterTeam } from '@/lib/tournament/rosterExport';

type ShareRosterButtonProps = {
  tournamentName: string;
  date: string;
  venueName: string;
  timeslotLabel: string;
  formatLabel: string;
  hasTeams: boolean;
  rosterTeams: ExportRosterTeam[];
  unpairedPlayerNames: string[];
  allPlayerNames: string[];
};

export default function ShareRosterButton({
  tournamentName,
  date,
  venueName,
  timeslotLabel,
  formatLabel,
  hasTeams,
  rosterTeams,
  unpairedPlayerNames,
  allPlayerNames,
}: ShareRosterButtonProps) {
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

      if (hasTeams) {
        doc.setFontSize(12);
        doc.text('Teams', 14, y);
        y += 2;
        const body = rosterTeams.map((t, i) => [String(i + 1), t.player1Name, t.player2Name]);
        autoTable(doc, { startY: y + 4, head: [['#', 'Player 1', 'Player 2']], body });
        // @ts-expect-error -- doc.lastAutoTable is set at runtime by jspdf-autotable, with no official type augmentation
        y = doc.lastAutoTable.finalY + 8;

        if (unpairedPlayerNames.length > 0) {
          doc.setFontSize(12);
          doc.text('Unpaired Players', 14, y);
          y += 2;
          autoTable(doc, {
            startY: y + 4,
            head: [['Player']],
            body: unpairedPlayerNames.map((name) => [name]),
          });
        }
      } else {
        doc.setFontSize(12);
        doc.text('Players', 14, y);
        y += 2;
        autoTable(doc, {
          startY: y + 4,
          head: [['Player']],
          body: allPlayerNames.map((name) => [name]),
        });
      }

      const blob: Blob = doc.output('blob');
      const fileName = `${sanitizeFileNamePart(tournamentName)}-roster.pdf`;
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
        {status === 'generating' ? 'Generating…' : '📤 Share Roster'}
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
Expected: build succeeds. This component isn't wired into any page yet (Task 4 does that), so the build only confirms it type-checks and has no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/roster/ShareRosterButton.tsx"
git commit -m "feat: add ShareRosterButton component (roster PDF generation + share/download)"
```

---

### Task 4: Wire `ShareRosterButton` into the Roster page

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/roster/page.tsx`

**Interfaces:**
- Consumes: `buildRosterTeams`, `buildUnpairedPlayerNames` from `@/lib/tournament/rosterExport` (Task 2); `isIndividualFormat`, `formatLabel` from `@/lib/tournament/formats`; `timeslotLabel` from `@/lib/tournament/timeslots`; default-exported `ShareRosterButton` from `./ShareRosterButton` (Task 3), with the exact prop names defined in Task 3's `ShareRosterButtonProps`.

- [ ] **Step 1: Add the import statements**

In `apps/organizer-web/app/tournaments/[id]/roster/page.tsx`, find:

```tsx
// apps/organizer-web/app/tournaments/[id]/roster/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, primaryButtonClass, accentButtonClass, pillClass, linkClass } from '@/app/components/ui';
import { matchNamesToPeople } from '@/lib/people/matchNames';
import { TIME_SLOTS } from '@/lib/tournament/timeslots';
import CopyLinkButton from '../standings/CopyLinkButton';
import {
  startAddPlayers,
  confirmAddPlayers,
  addExistingPeople,
  removePlayer,
  updateTournamentDetails,
} from './actions';
```

Replace with:

```tsx
// apps/organizer-web/app/tournaments/[id]/roster/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, primaryButtonClass, accentButtonClass, pillClass, linkClass } from '@/app/components/ui';
import { matchNamesToPeople } from '@/lib/people/matchNames';
import { TIME_SLOTS, timeslotLabel } from '@/lib/tournament/timeslots';
import { formatLabel, isIndividualFormat } from '@/lib/tournament/formats';
import { buildRosterTeams, buildUnpairedPlayerNames } from '@/lib/tournament/rosterExport';
import CopyLinkButton from '../standings/CopyLinkButton';
import ShareRosterButton from './ShareRosterButton';
import {
  startAddPlayers,
  confirmAddPlayers,
  addExistingPeople,
  removePlayer,
  updateTournamentDetails,
} from './actions';
```

- [ ] **Step 2: Widen the tournament query and add the teams query**

Find:

```tsx
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('completed_at, venue_id, timeslot')
    .eq('id', id)
    .single();

  const isCompleted = Boolean(tournament?.completed_at);

  const { data: venues } = await supabase.from('venues').select('id, name').order('name');

  const { data: players } = await supabase
    .from('players')
    .select('id, name, person_id')
    .eq('tournament_id', id)
    .order('created_at', { ascending: true });
```

Replace with:

```tsx
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, date, format, completed_at, venue_id, timeslot, venues(name)')
    .eq('id', id)
    .single();

  const isCompleted = Boolean(tournament?.completed_at);

  const venue = tournament?.venues as { name: string } | { name: string }[] | null;
  const venueName = Array.isArray(venue) ? (venue[0]?.name ?? 'Pickle Turf') : (venue?.name ?? 'Pickle Turf');

  const isIndividual = isIndividualFormat(tournament?.format ?? '');

  const { data: venues } = await supabase.from('venues').select('id, name').order('name');

  const { data: players } = await supabase
    .from('players')
    .select('id, name, person_id')
    .eq('tournament_id', id)
    .order('created_at', { ascending: true });

  const { data: teams } = !isIndividual
    ? await supabase.from('teams').select('player_1_id, player_2_id').eq('tournament_id', id)
    : { data: [] };
```

- [ ] **Step 3: Compute the export props**

Find:

```tsx
  const personIdsOnRoster = new Set(
    (players ?? []).map((p) => p.person_id).filter((personId): personId is string => Boolean(personId))
  );
  const availablePeople = (allPeople ?? []).filter((p) => !personIdsOnRoster.has(p.id));
```

Replace with:

```tsx
  const personIdsOnRoster = new Set(
    (players ?? []).map((p) => p.person_id).filter((personId): personId is string => Boolean(personId))
  );
  const availablePeople = (allPeople ?? []).filter((p) => !personIdsOnRoster.has(p.id));

  const playerById = new Map((players ?? []).map((p) => [p.id, p.name]));
  const rosterTeams = buildRosterTeams(teams ?? [], playerById);
  const unpairedPlayerNames = buildUnpairedPlayerNames(
    (players ?? []).map((p) => ({ id: p.id, name: p.name })),
    teams ?? []
  );
  const hasTeams = rosterTeams.length > 0;
  const allPlayerNames = (players ?? []).map((p) => p.name);
```

- [ ] **Step 4: Render the button below the page header**

Find:

```tsx
      <TournamentNav tournamentId={id} current="roster" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Roster</h1>
        <CopyLinkButton tournamentId={id} />
      </div>

      {!isCompleted && (
```

Replace with:

```tsx
      <TournamentNav tournamentId={id} current="roster" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Roster</h1>
        <CopyLinkButton tournamentId={id} />
      </div>

      <div className="mb-6">
        <ShareRosterButton
          tournamentName={tournament?.name ?? ''}
          date={tournament?.date ?? ''}
          venueName={venueName}
          timeslotLabel={timeslotLabel(tournament?.timeslot ?? '')}
          formatLabel={formatLabel(tournament?.format ?? '')}
          hasTeams={hasTeams}
          rosterTeams={rosterTeams}
          unpairedPlayerNames={unpairedPlayerNames}
          allPlayerNames={allPlayerNames}
        />
        <p className="text-xs text-slate-400 mt-1.5">
          Opens your share sheet on mobile — downloads the file on desktop.
        </p>
      </div>

      {!isCompleted && (
```

- [ ] **Step 5: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript errors — this confirms `ShareRosterButtonProps`' field names match exactly what the page now passes, and that `rosterTeams`/`unpairedPlayerNames`/`allPlayerNames` type-check against their expected shapes.

- [ ] **Step 6: Run the full test suite**

Run: `cd apps/organizer-web && npm test`
Expected: all tests still pass — this task adds no new pure-function logic (it's a Server Component composing existing pieces), consistent with this codebase's convention that pages aren't unit-tested.

- [ ] **Step 7: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/roster/page.tsx"
git commit -m "feat: wire Share Roster button into the Roster page"
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

No database migration is needed for this feature. On any tournament's Roster page:

- Confirm a "📤 Share Roster" button appears near the top, below the "Roster" heading.
- Confirm the Results page's "Share Results" button still works exactly as before (Task 1's retrofit changed its internals, not its behavior) — click it and confirm the share sheet/download still happens correctly.
- On a Round Robin, Double Header, or League + Playoffs tournament with teams already paired: click Share Roster, confirm the PDF shows a "Teams" table (#, Player 1, Player 2) and, if any players are unpaired, an "Unpaired Players" list beneath it.
- On the same kind of tournament with NO teams paired yet: confirm the PDF instead shows a plain "Players" list (the `hasTeams` false branch).
- On a Popcorn, Gauntlet, Claim the Throne, or Up and Down the River tournament (individual formats): confirm the PDF always shows a plain "Players" list, never a "Teams" table, and that no `teams` query is even issued (the `!isIndividual` gate should skip it — check the Network tab or Supabase logs if you want to confirm the query is skipped, though this isn't required for functional verification).
- Confirm on mobile the OS share sheet opens with WhatsApp selectable, and on desktop the file downloads directly, matching the Results PDF's already-verified share/download behavior.

Clean up any disposable test tournament(s) used for this check afterward.
