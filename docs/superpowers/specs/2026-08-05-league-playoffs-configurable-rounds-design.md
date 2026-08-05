# League + Playoffs Configurable Round Count — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Let the organizer run a League + Playoffs tournament with fewer rounds
than a full round-robin, when court time is limited. Today,
`generateBracket` always schedules every team against every other team
exactly once (a full round-robin: `teamCount - 1` rounds for an even
team count, `teamCount` rounds for an odd count with a bye). There is
no way to stop early. Top-4 playoffs (semis + final) are then derived
from however many rounds were actually played, using the existing
standings logic unchanged.

## Scope

Applies **only** to the `league_playoffs` format. Plain `round_robin`
and `double_header` keep their current unconditional full-schedule
"Generate League Bracket" button, unchanged.

## Why this is simpler than it looks

`generateRoundRobin` already tags every pairing with a `round` number,
and the round count it produces is already a pure function of team
count — it was never truly "fixed," just never exposed as choosable.
Because round-robin pairings don't depend on match results (unlike
Gauntlet, Claim the Throne, or Up and Down the River), the full
schedule can still be generated in one shot and then truncated to the
organizer's chosen round count. This means:

- **No changes to `lib/tournament/roundRobin.ts`** — `generateRoundRobin`
  is reused exactly as-is.
- **No new database column, no migration** — the chosen round count is
  a one-time input at generation time, not a value that needs to
  persist or drive later round-by-round logic (unlike the other four
  incrementally-generated formats). Once matches are inserted, the
  round count is implicit in how many rows exist; nothing downstream
  needs to remember what the organizer originally typed.
- **No changes to standings, completion detection, or semifinal/final
  generation** — `computeStandings`, `isTournamentComplete`, and
  `generateSemifinals` already operate generically on whatever league
  matches exist, regardless of how many rounds were scheduled.

## Where the organizer sets it

On the **Bracket page**, not the creation form — team count (and
therefore the maximum possible round count) isn't known until the
roster and team pairing are done, which happens after tournament
creation. The existing "{teamCount} teams ready. Generate a
round-robin league schedule." card, shown only for `league_playoffs`
with `teamCount >= 2`, gains a number input right there:

- **Default**: the full round-robin length for the current team count
  (`teamCount % 2 === 0 ? teamCount - 1 : teamCount`), computed
  server-side from the team count already available on this page.
- **Max**: capped at that same full-round-robin length — a round-robin
  has no more distinct pairings beyond it without repeating matchups,
  which this format doesn't support.
- **Min**: 1.
- **Validation**: the submitted value is silently clamped to
  `[1, fullRounds]` rather than rejected with an error — consistent
  with this app's existing low-friction style for round-count fields
  (e.g. Popcorn/Gauntlet/Claim the Throne/Up and Down the River's
  creation-form fields don't surface validation errors either, they
  just fall back to a safe default).

Round Robin and Double Header tournaments keep the plain, input-free
"Generate League Bracket" button exactly as it is today.

## Server action

`generateBracket(tournamentId: string, formData: FormData)` in
`bracket/actions.ts` gains a second parameter (Next.js Server Actions
bound via `.bind(null, id)` and used as a `<form action={...}>` already
receive the form's `FormData` as the final argument automatically —
no new plumbing needed for this). When `tournament.format ===
'league_playoffs'`, it reads the submitted round count, clamps it to
`[1, fullRounds]` (falling back to `fullRounds` if the field is
missing or not a number), and filters the pairings returned by
`generateRoundRobin` down to `pairing.round <= chosenRounds` before
inserting matches. For `round_robin` and `double_header`, the action's
behavior is completely unchanged — the full pairing list is inserted
exactly as it is today.

## Out of scope

- Plain Round Robin and Double Header formats — no round-count field
  added to either.
- Any change to semifinal/final generation, the completion gate, or
  standings computation — all three already work generically off
  whatever league matches exist.
- Persisting the chosen round count anywhere — it's a one-time input,
  not tracked after generation.
