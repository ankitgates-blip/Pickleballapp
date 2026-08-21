# Skip-to-Final Available Anytime — Design

Status: Approved.

## Background

The just-shipped "Skip Semifinals in League + Playoffs" feature
(`docs/superpowers/specs/2026-08-21-skip-semifinals-design.md`) gated the
"Skip Semifinals — Go to Final" button on `allLeagueComplete`, mirroring
the existing "Generate Semifinals" button's gate. Manual regression
surfaced that this doesn't match the real need: the organizer wants to
skip straight to the final **while league matches are still ongoing**,
not only after every league match has a score.

## Goal

Make "Skip Semifinals — Go to Final" available as soon as a League +
Playoffs tournament has 4+ teams and no Semifinal/Final match exists yet
— regardless of whether league play has finished — picking the top 2
teams by current (possibly partial, possibly entirely unplayed)
standings.

## Gate change

Today, both "Generate Semifinals" and "Skip Semifinals — Go to Final"
share one visibility condition (`showGenerateSemifinals`, aliased as
`showSkipToFinal`), which requires `allLeagueComplete`. This decouples
them:

- **"Generate Semifinals"** — unchanged. Still requires
  `allLeagueComplete` (it seeds all 4 semifinalists from the full
  league table, so it genuinely needs complete data to be fair).
- **"Skip Semifinals — Go to Final"** — new gate:
  `isLeaguePlayoffs && semifinalMatches.length === 0 && !hasFinalMatch
  && teamCount >= 4`. No `allLeagueComplete` requirement.

Because these gates now diverge, the two buttons are no longer always
rendered together:

- League complete: both buttons show side by side (today's behavior).
- League still in progress: only "Skip Semifinals — Go to Final" shows.

## Picking finalists from partial or zero data

`computeStandings` (`lib/tournament/standings.ts`) only produces a row
for a team once it appears in at least one *completed* match — a team
with zero completed matches gets no row at all. Left as-is, a
just-created tournament (0 league matches played) would produce an empty
standings array, and `pickFinalists` would throw ("need at least 2
teams") — contradicting "available anytime, even 0 matches played."

Fix: in `skipToFinalMatch`, after computing standings from completed
league matches, append a 0-0 row for any team from the tournament's
`teams` table that isn't already in the standings list, in that table's
existing order (stable, no arbitrary shuffling). This guarantees at
least `teamCount` rows are available for `pickFinalists` to choose from,
so the action works at any point in the tournament — from zero matches
played up through a fully complete league — exactly as it does today
once the league is finished.

Ranking remains "teams with real records rank by their record; teams
with no record yet rank behind them, in table order" — never randomized,
never crashing.

## Unplayed league matches

Left untouched. No auto-cancellation, no deletion. They simply become
irrelevant once the tournament has moved to the Final stage — consistent
with how the app already treats a completed tournament (nothing depends
on league matches being finished once `stage: 'final'` exists;
`isTournamentComplete` for League + Playoffs with 4+ teams already only
checks for a completed Final match).

## No confirmation dialog

Kept consistent with the original shipped design: one click, and — as
established there — non-destructive (nothing existing gets deleted or
overwritten).

## Out of scope

- No change to "Generate Semifinals" — it keeps requiring a fully
  complete league.
- No warning/confirmation copy about picking finalists from incomplete
  data — the organizer explicitly asked for this to be available at any
  point, with no gate.
