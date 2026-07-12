# Gauntlet Format — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Make the "Gauntlet" tournament format generate working Swiss-style,
performance-based matchups instead of showing "coming soon." Modeled on
Pickleheads' Gauntlet: partners rotate every round, and each round's
matchups are driven by *how players have performed so far* — winners
face tougher opponents, losers face easier ones — rather than by a
fixed schedule or by partner/opponent-history avoidance (which is
Popcorn's model).

## Research basis

Pickleheads' real Gauntlet is a persistent, multi-week ladder: an
organizer seeds players by skill, each session re-pairs partners and
opponents based on results, and a "step" system carries player rank
between separate weekly sessions. Standings within a session use win
percentage (wins ÷ games played), which matters there because players
can be marked in/out per round.

Sources: [Organizer Video Series – Gauntlet](https://www.pickleheads.com/organize/watch/gauntlet),
[How to Run a Pickleball Ladder With Any Number of Players](https://www.pickleheads.com/guides/how-to-run-a-pickleball-ladder-with-any-number-of-players).

## Scope decisions (resolved via brainstorming, 2026-07-12)

- **Single-event only**: this app's tournaments are one-off events, not
  a persistent weekly ladder. The cross-session "step" system is
  explicitly out of scope. Only the within-tournament Swiss-pairing
  mechanic is built.
- **Round 1 seeding**: random shuffle (no player rating system exists
  yet in this app), same as Popcorn's round 1.
- **Partners rotate every round** (individual scoring), same
  architectural shape as Popcorn — but the *pairing criterion* is
  current-rank proximity ("winners play winners"), not
  least-repeated-history.
- **Ranking metric**: raw win count, then point differential as
  tiebreak — identical to `computeStandings`/`computeIndividualStandings`'s
  existing sort order. Win percentage is explicitly NOT used: every
  player in this model plays the same number of rounds (no mid-tournament
  in/out toggle), so win percentage and win count produce identical
  orderings here, and win percentage only adds edge cases (divide-by-zero,
  small-sample noise) with no benefit.
- **2v2 split rule within each ranked group of 4**: 1st+4th (by rank)
  vs 2nd+3rd. This pairs the strongest and weakest player together
  against the two middle-ranked players, which is the standard way to
  keep a 4-person pod competitive rather than lopsided.
- **Round-by-round generation, not upfront**: unlike Popcorn/Round
  Robin, Gauntlet's pairing for round N+1 depends on actual match
  *results* from round N, which don't exist until scores are entered.
  So only one round is generated at a time: organizer generates Round
  1, enters scores, generates Round 2, enters scores, and so on until
  `gauntlet_rounds` is reached. This mirrors the existing League +
  Playoffs pattern (generate semifinals only once league is complete,
  generate final only once semifinals are complete) — just generalized
  to N rounds instead of 3 fixed stages.
- **Sit-outs**: when the active player count isn't a multiple of 4,
  sit-outs rotate fairly (fewest sit-outs so far), identical rule to
  Popcorn.
- **Teams page bypass**: same as Popcorn — Gauntlet auto-generates every
  pairing, so the manual "Pair Teams" UI is replaced with an info card.
- **Champion banner**: top individual player by the same ranking metric
  (wins desc, then point differential desc).

## Data model

New migration: nullable `tournaments.gauntlet_rounds int` column,
populated only when `format = 'gauntlet'`. Mirrors `popcorn_rounds`
exactly — a separate column per format, not a shared generic column,
to avoid touching already-shipped Popcorn code.

No other new tables. Gauntlet reuses `teams` (auto-created per unique
pairing, exactly like Popcorn) and `matches` (`stage: 'league'`) as-is.
The existing `matches.round` column (already present) is what
distinguishes one generated round from the next.

## New types

In `apps/organizer-web/lib/types.ts`:

```typescript
export type GauntletRoundResult = {
  round: number;
  teamAPlayerIds: [string, string];
  teamBPlayerIds: [string, string];
  scoreA: number;
  scoreB: number;
};

export type GauntletPairing = {
  teamAPlayerIds: [string, string];
  teamBPlayerIds: [string, string];
};
```

`GauntletPairing` deliberately has no `round` field (unlike Popcorn's
`PopcornPairing`) — the pure function only ever generates one round at
a time, and the caller (the server action) is the one that knows which
round number is being generated.

## The pairing algorithm

New pure function `generateGauntletRound(playerIds: string[], previousRounds: GauntletRoundResult[], rng?: () => number): GauntletPairing[]`
in a new file `apps/organizer-web/lib/tournament/gauntlet.ts`. Requires
at least 4 players (throws otherwise, matching every other format's
convention).

Deliberately self-contained in terms of player IDs only — it does not
depend on `Team`/`MatchResult`/DB team IDs at all, so it stays a pure,
independently testable function exactly like `generatePopcornSchedule`.
`previousRounds` is the flat list of every prior round's *already
player-ID-keyed* results (the server action is responsible for
resolving DB team IDs back to player ID pairs before calling this).

Steps, run once per call (i.e., once per round):

1. **Determine sit-out counts**: for each prior round, the players NOT
   present in that round's matches sat out. Tally each player's total
   sit-out count across `previousRounds`.
2. **Determine current standings**: tally each player's wins, losses,
   and point differential directly from `previousRounds` (a player is
   credited for both members of whichever side they were on in each
   match they played). This is intentionally a self-contained
   computation inside this file, not a call to
   `computeIndividualStandings` (which is keyed by DB team ID and
   belongs to the display layer, not this pure algorithm layer).
3. **Sit-outs for this round**: `playerCount % 4` players sit out,
   chosen from whoever has the lowest sit-out count so far (ties broken
   by shuffle).
4. **Rank the remaining active players**: shuffle first (for stable,
   fair tie-breaking), then stable-sort by (wins descending, point
   differential descending). For round 1 (`previousRounds` is empty),
   every player's record is 0-0/0, so this sort is a no-op and the
   random shuffle order is preserved — round 1 naturally falls out of
   the same algorithm with no special-casing.
5. **Group into courts of 4 by rank order**: the top 4 ranked active
   players form court 1, the next 4 form court 2, and so on. This is
   what creates "winners face winners, losers face losers."
6. **Split each group of 4 into a 2v2**: label the four players in
   rank order within the group r1 (highest) through r4 (lowest).
   `teamAPlayerIds = [r1, r4]`, `teamBPlayerIds = [r2, r3]`.

Returns the flat list of `GauntletPairing` for just this one round.

## Individual standings

No new standings function needed. `computeIndividualStandings` (built
for Popcorn, in `apps/organizer-web/lib/tournament/standings.ts`)
already computes exactly the right thing — per-player wins/losses/points
from a set of `MatchResult`s and a `teams` roster — and Gauntlet's
`teams` rows have the identical shape (auto-generated per rotating
pairing). Reused as-is by the standings and results page forks.

## Completion detection

`isTournamentComplete` (in `apps/organizer-web/lib/tournament/completion.ts`)
currently treats "all matches that exist in the DB are complete" as
sufficient for every format except `league_playoffs`. This is wrong for
Gauntlet: only the current round's matches exist in the DB until the
organizer explicitly advances, so after Round 1 completes, "all
existing matches are complete" would be true even though
`gauntlet_rounds` might be 5.

Fix: add a `round: number` field to the existing `CompletionCheckMatch`
type, and an optional `targetRounds?: number` parameter to
`isTournamentComplete`. New branch:

```typescript
if (format === 'gauntlet') {
  const realMatches = matches.filter((m) => m.teamBId !== null);
  if (realMatches.length === 0 || !realMatches.every((m) => m.status === 'complete')) {
    return false;
  }
  const maxRound = Math.max(...matches.map((m) => m.round));
  return targetRounds !== undefined && maxRound >= targetRounds;
}
```

This only adds a new branch — the existing `league_playoffs` branch and
the fallback branch (used by round_robin, double_header, popcorn, and
any unrecognized format) are untouched. The one call site
(`apps/organizer-web/app/tournaments/[id]/matches/actions.ts`'s
`enterScore`) needs to additionally select `round` on matches and fetch
`gauntlet_rounds` (only when format is gauntlet) to pass as
`targetRounds`.

## Server actions and pages

### Tournament creation

`apps/organizer-web/app/tournaments/new/page.tsx` adds a second
"Number of rounds (Gauntlet only)" number input (default 5), shown
unconditionally next to Popcorn's existing "(Popcorn only)" field —
consistent with that field's own precedent of avoiding client-side
show/hide logic. `apps/organizer-web/app/tournaments/new/actions.ts`'s
`createTournament` stores it as `gauntlet_rounds` only when
`format === 'gauntlet'`, else `null`.

### Teams page

`apps/organizer-web/app/tournaments/[id]/teams/page.tsx` extends the
existing `isPopcorn` bypass check to also cover `isGauntlet` (format
=== 'gauntlet'), showing the same "auto-generates partners" info card
copy for both formats via a combined `isAutoPaired` condition.

### Round generation (new server action)

A new server action `advanceGauntletRound(tournamentId: string)` in
`apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`:

1. Fetches the tournament's `format`/`gauntlet_rounds`, all roster
   `players`, all existing `teams`, and all existing `matches` with
   `stage: 'league'`.
2. Determines the next round number: `1 + max(existing match rounds, default 0)`.
3. Resolves existing matches into `GauntletRoundResult[]` (looking up
   each match's `team_a_id`/`team_b_id` back to their `player_1_id`/
   `player_2_id` via the fetched `teams`).
4. Calls `generateGauntletRound(playerIds, previousRounds)`.
5. Dedupes/reuses-or-creates `teams` rows per unique player pair
   (identical `pairKey` logic to `generatePopcornBracket`).
6. Inserts one `matches` row per pairing for the new round number
   (`stage: 'league'`, `status: 'pending'`).

### Bracket page

Gauntlet added to the supported-formats check. Instead of a single
"Generate League Bracket" button (used by team-based formats) or
Popcorn's single "Generate Popcorn Schedule" button, Gauntlet shows:

- If no matches exist yet: "Generate Round 1" (calls
  `advanceGauntletRound`), gated on `playerCount >= 4` exactly like
  Popcorn's gate.
- If the current round's matches exist but aren't all complete yet: no
  button, just the existing round-grouped match list (reused as-is).
- If the current round is complete and `currentRound < gauntlet_rounds`:
  "Generate Round N+1" (calls `advanceGauntletRound` again).
- If the current round is complete and `currentRound >= gauntlet_rounds`:
  no more generation — the tournament is complete (per the updated
  `isTournamentComplete`) and results are available.

### Standings page / Results page

Identical fork to Popcorn's: `isGauntlet` renders
`computeIndividualStandings`'s output (player rows) instead of the
team-based table, and the results page's champion banner names the top
individual player for Gauntlet too.

## Out of scope

- Cross-tournament ladder/step tracking (Pickleheads' actual persistent
  ladder behavior) — this app's tournaments are single events.
- Mid-tournament player in/out toggling per round.
- Win-percentage-based ranking (using raw win count instead, per the
  scope decision above).
- The other three still-unimplemented formats (Up and Down the River,
  Claim the Throne, Cream of the Crop) — separate future increments.
- No public-facing page (`/t/[id]`, `/p/[id]`) changes in this
  increment, matching Popcorn's precedent.
- No UI for organizers to manually override/edit a generated round.
