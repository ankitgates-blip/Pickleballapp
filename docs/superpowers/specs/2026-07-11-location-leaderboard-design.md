# Location Leaderboard — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Add an organizer-only "Location Stats" page showing, for each venue, the
top 5 players ranked by a weighted score combining tournament wins and
match wins — both scoped to that specific venue only.

## Context

This is the third and final sub-project of the batch requested together
(remove player — shipped; player profile stats — shipped; this leaderboard
— last). Built last since it depends on the same location-scoped
match/tournament data the profile-stats feature already introduced.

## Scope decisions (resolved via brainstorming, 2026-07-11)

- **Score formula**: normalize each metric to 0–1 relative to the
  location's own maximum, then weight 60% tournament wins / 40% match
  wins — avoids one raw metric (naturally larger in magnitude) drowning
  out the other. If nobody at a location has any tournament wins yet (or
  any match wins yet), that half of the score is 0 for everyone rather
  than dividing by zero.
- **Location scoping**: both tournament wins and match wins only count
  activity at that specific venue — a player's record elsewhere never
  affects their ranking at a different location.
- **Eligibility**: no minimum match count — anyone with at least one
  match at that location is a candidate. Ties broken by total matches
  played there (more matches wins the tie), matching the tie-break style
  already used for "toughest opponent"/"best partner" on the profile
  pages.
- **Page**: a new organizer-only page (`/locations`), both venues shown
  on one page, reachable from the main nav — not public.

## Data model / pure function

New file `lib/stats/locationLeaderboard.ts`:

```typescript
export type LocationLeaderboardEntry = {
  personId: string;
  matchWins: number;
  tournamentWins: number;
  score: number;
};

export function computeLocationLeaderboard(
  candidates: Array<{ personId: string; matchWins: number; tournamentWins: number; matchesPlayed: number }>
): LocationLeaderboardEntry[]
```

Computes `tournamentScore = tournamentWins / maxTournamentWins` (0 if the
max is 0) and `matchScore = matchWins / maxMatchWins` (0 if the max is
0) per candidate, combines them as `0.6 * tournamentScore + 0.4 *
matchScore`, sorts descending by score with ties broken by
`matchesPlayed` descending, and returns the top 5.

## Page: `/locations`

- New organizer-only page (`requireOrganizer()`, same pattern as
  `/people`). Added to the main nav in `OrganizerShell.tsx`, next to the
  existing "Player Profile" link.
- Fetches every venue, every tournament (with its venue), every player,
  team, and match the organizer owns — the same broad fetch shape
  `/people/page.tsx` already uses.
- For each venue: filters matches down to that venue's tournaments, then
  for each person reuses the existing `buildPersonMatchRecords` (from
  the profile-stats feature) to get their location-scoped match records,
  from which `matchWins` and `matchesPlayed` are derived directly.
  `tournamentWins` reuses the same per-tournament `computeStandings`
  winner-detection pattern already used to build `tournamentsWon` on the
  profile pages, restricted to that venue's tournaments.
- Renders one card per venue with its top-5 list: 🥇🥈🥉 for the top
  three (matching the existing Standings/Results medal style), player
  name linking to `/people/[id]`, tournament wins, and match wins. The
  underlying composite score isn't displayed, only the rank it produces.

## Out of scope for this feature

- Any change to the per-player profile pages (`/people/[id]`, `/p/[id]`)
  — this is a new, separate page.
- A public version of this leaderboard.
- Configurable weighting (60/40 is fixed, not an organizer setting).
- Any handling for a third venue being added — the page fetches venues
  dynamically, so it would automatically show a new venue's leaderboard,
  but this isn't specifically tested for since only two venues exist
  today.
