# Win Rate Trend (Weekly/Monthly/Yearly) — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Show each player's win rate broken down by week, month, and year, with a
trend indicator comparing each period to the one before it — so it's
visible at a glance whether a player's performance is improving or
declining over time.

## Scope decisions (resolved via brainstorming, 2026-07-11)

- **Period counts shown**: last 4 weeks, last 6 months, all years.
- **Trend display**: an arrow plus the percentage-point change, colored
  — e.g. `▲ +12pp` (green, improving), `▼ -8pp` (red, declining), `— 0pp`
  (gray, unchanged). No indicator at all for the oldest period in each
  list (nothing earlier to compare against).
- **Gap handling**: trend always compares a period to whichever period
  the player most recently actually played before it — not the literal
  adjacent calendar period. This falls out naturally from how the
  underlying data is already stored (only periods with real activity
  exist in the array at all), so no special gap-detection logic is
  needed — comparing to the next array entry already does the right
  thing.
- **Yearly also gets a trend arrow** (year-over-year), for consistency
  with Weekly and Monthly, even though it wasn't explicitly named in the
  original request.
- **Placement**: a new "Win Rate Trend" card on both `/people/[id]` and
  `/p/[id]`, positioned after the existing "By Location" card and before
  "Head-to-Head" — kept in sync on both pages like every other stat here.

## Data model

`PeriodStats` (`lib/stats/types.ts`) gains three fields:

```typescript
export type PeriodStats = {
  period: string;
  gamesWon: number;
  gamesLost: number;
  tournamentsWon: number;
  winPercentage: number | null; // null when gamesWon + gamesLost === 0
  trend: 'up' | 'down' | 'flat' | null; // null when there's no earlier period to compare against
  trendPointsChange: number | null; // winPercentage minus the previous period's, null alongside trend
};
```

`buildPeriods` (`lib/stats/personStats.ts`, already used to build `weekly`,
`monthly`, and `yearly` — the same function, called three times with
different key functions) computes these after building the sorted
(most-recent-first) list: each period's `winPercentage` is its own
`gamesWon / (gamesWon + gamesLost)`, and `trend`/`trendPointsChange` come
from comparing to `periods[index + 1]` (the next entry in the
most-recent-first array — i.e., the chronologically preceding period that
actually has data, automatically skipping any empty gaps).

This is purely additive to an existing, already-tested pure function
pipeline; `weekly`, `monthly`, and `yearly` keep their existing meaning
and sort order, just with three richer fields per entry.

## Display helpers

New file `lib/stats/trend.ts`:

- `renderTrend(trend: 'up' | 'down' | 'flat' | null, pointsChange: number
  | null): string` — returns `"▲ +Npp"`, `"▼ -Npp"`, `"— 0pp"`, or `""`
  when `trend`/`pointsChange` are `null` (nothing to compare against).
- `trendColorClass(trend: 'up' | 'down' | 'flat' | null): string` —
  returns a Tailwind text-color class (teal for up, red for down, slate
  for flat/null).

## Display changes (both `/people/[id]` and `/p/[id]`, kept in sync)

A new card, "Win Rate Trend", inserted between the existing "By Location"
and "Head-to-Head" cards:

- **Weekly** subsection: `stats.weekly.slice(0, 4)`, one row per period —
  period label, win percentage (or "No matches" if `null`), and the
  trend indicator (styled with `trendColorClass`, rendered via
  `renderTrend`).
- **Monthly** subsection: `stats.monthly.slice(0, 6)`, same row format.
- **Yearly** subsection: `stats.yearly` (no slice — show all), same row
  format.
- If a given granularity's array is empty, that subsection shows "No
  matches played yet" (matching the existing empty-state copy used
  elsewhere on this page).

## Out of scope for this feature

- Any change to the existing "This Month" card, which already reads
  `stats.monthly` for the current month's raw counts — it continues to
  work unchanged since it only reads specific fields, not the whole
  object.
- Charting/graphing the trend visually — this is a text/row-based list,
  not a chart.
- Configurable period counts — 4 weeks / 6 months / all years are fixed.
