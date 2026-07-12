# Claim the Throne Format — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Make the "Claim the Throne" tournament format generate a working
ladder-of-courts schedule: partners rotate every round, and a player's
court position moves up or down based on winning/losing, with a
court-weighted point system (not plain win count) deciding the
champion. This is the third of the six originally-unimplemented
formats to ship (after Popcorn and Gauntlet); Cream of the Crop and Up
and Down the River remain future increments.

## Research basis

Pickleheads' Claim the Throne: courts form a ladder (Court 1 = top,
Court N = bottom). Winners move up a court, losers move down a court,
partners split every round. Standings use a court-weighted point
system — wins on higher/more competitive courts are worth more than
wins on lower courts, so a player with fewer total wins can outrank
someone with more if their wins came on tougher courts. Tiebreaker is
average point differential (points scored minus allowed, divided by
games played). The format "requires exactly 4 players per court" per
Pickleheads' own guidance — no sit-out/uneven-count support is
described.

Sources: [How Pickleball Ladders Work on Pickleheads](https://www.pickleheads.com/guides/how-pickleball-ladders-work-on-pickleheads),
[How to Run a Pickleball Ladder on Pickleheads](https://www.pickleheads.com/guides/run-pickleball-ladder-pickleheads).

## Scope decisions (resolved via brainstorming, 2026-07-12)

- **Single-event only**, same as Gauntlet/Popcorn — no cross-tournament
  persistence.
- **Round 1 seeding**: random shuffle into courts (no rating system
  exists), same precedent as Popcorn/Gauntlet.
- **Movement**: after each round, both players on the winning team move
  up one court (capped at Court 1 — they stay if already there); both
  players on the losing team move down one court (capped at Court N —
  they stay if already there).
- **Team-split rule after movement**: every court's 4 arriving players
  for the next round always consist of exactly two prior-round teams
  (the winning team from the court below, and the losing team from the
  court above — or, at edge courts, the team that stayed plus the team
  arriving from the one adjacent court). Since a prior-round team's two
  members always move together, pairing one player from each of the
  two arriving teams per new team guarantees no partner repeats from
  the immediately preceding round, uniformly at every court including
  the two edges.
- **Round-by-round generation only** — same architectural necessity as
  Gauntlet: next round's court assignments depend on this round's
  actual results, so the whole schedule cannot be generated upfront.
  Only one round is generated per server-action call, and the next
  round can only be generated once every match in the current round is
  complete.
- **Scoring**: court-weighted points, not plain win count. A win at
  court K (out of N total courts, Court 1 = top) earns `N - K + 1`
  points (Court 1 win = N points, bottom-court win = 1 point). A loss
  earns 0 points. Standings are ranked by total points; ties are broken
  by average point differential (`(pointsFor - pointsAgainst) / gamesPlayed`).
- **No sit-out support**: the player count must be an exact multiple of
  4. This matches Pickleheads' own stated constraint for this format
  and avoids inventing an unvalidated rule for which court a returning
  sit-out player should rejoin at (a genuine ambiguity with no source
  material, unlike Popcorn/Gauntlet's simpler fair-rotation sit-out
  rule). The bracket page blocks generation with a clear message if the
  roster isn't a multiple of 4.
- **Teams page bypass**: same as Popcorn/Gauntlet — the manual "Pair
  Teams" UI is replaced with an info card, since Claim the Throne
  auto-generates every pairing.
- **Champion banner**: the top-ranked individual player by total ladder
  points (with the average-point-differential tiebreak already baked
  into the sort).

## Data model

Two changes:
- New migration: nullable `matches.court int` column, recording which
  ladder court a match was played on. Populated only for Claim the
  Throne matches (`stage: 'league'`, same as every other format); null
  for all other formats' matches.
- New migration: nullable `tournaments.claim_the_throne_rounds int`
  column, populated only when `format = 'claim_the_throne'` — mirrors
  `popcorn_rounds`/`gauntlet_rounds` exactly.

No other schema changes. Reuses `teams` (auto-created per unique
pairing, exactly like Popcorn/Gauntlet) and `matches` as-is aside from
the new `court` column.

## New types

In `apps/organizer-web/lib/types.ts`:

```typescript
export type ClaimTheThroneRoundResult = {
  court: number;
  teamAPlayerIds: [string, string];
  teamBPlayerIds: [string, string];
  scoreA: number;
  scoreB: number;
};

export type ClaimTheThronePairing = {
  court: number;
  teamAPlayerIds: [string, string];
  teamBPlayerIds: [string, string];
};

export type ClaimTheThroneStandingsRow = {
  playerId: string;
  wins: number;
  losses: number;
  ladderPoints: number;
  pointsFor: number;
  pointsAgainst: number;
};
```

`ClaimTheThronePairing` includes `court` (unlike `GauntletPairing`,
which has no persistent court identity) — court number is intrinsic to
this format's pairing, not just bookkeeping the caller tracks
separately, since the algorithm's movement logic is defined entirely
in terms of court numbers.

## The pairing/movement algorithm

New pure function `generateClaimTheThroneRound(playerIds: string[], previousRoundMatches: ClaimTheThroneRoundResult[], rng?: () => number): ClaimTheThronePairing[]`
in a new file `apps/organizer-web/lib/tournament/claimTheThrone.ts`.
Requires `playerIds.length` to be a positive multiple of 4 (throws
otherwise).

Let `numCourts = playerIds.length / 4`.

**Round 1** (`previousRoundMatches` is empty): shuffle `playerIds`,
assign the shuffled players to courts 1..`numCourts` in groups of 4 (in
shuffle order — court assignment itself is arbitrary since there's no
prior data to seed by skill), split each court's 4 into 2 teams (first
2 vs last 2 of that court's group), tag each pairing with its court
number.

**Round 2+**: for each match in `previousRoundMatches`, determine the
winning team (`scoreA > scoreB` → team A) and losing team, then:

- Winning team's next court = `Math.max(1, court - 1)`.
- Losing team's next court = `Math.min(numCourts, court + 1)`.

Group all *teams* (not individual players) by their computed next
court — every next-court bucket will always contain exactly 2 teams (4
players), because of the invariant that each court always sends
exactly one team up and receives exactly one team from below (or, at
edge courts, one team stays and one team arrives from the single
adjacent court). For each court's 2 arriving teams, cross-pair one
player from each team to form the two new teams for that court (e.g.
shuffle each arriving team's 2-player order, then pair index 0 with
index 0 and index 1 with index 1 across the two teams) — this
guarantees neither new team is identical to either arriving team, so
partners always split from the prior round.

Returns the flat list of `ClaimTheThronePairing` for just this one
round, each tagged with its court number.

## Standings

New pure function `computeClaimTheThroneStandings(matches: ClaimTheThroneRoundResult[], numCourts: number): ClaimTheThroneStandingsRow[]`,
added to `apps/organizer-web/lib/tournament/standings.ts` alongside
`computeStandings`/`computeIndividualStandings`. For each match,
credits both members of the winning team with `numCourts - match.court + 1`
ladder points and a win; credits both members of the losing team with
0 ladder points and a loss. Both sides accumulate `pointsFor`/
`pointsAgainst` from the actual game score. Sorted by `ladderPoints`
descending, tiebroken by average point differential
(`(pointsFor - pointsAgainst) / (wins + losses)`) descending.

This is a new function, not a variant of `computeIndividualStandings`,
because the sort key and scoring rule are fundamentally different
(court-weighted points vs. plain win count) — reusing that function
would require bolting on parameters that don't apply to any other
format.

## Server actions and pages

### Tournament creation

`apps/organizer-web/app/tournaments/new/page.tsx` adds a third "Number
of rounds (Claim the Throne only)" field, following the same
unconditionally-rendered pattern as the Popcorn/Gauntlet fields.
`createTournament` stores it as `claim_the_throne_rounds` only when
`format === 'claim_the_throne'`.

### Teams page

Extends the existing `isAutoPaired`/`isIndividualFormat`-style checks
to also cover `claim_the_throne`.

### Round generation

A new server action `advanceClaimTheThroneRound(tournamentId: string)`
in `bracket/actions.ts`: fetches `claim_the_throne_rounds` + all roster
`players`; if this is the first round, verifies `players.length % 4 === 0`
(throws a clear error otherwise) and calls `generateClaimTheThroneRound`
with empty `previousRoundMatches`; otherwise reconstructs
`ClaimTheThroneRoundResult[]` from the existing league matches
(resolving team IDs back to player-ID pairs and reading each match's
`court` value), calls `generateClaimTheThroneRound` with that history,
dedupes/reuses-or-creates `teams` rows via the same `pairKey` pattern
already used by Popcorn/Gauntlet, and inserts one `matches` row per
pairing for the new round number **and** its `court` value.

### Bracket page

Extends the existing per-format branching (mirroring Gauntlet's
"Generate Round 1" / "Generate Round N+1" two-button flow) to include
Claim the Throne, with the player-count gate checking
`playerCount % 4 === 0 && playerCount >= 4` instead of Gauntlet's
`playerCount >= 4` alone — showing a clear "needs to be a multiple of
4" message when it isn't.

### Standings page / Results page

Forks to render `computeClaimTheThroneStandings`'s output: columns for
Player, Ladder Points, W, L, Avg Diff (instead of the
wins/losses/point-diff columns used by team-based and other
individual-based formats). The champion banner names the top-ranked
individual player by ladder points.

### Public player page guard (in scope, one-line addition)

`apps/organizer-web/lib/tournament/formats.ts`'s shared
`isIndividualFormat()` predicate (added during Gauntlet's launch,
after that feature's whole-branch review caught the `/p/[id]` public
player page's "tournaments won" guard only covering Popcorn) must have
`'claim_the_throne'` added to its list. This is now a one-line addition
thanks to that shared helper, not a rediscovered bug — but it must not
be forgotten, since `/p/[id]`'s guard is the one place a missed format
silently reintroduces the mis-award bug this predicate exists to
prevent.

## Out of scope

- Cross-tournament ladder persistence (not applicable — single-event
  tournaments).
- Sit-out support for uneven player counts (explicit scope decision
  above — requires an exact multiple of 4).
- The remaining two still-unimplemented formats (Cream of the Crop, Up
  and Down the River) — separate future increments.
- No public-facing page (`/t/[id]`, `/p/[id]`) changes beyond the
  one-line `isIndividualFormat()` addition noted above.
- No UI for organizers to manually edit a generated round.
