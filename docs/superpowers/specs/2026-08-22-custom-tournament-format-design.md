# Custom Tournament Format — Design

Status: Approved.

## Goal

Add a "Custom Tournament" format where the organizer manually assigns
every matchup themselves — no algorithm auto-pairs teams. The organizer
sets a target round count at creation, then on the Bracket page adds
matches one at a time: pick a round number, pick Team A, pick Team B.

## Data

- New format value `custom` ("Custom Tournament") added to
  `TOURNAMENT_FORMATS` (`lib/tournament/formats.ts`) — NOT added to
  `INDIVIDUAL_FORMATS`, since teams are fixed partnerships (set up via
  the existing Roster/Teams pages, same as Round Robin).
- New nullable column `tournaments.custom_rounds integer` — the target
  round count, following the exact same pattern as
  `gauntlet_rounds`/`claim_the_throne_rounds`/etc. Set at creation,
  defaults to 5 if left blank (matching those formats' existing
  default).

## Creation

`tournaments/new/FormatFields.tsx` gets a new conditional block —
`{format === 'custom' && (...)}` — with a "Number of rounds (Custom
Tournament only)" number input (`name="customRounds"`, default 5, min
1), following the exact same pattern already used for
Popcorn/Gauntlet/Claim the Throne/Up and Down the River.
`createTournament` (`tournaments/new/actions.ts`) reads and stores it
as `custom_rounds`.

## Building the schedule

No auto-generate button for this format. Instead, the Bracket page
shows an "Add Match" form (visible whenever the tournament's format is
`custom`): a round-number input, and two team-select dropdowns (Team A,
Team B) populated from the tournament's existing teams — the exact
same team-select UI already used by `updateMatchTeams`'s "Save Teams"
form elsewhere on this page. Submitting inserts one `matches` row
(`stage: 'league'`, `status: 'pending'`) via a new `addCustomMatch`
server action. The organizer can add as many matches as they want, to
any round, in any order — repeating the form as many times as needed.

**Guard**: the action rejects (server-side) a submission where Team A
and Team B are the same team — a team can't play itself.

## Everything else is format-agnostic and needs no changes

- **Scoring**: the existing per-match score form
  (`enterScore` in `matches/actions.ts`) already works on any `matches`
  row regardless of format — Custom's matches use it unchanged.
- **Standings**: `computeStandings` already operates generically on
  whatever matches exist for a tournament — no format-specific logic to
  add.
- **Completion**: `isTournamentComplete` (`lib/tournament/completion.ts`)
  already has a generic branch for round-count-gated formats (checks
  all matches complete AND the max round reached equals the target) —
  `custom` joins that same branch alongside
  `gauntlet`/`claim_the_throne`/`up_and_down_the_river`/`league_playoffs`.
  `enterScore`'s `targetRounds` computation (which feeds that check)
  gets a matching `format === 'custom' ? (custom_rounds ?? 5) : ...`
  branch, mirroring the existing per-format ternary chain there.
- **Results, Roster, Teams pages**: already format-agnostic (they
  render whatever matches/teams exist) — no changes.

## Out of scope

- No auto-pairing algorithm of any kind for this format — that's the
  entire point.
- No per-round match-count limit — the organizer can add any number of
  matches to any round.
- No changes to any other existing format's behavior.
- No UI to edit/remove a match after adding it beyond what already
  exists (the existing "Save Teams" reassignment and score-entry forms
  already work on any match, Custom included).
