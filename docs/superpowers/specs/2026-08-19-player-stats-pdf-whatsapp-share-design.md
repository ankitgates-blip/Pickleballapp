# Player Stats PDF + WhatsApp Share — Design

Status: Approved, pending spec review before implementation plan.

This is the fourth increment of the PDF export series (after Results,
Roster, and Schedule PDFs). The remaining increment — Leaderboard PDF —
is a separate, later spec.

## Goal

Let the organizer generate a PDF of a player's full stats — the same
content already shown on their Player Detail page
(`/people/[id]`) — and share it the same way the other three PDFs do.

## Current state

`apps/organizer-web/app/people/[id]/page.tsx` computes a `PersonStats`
object (`lib/stats/personStats.ts`) with everything the page renders:
this-month totals, per-location match counts, weekly/monthly/yearly
win-rate trends, toughest-opponent/best-partner head-to-head records,
and full match history. None of this is currently exported.

**Two of the page's existing display helpers use Unicode glyphs that
don't survive into a PDF.** `renderStars` (`lib/stats/starRating.ts`)
uses `★`/`☆` (U+2605/U+2606) and `renderTrend` (`lib/stats/trend.ts`)
uses `▲`/`▼`/`—` (U+25B2/U+25BC/U+2014) — none of these are in jsPDF's
standard-font WinAnsi encoding (the same class of issue flagged as a
follow-up for non-Latin player names, task_aa50ae89). The PDF export
needs its own plain-text formatting for star ratings and trends,
reusing the existing numeric logic (`starRating()`'s 1–5 thresholds,
`trendPointsChange`'s sign) but rendering it as ASCII text instead of
copying the page's Unicode display strings.

## Design

### New pure functions: `lib/stats/personStatsExport.ts`

```typescript
export type ExportPeriodRow = {
  period: string;
  winPercentageLabel: string; // "62%" or "No matches"
  trendLabel: string;          // "Up +5pp" / "Down -3pp" / "Flat 0pp" / ""
  gamesWon: number;
  gamesLost: number;
};
export function buildPeriodRows(periods: PeriodStats[]): ExportPeriodRow[];

export type ExportLocationRow = {
  location: string;
  matchCount: number;
  winPercentageLabel: string; // "75%"
};
export function buildLocationRows(locations: LocationCount[]): ExportLocationRow[];

export type ExportMatchHistoryRow = {
  date: string;
  partnerName: string;
  opponentsLabel: string; // "Alice / Bob"
  result: 'W' | 'L';
  scoreLabel: string;     // "11-7"
};
export function buildMatchHistoryRows(
  matchHistory: PersonMatchRecord[],
  nameById: Map<string, string>
): ExportMatchHistoryRow[];

export function formatHeadToHead(
  record: HeadToHeadRecord | null,
  nameById: Map<string, string>
): string; // "Alice (5-2)" or "Not enough matches yet"

export function starRatingLabel(winPercentage: number | null): string;
// "62% win rate (4/5 stars)" or "No matches played yet"
```

`starRatingLabel` reuses the existing `starRating()` function from
`lib/stats/starRating.ts` for its 1–5 threshold logic — only the
output format changes, from Unicode glyphs to plain text.

### New component: `SharePlayerStatsButton`

`apps/organizer-web/app/people/[id]/SharePlayerStatsButton.tsx`, same
structural pattern as the other three PDF buttons, building a PDF body
that mirrors the page's own section order:

1. Title block: "PicklerAlly DXB" + player name
2. Summary line: last played date (or "No matches played yet") ·
   `starRatingLabel(winPercentage)`
3. "This Month" — 3 plain numbers: Games Won, Games Lost, Tournaments
   Won
4. "By Location" — `autoTable` over `buildLocationRows`
5. "Trends" — three `autoTable`s (Weekly, Monthly, Yearly) over
   `buildPeriodRows`, using the exact same slices the page already
   applies (weekly: 4 most recent, monthly: 6 most recent, yearly: all)
   — matching the page's own display exactly rather than introducing a
   new judgment call about how much history to include
6. "Head-to-Head" — two plain text lines: Toughest opponent, Best
   partner, via `formatHeadToHead`
7. "Match History" — `autoTable` over `buildMatchHistoryRows`
   (unbounded, matching the page's own unbounded display)

Props (plain, serializable, computed by the Server Component page):

```typescript
type SharePlayerStatsButtonProps = {
  personName: string;
  lastPlayedDate: string | null;
  starLabel: string;
  thisMonthGamesWon: number;
  thisMonthGamesLost: number;
  thisMonthTournamentsWon: number;
  locationRows: ExportLocationRow[];
  weeklyRows: ExportPeriodRow[];
  monthlyRows: ExportPeriodRow[];
  yearlyRows: ExportPeriodRow[];
  toughestOpponentLabel: string;
  bestPartnerLabel: string;
  matchHistoryRows: ExportMatchHistoryRow[];
};
```

Reuses `shareOrDownloadPdf`/`sanitizeFileNamePart` from the shared
`lib/pdf/pdfShare.ts` module.

### Page changes

`apps/organizer-web/app/people/[id]/page.tsx` already computes
everything needed (`stats`, `nameFor`, `thisMonth`) — the page only
needs to additionally call the new `buildLocationRows`/`buildPeriodRows`/
`buildMatchHistoryRows`/`formatHeadToHead`/`starRatingLabel` functions
on data it already has in scope, and render `SharePlayerStatsButton`
near the top, below the header/summary line.

### Button placement and visibility

Renders unconditionally — even a player with zero matches shows a
sparse-but-valid PDF (mirroring the page's own "No matches played yet"
states, and the empty-tournament handling already established by the
other three PDFs).

## Out of scope

- Leaderboard PDF — a separate future increment.
- Any change to `computePersonStats`, `buildPersonMatchRecords`, or the
  page's own on-screen display (stars/trend arrows stay as Unicode on
  the page — only the PDF export gets plain-text equivalents).
- The public `/p/[id]` player page (this increment covers the
  organizer-facing `/people/[id]` page only, consistent with every
  other PDF export button living on an organizer-facing page).
