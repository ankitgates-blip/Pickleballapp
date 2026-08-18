# Tournament Results PDF + WhatsApp Share — Design

Status: Approved, pending spec review before implementation plan.

This is the first increment of the organizer's requested WhatsApp/PDF
export feature. The full request bundles several independent pieces —
PDF generation infrastructure, at least four distinct document types
(schedule, roster, tournament/match stats, player stats, leaderboard),
and a WhatsApp sharing mechanism. This spec covers only the sharing
mechanism plus one document type: a Tournament Results PDF. Roster,
schedule-only, player-stats, and leaderboard PDFs are each a separate,
later increment that reuses the infrastructure built here.

## Goal

Let the organizer generate a PDF summary of a tournament's results —
standings, champion, and match results — from the existing Results
page, and share it via a device share button that hands the file to
WhatsApp (or any other app the organizer picks from their OS share
sheet).

## Current state

`apps/organizer-web/app/tournaments/[id]/results/page.tsx` is a Server
Component that already fetches and computes everything a results
summary needs: tournament metadata (name, date, venue, timeslot,
format, `completed_at`), the champion name (via
`computeTournamentChampionName`), standings (team, individual, or
ladder shape depending on format, via `computeStandings` /
`computeIndividualStandings` / `computeClaimTheThroneStandings`), and
the full match list grouped by stage. None of this data leaves the
server today except as rendered HTML.

## Design

### New dependency

Add `jspdf` and `jspdf-autotable` to `apps/organizer-web`. Both are
client-side, dependency-light, and well-suited to tabular data like a
standings table — no server rendering, no new backend surface.

### New component: `ShareResultsButton`

A new Client Component,
`apps/organizer-web/app/tournaments/[id]/results/ShareResultsButton.tsx`,
rendered by the Results page near the top (next to the tournament
header). The Results page passes it plain, already-computed,
serializable props — it performs no data fetching or computation of
its own:

```typescript
type ShareResultsButtonProps = {
  tournamentName: string;
  date: string;
  venueName: string;
  timeslotLabel: string;
  formatLabel: string;
  completedAt: string | null;
  championName: string | undefined;
  standingsRows: StandingsRow[];   // see below
  matchGroups: MatchGroup[];       // see below
};

type StandingsRow = {
  rank: number;
  name: string;          // team name or player name, already resolved
  primaryStat: string;   // "Ladder Pts" value, or "" if not a ladder format
  wins: number;
  losses: number;
  diffLabel: string;     // "Point Diff" or "Avg Diff" column, pre-formatted (e.g. "+12", "-3.5")
};

type MatchGroup = {
  stageLabel: string;   // "League" | "Semifinal" | "Final" | "Matches"
  matches: {
    round: number | null;
    teamAName: string;
    teamBName: string;
    scoreLabel: string;  // "11-7" or "Not yet played"
  }[];
};
```

The Results page builds `standingsRows` and `matchGroups` by mapping
its existing local variables (`standings`/`individualStandings`/
`ladderStandings`, `matches`) into these shapes — this is pure
reformatting of data the page already has, not new computation.

### PDF generation (on click, client-side)

1. Dynamically `import('jspdf')` and `import('jspdf-autotable')` (code
   -split — these libraries are never in the main page bundle, only
   loaded when the organizer actually clicks Share).
2. Build the PDF:
   - Title block: "PicklerAlly DXB" plus the tournament name
   - Metadata line: date · venue · timeslot · format · (Completed
     `<date>` if applicable)
   - Champion block, if `championName` is present: "🏆 Champion:
     `<name>`"
   - Standings table via `autoTable`, columns matching `StandingsRow`
     (the "Ladder Pts" column only included when any row has a
     non-empty `primaryStat`)
   - One table per `MatchGroup`, headed by `stageLabel`, columns:
     Round, Team A, Team B, Score
3. Output the PDF as a `Blob` (`doc.output('blob')`), and wrap it in a
   `File` named `<tournament-name>-results.pdf` (sanitized: spaces to
   hyphens, non-alphanumeric characters stripped).

### Share flow

```typescript
const file = new File([blob], fileName, { type: 'application/pdf' });

if (navigator.canShare?.({ files: [file] })) {
  await navigator.share({ files: [file], title: tournamentName });
} else {
  // Fallback: trigger a plain download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
```

`navigator.share` with `files` is well-supported on the mobile
browsers this app already targets (Android Chrome, iOS Safari 15+).
Desktop browser support is inconsistent, so the fallback silently
downloads the PDF instead — the organizer can attach it to WhatsApp
Web manually. A small caption near the button clarifies this:
"Opens your share sheet on mobile — downloads the file on desktop."

The button shows a brief loading state ("Generating…") while the PDF
is built and, on share/download completion or cancellation, returns to
its normal label. `navigator.share` rejecting because the user
cancelled the share sheet (`AbortError`) is treated as a normal,
silent no-op — not an error state.

### Button placement and visibility

The button renders unconditionally on the Results page (any
tournament, completed or not) — an in-progress tournament's partial
results are still useful to share (e.g., mid-tournament standings).
Label: "Share Results". No gating on `completed_at`.

## Out of scope

- Roster PDF, schedule-only PDF, player-stats PDF, leaderboard PDF —
  each a separate future increment reusing this same
  generation-and-share pattern.
- WhatsApp Business API automation (organizer explicitly chose the
  device share-sheet approach).
- Any server-side PDF generation or storage — the PDF is generated
  fresh in the browser on every click and never persisted.
- Customizing PDF branding/theme beyond the fixed header described
  above (e.g., no logo image, no per-venue color themes).
