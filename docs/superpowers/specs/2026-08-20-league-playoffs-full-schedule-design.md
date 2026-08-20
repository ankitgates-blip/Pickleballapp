# League + Playoffs Full-Schedule Generation & Regenerate — Design

Status: Approved.

## Goal

League + Playoffs currently requires clicking "Generate Round N+1" after
every round completes, even though its underlying algorithm
(`generateRoundRobin`) is a fixed, non-adaptive schedule that doesn't
depend on any match results. Generate the whole schedule (up to the
configured round count) in one action instead, and add a "Regenerate All
Rounds" option for when the roster changes mid-tournament.

## Scope

League + Playoffs only. Gauntlet, Claim the Throne, and Up and Down the
River stay round-by-round — their pairings are genuinely adaptive
(computed from the previous round's actual results), so they cannot be
pre-generated. Round Robin, Double Header, and Popcorn already generate
their full schedule today; untouched by this change.

## Generate the full schedule

Replace `advanceLeaguePlayoffsRound` in
`apps/organizer-web/app/tournaments/[id]/bracket/actions.ts` with
`generateLeaguePlayoffsBracket(tournamentId, formData)`:

- Same inputs and validation as today's first-round generation: reads
  teams, computes `fullRounds = teamCount % 2 === 0 ? teamCount - 1 :
  teamCount`, reads an optional `rounds` field from `formData` (clamped
  to `[1, fullRounds]`, defaulting to `fullRounds`), persists it to
  `tournaments.league_playoffs_rounds`.
- Instead of filtering `generateRoundRobin(...)`'s pairings to just the
  next round, filters to `p.round <= targetRounds` and inserts all of
  them in one `matches` insert.

The Bracket page's UI for this format collapses from two button states
("Generate Round 1 of N" / "Round X complete, Generate Round X+1 of N")
to one: "N teams ready. Generate the full schedule ({targetRounds}
rounds)." with the same rounds-count input, one "Generate Full Schedule"
button.

Score entry is unaffected — matches already render grouped by round via
the Bracket page's existing `roundsFor()` grouping; this change only
alters when/how many matches get inserted, not how they're displayed or
scored.

## Regenerate All Rounds

New action `regenerateLeaguePlayoffsBracket(tournamentId)`:

1. Guard: if any `stage in ('semifinal', 'final')` match exists for this
   tournament, throw `Error('Playoffs have already started — cannot
   regenerate the League stage')`. Checked server-side (not just hidden
   in the UI), since this is the authoritative safety check.
2. Re-fetch the current team list, recompute `fullRounds` from the
   *current* team count, clamp the tournament's stored
   `league_playoffs_rounds` to `[1, fullRounds]` (a smaller roster can
   invalidate a previously-larger round count).
3. Delete all `stage = 'league'` matches for this tournament (only
   League — Semifinal/Final are guaranteed empty per the guard above).
4. Re-run the same generation as `generateLeaguePlayoffsBracket`, using
   the current team list and the clamped round count.

New Client Component `RegenerateLeagueRoundsButton.tsx`, following the
exact confirm+`useTransition` pattern already used by
`CancelTournamentButton.tsx`:

- Shown on the Bracket page whenever League matches exist AND no
  Semifinal/Final match exists yet (mirrors the server-side guard, so the
  button is simply absent once playoffs start rather than present-but-
  erroring).
- If zero League matches have `status = 'complete'` yet: calls the action
  immediately, no confirmation (nothing to lose).
- If any League match is already scored: shows a `confirm()` dialog
  stating how many scored matches will be permanently lost, matching
  `CancelTournamentButton`'s wording style.

## Teams page banner update

`apps/organizer-web/app/tournaments/[id]/teams/page.tsx`'s existing
amber warning banner (shown when `isLeaguePlayoffs && hasLeagueMatches`)
currently reads:

> "This tournament already has a generated schedule. Removing a team
> also deletes its existing matches and their scores, and any rounds
> generated from here on are recalculated from the new team list — so
> pairings may repeat or be skipped."

The second half described the retired round-by-round-with-a-changing-
team-list behavior, which no longer applies (the whole schedule is now
either fully generated or fully regenerated, never partially). Reworded
to:

> "This tournament already has a generated schedule. Removing a team
> also deletes its existing matches and their scores. After changing
> teams, head to Bracket and use Regenerate All Rounds to rebuild a
> clean schedule from the current team list."

## Out of scope

- Any change to Gauntlet/Claim the Throne/Up and Down the River's
  round-by-round generation (confirmed with the organizer — those stay
  as-is).
- A "Regenerate" button on the Teams page itself — it lives only on the
  Bracket page, alongside every other schedule-generation control.
