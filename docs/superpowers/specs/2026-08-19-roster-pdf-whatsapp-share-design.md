# Roster PDF + WhatsApp Share — Design

Status: Approved, pending spec review before implementation plan.

This is the second increment of the PDF export series (after Tournament
Results PDF + WhatsApp Share, shipped in commits `f4c2cbc..7f364a3`).
Remaining increments — Schedule-only PDF, Player Stats PDF, Leaderboard
PDF — are each a separate, later spec that reuses the infrastructure
this one adds.

## Goal

Let the organizer generate a PDF of a tournament's roster — the player
list, and for team-based formats, the team pairings — from the Roster
page, and share it the same way the Results PDF already does (device
share sheet, with a download fallback).

## Current state

`apps/organizer-web/app/tournaments/[id]/roster/page.tsx` fetches and
renders the tournament's player list (add/remove players, add existing
people, review roster additions) but does not fetch `teams`, and its
tournament query only selects `completed_at, venue_id, timeslot` — no
`name`, `date`, `format`, or venue name, none of which the page
currently needs to render.

`apps/organizer-web/app/tournaments/[id]/results/ShareResultsButton.tsx`
has the share-vs-download logic (feature detection via
`navigator.canShare`, `AbortError` handling, blob-to-`File`, temporary
anchor download) inline, alongside its PDF-content-building code. That
logic is about to be duplicated for this feature and 2 more after it.

## Design

### Extract shared PDF utilities (retrofit, no behavior change)

New file `apps/organizer-web/lib/pdf/pdfShare.ts`, exporting:

```typescript
export type ShareOrDownloadResult = 'shared' | 'downloaded' | 'cancelled';

export async function shareOrDownloadPdf(
  blob: Blob,
  fileName: string,
  title: string
): Promise<ShareOrDownloadResult>;

export function sanitizeFileNamePart(name: string): string;
```

`shareOrDownloadPdf` is `ShareResultsButton`'s existing share/download
tail, extracted verbatim: wraps the blob in a `File`, checks
`navigator.canShare?.({ files: [file] })`, shares via `navigator.share`
(returning `'shared'`, or `'cancelled'` on a caught `AbortError`, or
re-throwing any other error for the caller to handle), and otherwise
falls back to a temporary anchor download (returning `'downloaded'`).

`sanitizeFileNamePart` moves here verbatim from
`apps/organizer-web/lib/tournament/resultsExport.ts` (where it was
originally added purely because the Results PDF needed it, not because
it's results-specific) — every future export button needs the same
filename sanitization, so it belongs in the shared PDF module, not a
tournament-domain module.

`ShareResultsButton.tsx` is retrofitted to call
`shareOrDownloadPdf(blob, fileName, tournamentName)` instead of its
inline share/download block, mapping the result to its existing
`status` state (`'shared'` → `'idle'`, `'cancelled'` → `'idle'`,
`'downloaded'` → `'unsupported'`, thrown errors still caught by its
existing outer `catch` → `'error'`). This is a pure refactor — the
button's user-visible behavior is unchanged, verified by the existing
build/test suite (no new test scenarios needed for `ShareResultsButton`
itself; `pdfShare.ts` gets its own new unit tests instead, covering
both the share path and the download-fallback path via mocked
`navigator`/`document`/`URL` globals).

### Roster page query changes

Widen the Roster page's existing tournament query to also select
`name, date, format`, plus a `venues(name)` join (same shape the
Results page already uses) — needed for the PDF header, not rendered
anywhere new on the page itself.

Add a new `teams` query, gated on the format actually using team
pairing (`!isIndividualFormat(tournament.format)` — the same check the
Teams page uses to decide whether to show its pairing UI at all):
`select('player_1_id, player_2_id').eq('tournament_id', id)`.

### New pure functions: `lib/tournament/rosterExport.ts`

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

`buildRosterTeams` resolves each team's two player IDs to names.
`buildUnpairedPlayerNames` returns the names of players not present in
any team's `player_1_id`/`player_2_id` — the same players the Teams
page's own "Unpaired players" section already shows.

### New component: `ShareRosterButton`

`apps/organizer-web/app/tournaments/[id]/roster/ShareRosterButton.tsx`,
same structural pattern as `ShareResultsButton` (dynamic `import('jspdf')`
+ `import('jspdf-autotable')` inside the click handler, `autoTable(doc,
options)` — never `doc.autoTable(...)`, per the bug fixed in the
Results PDF feature — for any tabular content), but building a
different PDF body:

1. Title block: "PicklerAlly DXB" + tournament name
2. Metadata line: date · venue · timeslot · format
3. If the format uses team pairing and at least one team exists: a
   "Teams" table (columns: #, Player 1, Player 2) via `autoTable`,
   followed by an "Unpaired Players" list if `buildUnpairedPlayerNames`
   returns any names
4. Otherwise (individual/ladder format, or a team format with no teams
   paired yet): a plain "Players" list, one name per line

Reuses `shareOrDownloadPdf` and `sanitizeFileNamePart` from the new
shared module for the share/download tail and filename — no
duplicated logic beyond the PDF-body-building code, which is
genuinely different per document type.

Props (plain, serializable, computed by the Server Component page):

```typescript
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
```

### Button placement and visibility

Renders unconditionally on the Roster page, near the existing "Roster"
heading (same placement convention as "Share Results" on the Results
page) — no gating on player/team count or `completed_at`.

## Out of scope

- Schedule-only PDF, Player Stats PDF, Leaderboard PDF — each a
  separate future increment.
- Any change to the Teams page itself (the source of truth for team
  pairing remains unchanged; this feature only reads the same data).
- Editing roster/teams from the PDF — export only.
