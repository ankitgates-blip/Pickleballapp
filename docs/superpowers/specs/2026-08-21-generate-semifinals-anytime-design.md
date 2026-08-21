# Generate Semifinals From Any Point — Design

Status: Approved.

## Background

The just-shipped "Skip-to-Final Available Anytime" feature let the
organizer skip straight from wherever the league stands to the Final,
bypassing Semifinals entirely. This is a related but distinct need: the
organizer sometimes wants to move into the **normal** Semifinal → Final
flow early — stopping the league stage partway through (at their
discretion, any round, no minimum) rather than skipping the semifinal
stage itself.

## Goal

Make "Generate Semifinals" available at any point in a League +
Playoffs tournament with 4+ teams and no Semifinal/Final match yet —
regardless of how many league rounds have been played, including zero —
seeding the semifinal pairings from whatever standings exist at that
moment.

## Gate change

Today, "Generate Semifinals" requires `allLeagueComplete`. This drops
that requirement entirely:

- **"Generate Semifinals"** — new gate: `isLeaguePlayoffs &&
  semifinalMatches.length === 0 && !hasFinalMatch && teamCount >= 4`.
- **"Skip Semifinals — Go to Final"** — unchanged (already has this
  exact gate, from the prior feature).

Both buttons now share the identical condition, so they always appear
together once a tournament has 4+ teams and hasn't moved into the
playoff stage yet — no matter how many rounds have been scored. The
card's copy will note when standings are based on partial data, purely
for clarity — nothing is gated on league completeness anymore.

## Picking semifinalists from partial or zero data

`generateSemifinalMatches` gets the identical fallback
`skipToFinalMatch` already has: fetch the tournament's teams, pad any
team with zero completed league matches to a 0-0 record via the
existing `fillStandingsGaps`, then feed the padded (always ≥ `teamCount`
rows) list into the existing `generateSemifinals` pairing function
(`#1` vs `#4`, `#2` vs `#3`). This works identically whether 0 rounds or
every round has been played.

## Guard against duplicate playoff matches

`skipToFinalMatch` already rejects (server-side) if a Semifinal or Final
match already exists for the tournament — added in an earlier final
review as a defense against stale pages/double-clicks.
`generateSemifinalMatches` never got that same guard (a pre-existing gap
noted but not fixed at the time, since it wasn't new code then). Since
this function becomes reachable across a much wider window now, this
adds the identical existence-check guard to `generateSemifinalMatches`
too.

## Unplayed rounds

Left untouched — same as the prior feature. No auto-cancellation, no
deletion. Rounds that were never played simply become irrelevant once
the tournament has moved to the Semifinal stage.

## Out of scope

- No per-round "skip this specific round" control — the mechanism is
  "stop generating semifinals whenever you choose," not marking
  individual future rounds as skipped.
- No confirmation dialog, no minimum-rounds-played threshold.
- No change to "Skip Semifinals — Go to Final" itself.
