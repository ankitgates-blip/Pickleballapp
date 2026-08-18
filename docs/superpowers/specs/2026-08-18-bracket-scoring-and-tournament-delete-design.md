# Bracket Match Display/Scoring + Completed-Tournament Deletion — Design

Status: Approved, pending spec review before implementation plan.

This spec covers two small, independent features requested together:
1. The Bracket page's match list shows who won/lost and lets the organizer
   enter scores inline, without leaving the page.
2. A completed tournament can be deleted from the dashboard, the same way
   an upcoming one already can be.

They touch entirely different files with no shared logic, so they're
specified together here but will be separate tasks in the implementation
plan.

## Feature 1: Bracket page match display + inline score entry

### Goal

Right now, the Bracket page's match list (`renderMatchList` in
`apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`, shared by the
League round cards, the Semifinals card, and the Final card) just shows
"Team A vs Team B" with no score, no winner indication, and no way to enter
a score without navigating to the separate `/matches` page. This adds both,
directly in the bracket view.

### Design

**Winner/loser display**, reusing the existing convention already
established on the Results page (`renderMatch` in
`apps/organizer-web/app/tournaments/[id]/results/page.tsx`, which is *not*
modified by this spec — only its visual convention is reused as a pattern
for the Bracket page):

- **League and Semifinal matches**: once complete, the winning team gets
  **(W)** appended after its name; the losing team gets **(L)**. No trophy
  emoji for these stages.
- **Final match only**: once complete, the winning team gets the same 🏆 +
  bold-text treatment already used on the Results page's champion banner —
  this is the one match in the whole bracket that represents the actual
  tournament winner.
- The score itself (`"11–7"`) is shown once complete; `"Not yet played"`
  otherwise — matching the Results page's existing copy for an unplayed
  match.
- Bye rows (`team_b_id === null`) are unaffected — no score, no winner
  indication, not clickable (there's no opponent to play or score).

**Inline score entry**: every real (non-bye) match row becomes a native
HTML `<details>`/`<summary>` disclosure — no client-side JavaScript, no new
Client Component, keeping the Bracket page a Server Component exactly as it
is today. The `<summary>` is the winner/loser/score display described
above; clicking it expands a `<details>` body containing the *same*
score-entry form already used on `/matches` (two number inputs, defaultValue
prefilled from the current score, a Save button), bound to the *same*
`enterScore` server action (`apps/organizer-web/app/tournaments/[id]/matches/actions.ts`,
unmodified by this spec). This applies uniformly everywhere
`renderMatchList` is used — League round cards, Semifinals, Final — since
they all share that one function.

The separate `/matches` page is untouched and keeps working exactly as it
does today; this adds a second way to reach the same underlying data, not a
replacement.

### Out of scope

- Any change to `enterScore` itself, or to the `/matches` page.
- Per-match deletion (explicitly ruled out during brainstorming — the
  existing score-entry form already supports correcting a wrongly-entered
  score for a complete match, since `enterScore` unconditionally overwrites
  `score_a`/`score_b`/`status` regardless of the match's current status).
- Any interaction with round-by-round generation logic — this is a
  read/display and score-correction feature only; it does not touch match
  creation, deletion, or completion-detection code in any format.

## Feature 2: Delete a completed tournament

### Goal

Let the organizer delete a tournament from the dashboard's "Recently
Completed" section, the same way they already can for an upcoming one.

### Current state

`cancelTournament` (`apps/organizer-web/app/tournaments/actions.ts`) already
deletes a tournament unconditionally — it has no check on `completed_at` at
all. The gap is purely in the UI: `CancelTournamentButton` (already a
Client Component, already used with a "this cannot be undone" `confirm()`
dialog) is only rendered inside the "🔥 Upcoming Matches" section of
`apps/organizer-web/app/tournaments/page.tsx`; the "✅ Recently Completed"
section's cards have no such button.

### Design

Add the same `CancelTournamentButton` (imported, bound, and used exactly as
in the "Upcoming Matches" section — `cancelAction={cancelTournament.bind(null, t.id)}`)
to each card in the "Recently Completed" section. No server-side change:
`cancelTournament` already supports this, so this is a pure UI addition.

One structural difference to account for: the "Upcoming Matches" section's
whole card is a `<div>` with the cancel button placed alongside a "Manage
tournament →" link at the bottom; the "Recently Completed" section's whole
card is currently a single `<Link>` wrapping all the card content (clicking
anywhere on the card navigates to the results page). Since a `<button>`
can't be nested inside an `<a>`-rendering `<Link>` without producing invalid
HTML nesting (and would also make the whole-card click target ambiguous
with the button's own click), the completed card's markup changes from "the
whole card is a link" to "the card is a `<div>` containing the existing
content plus a `<Link>` labeled to navigate to results, with the cancel
button placed alongside it" — mirroring the upcoming section's own
existing structure (content above, a link + button row at the bottom)
rather than inventing a new layout.

### Out of scope

- Any change to `cancelTournament` itself.
- Any change to the "Upcoming Matches" section's existing button/link.
