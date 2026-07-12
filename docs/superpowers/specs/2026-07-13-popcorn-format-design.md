# Popcorn Format — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Make the "Popcorn" tournament format actually generate a working
multi-round schedule with rotating partners and individual standings,
instead of showing the current "coming soon" message. This is the
architecturally hardest of the six unimplemented formats (Popcorn, Up
and Down the River, Gauntlet, Claim the Throne, Cream of the Crop —
the rest remain future increments), since it's the first one where
players don't have fixed teams for the whole event.

## Scope decisions (resolved via brainstorming, 2026-07-13)

- **Round count**: the organizer picks a number of rounds when creating
  the tournament (not fixed, not auto-computed).
- **Repeat avoidance**: the schedule generator actively tries to avoid
  repeating a partner or opponent pairing someone has already had,
  falling back to allowing repeats only once reasonable alternatives
  are exhausted. This is a best-effort heuristic, not a guarantee — it
  checks reasonably-sized groupings for the best fit each round rather
  than solving a perfect combinatorial optimization.
- **Uneven player counts**: when the player count isn't a multiple of
  4, the players who sit out each round are chosen from whoever has sat
  out the fewest times so far, so sit-outs rotate fairly across the
  whole session.
- **Individual standings**: since partners rotate, standings are
  computed per **individual player** (win/loss/points), not per team —
  reusing the existing `teams`/`matches` schema underneath (teams are
  just auto-generated per unique pairing rather than organizer-picked),
  but aggregating results by player for display.
- **Champion banner**: the results page still shows a "🏆 Champion"
  banner, naming the single top-ranked individual player instead of a
  team pairing.
- **Teams page bypass**: for Popcorn tournaments, the existing manual
  "Pair Teams" page is replaced with an informational message — Popcorn
  auto-generates every pairing as part of schedule generation, so there
  is nothing to manually pair.

## Data model

New migration: nullable `tournaments.popcorn_rounds int` column,
populated only when `format = 'popcorn'`.

No other schema changes. Popcorn reuses `teams` (auto-created rather
than organizer-created) and `matches` (`stage: 'league'`, same as Round
Robin) exactly as-is.

## New types

In `apps/organizer-web/lib/types.ts`:

```typescript
export type PopcornPairing = {
  round: number;
  teamAPlayerIds: [string, string];
  teamBPlayerIds: [string, string];
};

export type IndividualStandingsRow = {
  playerId: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
};
```

## The scheduling algorithm

New pure function `generatePopcornSchedule(playerIds: string[], numRounds: number): PopcornPairing[]`
in a new file `apps/organizer-web/lib/tournament/popcorn.ts`.

Requires at least 4 players (throws otherwise, matching the existing
`generateRoundRobin`'s error-on-too-few-teams pattern).

For each round from 1 to `numRounds`:

1. **Sit-outs**: `playerCount % 4` players sit out this round. Chosen
   from whoever has the lowest cumulative sit-out count so far (ties
   broken by shuffling), and their sit-out count is incremented.
2. **Grouping into courts of 4**: the remaining players (always a
   multiple of 4) are split into groups of 4, preferring groupings that
   minimize repeated partner/opponent pairings based on history
   accumulated so far in the schedule.
3. **2v2 split within each group of 4**: of the three possible splits
   for a group of 4 people, pick whichever creates the fewest repeated
   partnerships.
4. **History tracking**: record the round's partnerships and
   opponent-ships so later rounds keep improving on variety.

Returns a flat list of pairings (one entry per court-match across all
rounds), matching the existing `RoundRobinPairing[]`-style flat-list
convention already used elsewhere in this codebase.

## Individual standings

New pure function `computeIndividualStandings(matches: MatchResult[], teams: Team[]): IndividualStandingsRow[]`,
added to the existing `apps/organizer-web/lib/tournament/standings.ts`
(alongside `computeStandings`, which it parallels). For each complete
match, looks up both teams' two players via the `teams` array, and
credits the match's win/loss and points to **both individual players**
on each side (rather than to the team as a unit) — since a player
appears under many different auto-generated team IDs across the event,
crediting individually is what produces meaningful standings. Sorted
the same way as `computeStandings` (wins descending, then point
differential descending).

## Server actions and pages

### Tournament creation

`apps/organizer-web/app/tournaments/new/page.tsx` adds a "Number of
rounds" number input (optional, default 5) to the existing form — shown
unconditionally for simplicity (avoids introducing client-side
show/hide logic into what's currently a plain server-rendered form),
but `apps/organizer-web/app/tournaments/new/actions.ts`'s
`createTournament` only stores it (as `popcorn_rounds`) when
`format === 'popcorn'`; otherwise it's stored as `null`.

### Teams page

`apps/organizer-web/app/tournaments/[id]/teams/page.tsx` adds
`isPopcorn = tournament.format === 'popcorn'`. When true, the entire
manual pairing UI (shuffle button, pair-by-select form, teams list) is
replaced with an info card: "Popcorn auto-generates partners each round
— head to Bracket to generate the schedule."

### Bracket generation

A new server action (separate from the existing team-based
`generateBracket`, since the data flow differs materially — it starts
from `players`, not pre-paired `teams`) fetches the tournament's
`popcorn_rounds` and all roster players, calls
`generatePopcornSchedule`, then for every unique 2-player pairing
needed across the whole schedule: looks up whether a `teams` row
already exists for that exact pair (in either player order) for this
tournament, reusing it if so, creating it if not. Once every pairing
has a resolved team ID, inserts one `matches` row per `PopcornPairing`
(`stage: 'league'`, `status: 'pending'`), exactly like Round Robin's
existing insert pattern.

### Bracket page

Popcorn added to the supported-formats check
(`apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`), reusing
the existing round-grouped match list rendering as-is (it already
works generically off `round` + team names, regardless of whether
`teams` rows are organizer-picked or auto-generated).

### Standings page

`apps/organizer-web/app/tournaments/[id]/standings/page.tsx` forks on
format: Popcorn tournaments render `computeIndividualStandings`'s
output (player names, one row per individual) instead of the existing
team-based table.

### Results page

`apps/organizer-web/app/tournaments/[id]/results/page.tsx` forks
similarly for the standings table, and the "Champion" banner names the
top individual player (`computeIndividualStandings(...)[0]`) instead of
a team pairing, when the format is Popcorn.

## Out of scope

- The other four still-unimplemented formats (Gauntlet, Up and Down the
  River, Claim the Throne, Cream of the Crop) — separate future
  increments.
- No changes to `isTournamentComplete` or score entry — both already
  work generically off match rows regardless of format.
- No public-facing page (`/t/[id]`, `/p/[id]`) changes in this
  increment — if needed, a follow-up once the organizer-facing flow is
  proven out.
- No UI for organizers to manually override/edit the generated
  schedule — the schedule, once generated, is final (matching how Round
  Robin/Double Header brackets already work today).
