# Up and Down the River Format — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Make the "Up and Down the River" tournament format generate a working
ladder-of-courts schedule where individual players (not fixed teams)
move up or down a court based on their own performance, partners
rotate every round, and the court-weighted point system (shared with
Claim the Throne) decides the champion. This is the fourth of the six
originally-unimplemented formats to ship (after Popcorn, Gauntlet, and
Claim the Throne); Cream of the Crop remains the last future increment.

## Research basis

Pickleheads' Up and Down the River: a seeded high-low ladder format for
larger mixed-skill groups. "Players play once with every other player
on their court, then move up or down based on results" — individual
performance drives movement, not team win/loss as a unit. Works with
4-5 players per court in the real product (mixed sizes allowed on
uneven nights) and typically runs 2-3 rounds per session. Up and Down
the River, Claim the Throne, and Cream of the Crop share the same
court-weighted point scoring system.

Sources: [How Pickleball Ladders Work on Pickleheads](https://www.pickleheads.com/guides/how-pickleball-ladders-work-on-pickleheads),
[How to Run a Pickleball Ladder on Pickleheads](https://www.pickleheads.com/guides/run-pickleball-ladder-pickleheads).

## Scope decisions (resolved via brainstorming, 2026-07-13)

- **Court size**: always exactly 4 players (a positive multiple of 4
  required for the roster) — same constraint as Claim the Throne, not
  Pickleheads' mixed 4-5 flexibility, to stay consistent with every
  format already shipped and avoid designing a second, unvalidated
  court-size rule.
- **One game per round per court**, then movement — same cadence as
  Claim the Throne, not multiple games per court before moving.
- **Round count**: organizer-configurable, same convention as every
  other format.
- **Movement is individual, not team-level**: after a match, both
  teammates share the same team score, so ranking "all 4 players
  individually by points scored" ties each pair. The winning pair is
  tied for individual rank 1-2; the losing pair is tied for rank 3-4.
  The tie is broken by **cumulative record entering that round**
  (wins, then point differential, from all rounds strictly before the
  one just played): within the winning pair, whoever has the better
  cumulative record moves up a court; their partner stays. Within the
  losing pair, whoever has the worse cumulative record moves down;
  their partner stays. Movement is capped the same way as Claim the
  Throne (Court 1 winners stay instead of moving up; bottom-court
  losers stay instead of moving down).
- **Team-split rule for the next round**: at a typical (non-edge)
  court, the next round's 4 arrivals are exactly 2 "stayed" players
  (who were on opposing teams last round, so pairing them is a fresh
  partnership) + 1 "rose" player (arrived from the court below) + 1
  "fell" player (arrived from the court above). These have zero
  partner history with each other, so the convention is: the 2 stayed
  players become one team, the rose + fell players become the other.
- **Edge-court wrinkle (a precise, not just best-effort, no-repeat
  rule)**: at Court 1 and the bottom court, the player who "would"
  move up/down has nowhere to go and stays instead, so that court ends
  up with **3 stayed players + 1 new arrival**, not the clean 2-and-2
  split. Critically, exactly 2 of those 3 stayed players were partners
  in the match just played (the capped mover plus their teammate who
  wasn't selected to move — both from the same team), and the 3rd
  stayed player is a "loner" whose own partner did leave. The rule:
  split the two known-partners onto different teams; the loner and
  the new arrival each join one side (whichever split is chosen via
  the injected `rng`). This guarantees zero repeated partnerships even
  at edge courts, not merely a best-effort minimization.
- **Degenerate single-court case** (exactly 4 players, `numCourts = 1`):
  movement is capped in both directions every round, so all 4 players
  always "stay" — but the two match-defined team pairs from the round
  just played are still both intact among the 4 stayers. The rule
  generalizes: cross-pair the two existing partnerships onto new
  teams (either of the two valid cross-splits, chosen via `rng`).
- **Scoring**: identical to Claim the Throne — a win at court K (of N
  total courts, Court 1 = top) earns `N - K + 1` points; standings
  rank by total ladder points, tiebroken by average point differential.
  `computeClaimTheThroneStandings` is reused directly (not duplicated),
  since the scoring math is genuinely identical between the two
  formats per Pickleheads' own documentation.
- **Round-by-round generation only**, same architectural necessity as
  Gauntlet/Claim the Throne: next round's court assignments depend on
  this round's actual results (specifically, the cumulative-record
  tiebreak requires knowing every prior round's outcomes), so the
  whole schedule cannot be generated upfront.
- **Teams page bypass, champion banner**: same pattern as every other
  individual-based format already shipped.

## Data model

One new migration: nullable `tournaments.up_and_down_the_river_rounds int`
column, populated only when `format = 'up_and_down_the_river'` — mirrors
`claim_the_throne_rounds` exactly. **No new `matches` column is needed**
— the existing `matches.court int` column (added for Claim the Throne)
is reused as-is, since this format also tags every match with which
ladder court it was played on.

## New types

In `apps/organizer-web/lib/types.ts`:

```typescript
export type UpAndDownRiverRoundResult = {
  round: number;
  court: number;
  teamAPlayerIds: [string, string];
  teamBPlayerIds: [string, string];
  scoreA: number;
  scoreB: number;
};

export type UpAndDownRiverPairing = {
  court: number;
  teamAPlayerIds: [string, string];
  teamBPlayerIds: [string, string];
};
```

Unlike `ClaimTheThroneRoundResult` (which only ever needs the single
most recent round, since court position alone encodes standing),
`UpAndDownRiverRoundResult` includes a `round` field — the cumulative-
record tiebreak requires the full round history, not just the latest
round. `UpAndDownRiverRoundResult` is structurally a superset of
`ClaimTheThroneRoundResult` (same fields plus `round`), so an array of
it can be passed directly into `computeClaimTheThroneStandings`
without any adapter — that function only reads `court`/team IDs/scores,
which are all present.

## The pairing/movement algorithm

New pure function `generateUpAndDownRiverRound(playerIds: string[], previousRounds: UpAndDownRiverRoundResult[], rng?: () => number): UpAndDownRiverPairing[]`
in a new file `apps/organizer-web/lib/tournament/upAndDownTheRiver.ts`.
Requires `playerIds.length` to be a positive multiple of 4 (throws
otherwise, matching Claim the Throne's convention).

Let `numCourts = playerIds.length / 4`.

**Round 1** (`previousRounds` is empty): identical to Claim the
Throne's round 1 — shuffle `playerIds`, assign to courts 1..`numCourts`
in groups of 4, split each court's 4 into 2 teams (first 2 vs last 2
of that court's shuffled group).

**Round 2+**:

1. Let `currentRound = max(r.round for r in previousRounds)`. Only the
   matches with `r.round === currentRound` determine this round's
   movement.
2. Compute each player's cumulative record from rounds **strictly
   before** `currentRound` (wins, and point differential for the
   tiebreak) — this is their standing "entering" the round just
   played, not including its own result.
3. For each match at `currentRound`: determine the winning team
   (`scoreA > scoreB`) and losing team. Within the winning team's 2
   players, whichever has the better prior cumulative record (more
   wins, then better point differential) is the "mover-up"; the other
   is a "stayer". Within the losing team's 2 players, whichever has
   the worse prior cumulative record is the "mover-down"; the other is
   a "stayer". Ties in the prior record itself (e.g., both entered the
   round with identical records) are broken via `rng`.
4. Compute destinations: mover-up's next court is `Math.max(1, court - 1)`;
   mover-down's next court is `Math.min(numCourts, court + 1)`; both
   stayers remain at `court`.
5. Group all players by their computed next court. Within each
   destination court's group of 4, determine which pairs (if any) were
   partners in the match just played at `currentRound` (i.e., were on
   the same team together):
   - **Zero known pairs** (the normal middle-court case: 2 stayers who
     were on opposing teams + 1 mover-up arrival + 1 mover-down
     arrival): team the 2 stayers together, team the 2 arrivals
     together.
   - **Exactly one known pair** (the edge-court case: 3 stayers + 1
     arrival, where 2 of the 3 stayers were teammates and the 3rd is a
     "loner" whose partner left): split the known pair onto different
     teams; the loner and the new arrival each join one side (the
     specific split chosen via `rng`).
   - **Exactly two known pairs** (the degenerate single-court case: 4
     stayers, both of the round-just-played's team pairs are still
     intact among them): cross-pair — split each known pair across the
     two new teams (either valid cross-split, chosen via `rng`).

Returns the flat list of `UpAndDownRiverPairing` for just this one
round, each tagged with its court number.

## Standings

No new function. `computeClaimTheThroneStandings` (from Claim the
Throne, in `apps/organizer-web/lib/tournament/standings.ts`) is reused
directly, since `UpAndDownRiverRoundResult[]` satisfies its parameter
type (`ClaimTheThroneRoundResult[]`) structurally.

## Server actions and pages

### Tournament creation

Adds a fourth "Number of rounds (Up and Down the River only)" field to
`apps/organizer-web/app/tournaments/new/page.tsx`, following the same
unconditionally-rendered pattern as the other three formats' fields.
`createTournament` stores it as `up_and_down_the_river_rounds` only
when `format === 'up_and_down_the_river'`.

### `isIndividualFormat` extension

Add `'up_and_down_the_river'` to the shared `INDIVIDUAL_FORMATS` array
in `lib/tournament/formats.ts` — this alone extends the Teams page
bypass and the `/p/[id]` "tournaments won" guard, exactly as it did for
Claim the Throne (no edits needed to either of those files themselves).

### Round generation

A new server action `advanceUpAndDownRiverRound(tournamentId: string)`
in `bracket/actions.ts`: fetches `up_and_down_the_river_rounds` + all
roster `players`; validates `players.length % 4 === 0` (clear error
otherwise); fetches ALL existing league matches (not just the latest
round, unlike Claim the Throne, since the tiebreak needs full history)
and reconstructs `UpAndDownRiverRoundResult[]` (resolving team IDs back
to player-ID pairs, keeping each match's `round` and `court`); calls
`generateUpAndDownRiverRound`; dedupes/reuses-or-creates `teams` rows
via the same `pairKey` pattern already used by every other individual
format; inserts one `matches` row per pairing for the new round number
and its `court` value.

### Bracket page

Extends the existing per-format branching (mirroring Claim the
Throne's two-button "Generate Round 1" / "Generate Round N+1" flow),
with the same `playerCount % 4 === 0 && playerCount >= 4` gate.

### Completion detection

`isTournamentComplete` (in `lib/tournament/completion.ts`) must have
`up_and_down_the_river` added to the SAME round-count-gated branch that
already covers `gauntlet` and `claim_the_throne` (that branch was
generalized during Claim the Throne's launch specifically so the next
incrementally-generated format would be a one-line addition — this is
that addition). `matches/actions.ts`'s `enterScore` must also fetch
`up_and_down_the_river_rounds` and include it in the `targetRounds`
ternary alongside the other two formats.

### Standings page / Results page

Both pages already fork into a "ladder points" branch for Claim the
Throne (Ladder Pts/W/L/Avg Diff columns, `computeClaimTheThroneStandings`
data). Extend the `isClaimTheThrone` check on both pages into a
combined `isLadderFormat = isClaimTheThrone || isUpAndDownRiver` used
everywhere that branch currently checks `isClaimTheThrone` alone — no
new columns or rendering logic needed, since the data shape and scoring
are identical. The champion banner's existing 3-way priority
(`isClaimTheThrone` → `isIndividualFormat` → `undefined`) becomes a
4-way check with `isLadderFormat` in place of `isClaimTheThrone`.

## Out of scope

- Cream of the Crop — the one remaining unimplemented format, a
  separate future increment.
- Pickleheads' mixed 4-5-player court sizes (explicit scope decision
  above — requires an exact multiple of 4).
- No public-facing page (`/t/[id]`, `/p/[id]`) changes beyond the
  `isIndividualFormat()` one-line addition noted above.
- No UI for organizers to manually edit a generated round.
