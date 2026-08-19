# Schedule PDF + WhatsApp Share — Design

Status: Approved, pending spec review before implementation plan.

This is the third increment of the PDF export series (after Tournament
Results PDF, commits `f4c2cbc..7f364a3`, and Roster PDF, commits
`6858202..1f7fc7f`). Remaining increments — Player Stats PDF,
Leaderboard PDF — are each a separate, later spec.

## Goal

Let the organizer generate a PDF of a tournament's match schedule
(round, court/stage, teams, and score if already played) from the
Bracket page and share it the same way the Results and Roster PDFs
already do.

## Current state

`apps/organizer-web/lib/tournament/resultsExport.ts` already has
everything a schedule needs: `buildMatchGroups(matches, teamById,
isLeaguePlayoffs)` returns `ExportMatchGroup[]` — a single "Matches"
group for most formats, or separate League/Semifinal/Final groups for
League + Playoffs — with each match's round (blanked outside the
league stage), team names, and a score-or-"Not yet played" label. This
is exactly a schedule's content; the Results PDF just additionally
shows standings and a champion line above it.

`apps/organizer-web/app/tournaments/[id]/bracket/page.tsx` is where
organizers generate and manage the schedule (Generate Bracket /
Generate Next Round buttons, round-by-round views for every format).
It already fetches `matches` (with `court`) and builds a `teamById:
Map<string, string>` in the exact shape `buildMatchGroups` expects, and
already computes `isLeaguePlayoffs`. Its tournament query currently
selects only `format` and the per-format round-count columns — no
`name`, `date`, `timeslot`, or venue name, none of which the page
currently needs to render.

## Design

### No new pure functions needed

`buildMatchGroups` and `ExportMatchGroup`/`ExportMatch`/`ExportRawMatch`
(already built, tested, and shipped for the Results PDF) are reused
as-is — a schedule is a strict subset of a results document's content
(matches only, no standings/champion), so nothing new needs designing
at the data-shaping layer.

### New component: `ShareScheduleButton`

`apps/organizer-web/app/tournaments/[id]/bracket/ShareScheduleButton.tsx`,
the same structural pattern as `ShareResultsButton`/`ShareRosterButton`
(dynamic `import('jspdf')` + `import('jspdf-autotable')` inside the
click handler, `autoTable(doc, options)` for any tabular content,
`shareOrDownloadPdf`/`sanitizeFileNamePart` from the shared
`lib/pdf/pdfShare.ts` module for the share/download tail), building a
PDF body of:

1. Title block: "PicklerAlly DXB" + tournament name
2. Metadata line: date · venue · timeslot · format
3. One `autoTable` per `ExportMatchGroup`, headed by `stageLabel`,
   columns: Round, Team A, Team B, Score — identical structure to the
   Results PDF's match tables, just without the standings table or
   champion line above them

Props (plain, serializable, computed by the Bracket page):

```typescript
type ShareScheduleButtonProps = {
  tournamentName: string;
  date: string;
  venueName: string;
  timeslotLabel: string;
  formatLabel: string;
  matchGroups: ExportMatchGroup[];
};
```

### Bracket page changes

Widen the existing tournament query to also select `name, date,
timeslot`, plus a `venues(name)` join (same shape the Results and
Roster pages already use) — needed for the PDF header, not rendered
anywhere new on the page itself. Compute `exportMatchGroups =
buildMatchGroups(matches mapped to ExportRawMatch shape, teamById,
isLeaguePlayoffs)` using data the page already has, and render
`ShareScheduleButton` near the top of the page (below the existing
format/round-progress header area, above the format-specific
generation controls).

### Button placement and visibility

Renders unconditionally on the Bracket page — no gating on whether a
schedule has been generated yet (an ungenerated schedule just produces
an empty `matchGroups` array, matching the Results PDF's already-
established empty-tournament handling).

## Out of scope

- Player Stats PDF, Leaderboard PDF — each a separate future increment.
- Any change to `buildMatchGroups` itself or to bracket generation
  logic.
- Deduplicating the Results/Roster/Schedule buttons' near-identical
  header-block-drawing code (title + metadata line) into a shared
  helper — noted as a reasonable future cleanup once a 4th PDF type
  confirms the pattern is fully stable, not done here to avoid
  prematurely abstracting from only 3 call sites.
