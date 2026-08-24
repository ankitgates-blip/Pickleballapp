# Custom Tournament Format — Auto-Generate & Remove Match — Design

Status: Approved.

## Background

The Custom Tournament Format (`docs/superpowers/specs/2026-08-22-custom-tournament-format-design.md`) shipped as purely manual: the organizer adds every match one at a time via a round/Team A/Team B form on the Bracket page. That spec explicitly scoped out two things: "no auto-pairing algorithm of any kind" and "no UI to edit/remove a match after adding it." This spec reverses both, based on real usage — organizers want the option to auto-generate a round's pairings while still being able to add rounds manually, and need to be able to undo a match added with the wrong team.

## Goal

Add, to the Custom format only, on the Bracket page:

1. An **"Auto-generate Round N"** button that fairly pairs teams for the next round, ensuring exactly one team sits out when the team count is odd (zero when even), rotating who sits out and who's already played whom based on the tournament's actual match history — whether that history came from manual adds, prior auto-generates, or a mix of both.
2. A **standby display** ("Sitting out: X") for any round with an unpaired team, whether that round was built manually or automatically — reusing the same derived pattern Popcorn/Gauntlet already use.
3. A **"Remove"** action on any pending (not yet scored) match, manual or auto-generated, that hard-deletes it. Blocked once the match has a score.
4. A **coverage hint** showing how many rounds a full round-robin (everyone plays everyone once) needs for the current team count — informational only, never blocking. Auto-generate keeps working past that point, falling back to rematches (least-recently-played first).

## Data

No new columns. Everything is derived from the existing `matches` and `teams` tables at generation time — this is what makes manual/auto interleaving work correctly: each auto-generate call recomputes "who's played whom" and "who's sat out how many times" fresh from whatever rows actually exist, regardless of how they got there.

## Algorithm — `computeCustomAutoRound`

New pure function, `lib/tournament/customAuto.ts`, following the same shape as the existing per-format scheduling functions (`popcorn.ts`, `gauntlet.ts`).

```ts
type CustomAutoTeam = { id: string };
type CustomAutoMatch = { round: number; teamAId: string; teamBId: string };

function computeCustomAutoRound(
  teams: CustomAutoTeam[],
  existingMatches: CustomAutoMatch[], // every match in the tournament so far, any round, any source
  targetRound: number
): { teamAId: string; teamBId: string }[]
```

Steps:

1. **Sit-out counts**: for each team, count how many *prior* rounds (1..targetRound-1) it does not appear in any match, among rounds that have at least one match recorded (a round with zero matches recorded isn't counted — it just hasn't been built yet). This mirrors the derived sit-out logic already used for Popcorn/Gauntlet's display (`bracket/page.tsx`'s `sitOutNamesByRound`), reused here as an algorithm *input* rather than only a display value.
2. **Choose this round's sit-out(s)**: `teams.length % 2` teams sit out — the ones with the *lowest* sit-out count so far. Ties broken by the team's position in the `teams` array as passed in by the caller (the caller fetches teams ordered by `created_at`, same convention used elsewhere in this codebase — e.g. `players` queries — so this is stable and meaningful, not an arbitrary UUID sort).
3. **Played-pairs set**: build the set of team-id-pair keys that have already faced each other, from `existingMatches`, regardless of round, plus — for the rematch fallback — the highest `round` number each pair last met in.
4. **Greedy pairing** of the remaining (non-sit-out) teams, processed in their input-array order: take the first not-yet-paired team, and pair it with whichever other not-yet-paired team it has met the *fewest* times (0 first — i.e. never played); if several candidates tie on meeting count, pick the one that met it *least recently* (lowest last-met round number; teams that have never met sort before any that have); if still tied, pick whichever candidate comes first in the input array. Repeat until every team is paired. This single rule handles both cases from the design: preferring fresh pairings while any exist, and falling back to least-recent rematches once they don't.
5. Return the resulting pairs as `{ teamAId, teamBId }[]`.

**Determinism**: given the same teams + match history, this always produces the same round — makes it fully unit-testable without mocking randomness.

**Full-coverage round count** (for the informational hint, also just a small pure helper alongside this function): odd team count → `teamCount` rounds; even → `teamCount - 1` rounds (standard round-robin arithmetic).

## Server actions (`bracket/actions.ts`)

- **`autoGenerateCustomRound(tournamentId, round)`**: loads the tournament (format check: must be `custom`; score-lock check via `canEditScore`, same guard `addCustomMatch` already uses), loads current teams + all existing matches, calls `computeCustomAutoRound`, inserts the resulting rows (`stage: 'league'`, `status: 'pending'`) — same insert shape as `addCustomMatch`. If the round already has any matches, reject (a round is either built manually, or via one auto-generate call, not both re-triggered — re-running would duplicate matches; the organizer can manually add more into a round instead, that path already supports it).
- **`removeCustomMatch(tournamentId, matchId)`**: same format + score-lock guards, then deletes the one match row — but only if `status !== 'complete'` (i.e. no score recorded); otherwise throws a clear error ("Remove is only available before a score is entered — edit the score instead, or use Skip.").

## UI changes (`bracket/page.tsx`, Custom format only)

- **Auto-generate button**: new form/button beside the existing "Add Match" card, styled with `actionCardClass` (matching every other format's generate/skip buttons). Label: "Auto-generate Round N" where N is `currentCustomMaxRound + 1` (same round-tracking variable the page already computes for the "Add Match" form's default).
- **Standby line**: extend the existing `showSitOuts` condition (`isPopcorn || isGauntlet`) to also include `isCustom` — the derived sit-out computation is format-agnostic already, so this is a one-line change plus reusing the existing render block.
- **Remove button**: added next to the existing "Skip this match" control inside each match's `<details>` panel, but only rendered when `format === 'custom' && match.status === 'pending'`. A confirming label via `SaveButton`'s pending state ("Removing…"), same pattern as every other destructive action on this page.
- **Coverage hint**: small text under the "Add Match" card header, e.g. "Full round-robin needs 5 rounds for 5 teams" — computed from the full-coverage helper, always visible, never blocks anything.

## Error handling

- Auto-generate on a round that already has matches → rejected with a clear message pointing at manual add instead.
- Auto-generate with fewer than 2 teams → rejected (mirrors existing "need at least 2 teams" guards elsewhere on this page).
- Remove on a scored match → rejected with the message above.
- Both actions respect the existing score-lock (`canEditScore`) guard, same as every other mutating action on this page.

## Testing

- `lib/tournament/customAuto.test.ts`: odd team count (1 sits out, rotates fairly across multiple sequential calls), even team count (nobody sits out), avoiding rematches while fresh pairs remain, falling back to least-recently-played rematch once coverage is exhausted, and — the key scenario motivating this feature — correctly reading a *mix* of manually-added and auto-generated prior rounds (manual round leaves a team unpaired, next auto-generate call gives that team priority to play and picks a different sit-out).
- Server action tests follow the existing pattern for `addCustomMatch`/`skipMatch` (guard checks: wrong format, locked scores, round-already-built, scored-match-removal-blocked).

## Out of scope

- No changes to any other format's behavior.
- No bulk "remove whole round" action — removal is per-match, matching what was asked for.
- No UI to reorder rounds or move a match between rounds (already covered by the existing "Save Teams" reassignment for team changes; round changes aren't part of this ask).
- No randomization/shuffle option distinct from the deterministic fairness algorithm above — one auto-generate behavior, not a choice of strategies.
