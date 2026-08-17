# League + Playoffs Round-by-Round Generation — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Change League + Playoffs from generating its entire N-round schedule
in one shot to revealing it one round at a time — the organizer picks
the total round count once (as today), but only Round 1's matches are
created initially; Round 2 appears only once Round 1 is fully scored,
and so on until all N rounds are done. This replaces the "Configurable
Round Count" feature shipped earlier today, which generated the full
truncated schedule upfront.

## Why

A round-robin schedule is fully determined by the team list alone — it
doesn't depend on match results, unlike Gauntlet, Claim the Throne, or
Up and Down the River. That's exactly why the earlier feature could
generate the whole (truncated) schedule in one shot. But the organizer
wants the workflow itself to match the other three formats: deal with
one round at a time, not see the whole schedule dumped on screen at
once.

## Scope

Applies only to `format === 'league_playoffs'`. `round_robin` and
`double_header` keep generating their full schedule in one shot via
the existing `generateBracket`, completely unchanged.

## The critical correctness detail: stable team ordering

`generateRoundRobin`'s pairing algorithm is order-dependent — it
rotates from a fixed starting array (`fixed = ids[0]; rotating =
ids.slice(1)`), so the same team-ID list in a different order produces
a *different* schedule. The existing one-shot `generateBracket`
computes the schedule exactly once per tournament, so it never needed
to worry about this. Round-by-round generation recomputes the full
schedule on every call (see below) and must always agree with itself,
so every call fetches teams **ordered by `id`** — a stable,
deterministic order that doesn't depend on insertion order or
whatever unordered order Postgres happens to return.

## Data model

One new migration: nullable `tournaments.league_playoffs_rounds int`
column. Same shape as `gauntlet_rounds` / `claim_the_throne_rounds` /
`up_and_down_the_river_rounds`, but populated differently: those three
are set at tournament **creation** time (round count is independent of
team count for those formats); `league_playoffs_rounds` is set at
**Round-1-generation** time on the Bracket page, since the round-count
field's default/max depend on team count, which isn't known until
teams are paired.

## New server action

`advanceLeaguePlayoffsRound(tournamentId: string, formData?: FormData)`
in `bracket/actions.ts`, replacing `generateBracket`'s current
`league_playoffs`-specific truncation branch (which is deleted —
`generateBracket` itself keeps its `round_robin`/`double_header`
handling exactly as it is today, untouched).

Behavior:

1. Fetch teams for the tournament, **ordered by `id`**.
2. Fetch existing league-stage matches to determine `currentRound =
   max(round)` if any exist, else `0`.
3. **First call** (`currentRound === 0`, no league matches yet): read
   `rounds` from `formData`, compute `fullRounds` the same way as
   today (`teamCount % 2 === 0 ? teamCount - 1 : teamCount`), clamp to
   `[1, fullRounds]` using the exact same logic already shipped today
   (treating an absent/empty field as "use `fullRounds`", not `0`).
   Update `tournaments.league_playoffs_rounds` to the clamped value.
   Compute the full round-robin schedule via the unmodified
   `generateRoundRobin(orderedTeamIds)`, filter to `round === 1`,
   insert those matches.
4. **Later calls** (`currentRound >= 1`): read the already-stored
   `league_playoffs_rounds` (this call ignores `formData` — the
   "Generate Round X+1" button submits no fields, mirroring the other
   three formats). Recompute the full schedule from the same
   ordered team list, filter to `round === currentRound + 1`, insert
   those matches.
5. Both paths use the file's existing `revalidatePath` call, unchanged
   from `generateBracket`'s current ending.

No result-history reconstruction is needed (unlike Gauntlet/Claim the
Throne/Up and Down the River) — the schedule is a pure function of the
ordered team list, not of prior results.

## Bracket page

Replaces the current single "Generate League Bracket" card (with the
round-count input, shown whenever `teamCount >= 2` and no league
matches exist) with the same two-card pattern already used for the
other three round-by-round formats:

- **No league matches yet, `teamCount >= 2`**: a card showing
  "{teamCount} teams ready. Generate Round 1 of N." with the
  round-count input (same default/max/label copy as today) and a
  "Generate Round 1" button, bound to `advanceLeaguePlayoffsRound`.
- **Current round complete, more rounds remain**: a card showing
  "Round X complete. Generate Round X+1 of N." with a "Generate Round
  X+1" button, gated on `currentRound < league_playoffs_rounds` —
  computed the same way the other three formats' equivalent booleans
  are (`currentRound = max(leagueMatches.map(round))`,
  `currentRoundComplete = currentRoundMatches.length > 0 &&
  currentRoundMatches.every(status === 'complete')`).
- The `teamCount < 2` error card for League + Playoffs stays exactly
  as it is today.

## The completion-gate fix

Two places currently treat "all *currently existing* league matches
complete" as equivalent to "the whole league is done," which stops
being true once matches are revealed incrementally:

1. **`showGenerateSemifinals`** (Bracket page): currently `isLeaguePlayoffs
   && allLeagueComplete && semifinalMatches.length === 0 && teamCount
   >= 4`. Gains `&& currentRound >= (tournament?.league_playoffs_rounds
   ?? fullRounds)` so semifinals can't be offered after Round 1 alone
   just because Round 1 happened to be fully scored.
2. **`isTournamentComplete`** (`lib/tournament/completion.ts`): the
   `teamCount >= 4` branch already correctly waits for the final
   match regardless of round count, so it needs no change. But for
   `teamCount < 4` (no playoff stage — league standings alone decide
   the champion), completion currently falls through to the generic
   `allComplete` check at the end of the function, with no round-count
   awareness at all. `league_playoffs` needs to be added to the
   same round-count-gated branch that already covers `gauntlet` /
   `claim_the_throne` / `up_and_down_the_river` — but **only when
   `teamCount < 4`**, since for `teamCount >= 4` the existing
   final-match check must keep taking priority (unchanged). This is
   the exact bug class that hit Gauntlet's `/p/[id]` page and Claim
   the Throne's completion gate earlier this project — being fixed
   proactively this time, before it ships, not reactively after.
   `matches/actions.ts`'s `enterScore` needs its `targetRounds`
   ternary extended with a `league_playoffs` branch reading
   `league_playoffs_rounds`, mirroring the other three.

## Out of scope

- `round_robin` and `double_header` — untouched, still one-shot.
- Any change to `generateSemifinals`, `generateFinalMatch`, or
  `computeStandings` — all three already work generically off whatever
  league matches exist once the round-count gate above ensures they're
  only invoked at the right time.
- Any change to the round-count field's UI copy, default, or max —
  those stay exactly as shipped in the earlier "Configurable Round
  Count" feature, just moved from a one-shot form into the first of
  the two round-by-round cards.
