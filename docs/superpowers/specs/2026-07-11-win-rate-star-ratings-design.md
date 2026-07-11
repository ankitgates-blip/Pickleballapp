# Win Rate & Star Ratings — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Show each player's overall winning percentage and a derived 1-5 star
rating on their profile, plus the same win rate + rating broken down per
location — so it's visible at a glance both how good a player is overall
and where they play best.

## Scope decisions (resolved via brainstorming, 2026-07-11)

- **Star thresholds** (no overlaps/gaps): ≥75% → 5★, 60-74% → 4★, 50-59%
  → 3★, 25-49% → 2★, <25% → 1★.
- **Rating scope**: both an overall rating (one per player) and a
  separate rating per location (a player can rate differently at
  different venues, since it's driven by that location's own win rate).
- **Overall placement**: a new line in the profile header, directly
  under the existing "Last played" line — e.g. "Win rate: 68% ★★★★☆".
- **Location placement**: the existing "By Location" card gains win rate
  + stars on each row, alongside the match count already shown there.
- **Basis**: same as every other stat on this page — completed matches
  only, all-time (not scoped to a time period).

## Data model / pure functions

- `PersonStats` (`lib/stats/types.ts`) gains `winPercentage: number |
  null` — `null` when a player has zero completed matches ever (avoids
  a division by zero / a misleading "0%"), otherwise `Math.round(wins /
  matchesPlayed * 100)`. Computed in `computePersonStats`
  (`lib/stats/personStats.ts`) from the same `matches` array already
  used for every other stat on this page.
- `LocationCount` (`lib/stats/types.ts`) changes from `{ location:
  string; count: number }` to `{ location: string; count: number; wins:
  number }`. `count` keeps its existing meaning (total matches played at
  that location); `wins` is new. `countMatchesByLocation` (internal to
  `personStats.ts`) tallies both per location instead of just the count.
- New file `lib/stats/starRating.ts`:
  - `starRating(winPercentage: number): 1 | 2 | 3 | 4 | 5` — implements
    the thresholds above.
  - `renderStars(rating: number): string` — returns a 5-character string
    of filled (★) and empty (☆) stars, e.g. `renderStars(4)` →
    `"★★★★☆"`.
  - Both exhaustively unit-tested at every boundary value (75, 74, 60,
    59, 50, 49, 25, 24, 0, 100) to lock in the exact cutoffs.

## Display changes (both `/people/[id]` and `/p/[id]`, kept in sync)

- Header: a new line directly under the existing "Last played: {date}"
  line — `Win rate: {winPercentage}% {renderStars(starRating(winPercentage))}`,
  or "No matches played yet" (reusing the existing empty-state copy)
  when `winPercentage` is `null`. No stars render in the empty case.
- "By Location" card: each row's existing `{location} · {count}` becomes
  `{location} · {count} match{es} · {winRate}% {stars}`, where per-row
  win rate is `Math.round(entry.wins / entry.count * 100)` (a location
  entry never has 0 matches, since it only exists when the player has
  played there — no division-by-zero case here, unlike the overall
  figure).

## Out of scope for this feature

- Any change to the Location Leaderboard page (`/locations`) — it
  already has its own weighted scoring system (60% tournament wins / 40%
  match wins) and star ratings aren't part of its design.
- Any change to time-period breakdowns (This Month, weekly/monthly/
  yearly) — win rate and stars are all-time figures only.
- Configurable thresholds — the five bands are fixed, not a setting.
