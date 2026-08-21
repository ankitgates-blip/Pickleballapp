# Skip Semifinals in League + Playoffs — Design

Status: Approved.

## Goal

Give the organizer a way to skip the Semifinal stage of a League +
Playoffs tournament when time is short, sending the top 2 league-standings
teams straight into the Final.

## Where it appears

On the Bracket page, once league play is fully complete for a League +
Playoffs tournament with 4+ teams, two buttons now show side by side:

- **Generate Semifinals** (existing, unchanged)
- **Skip Semifinals — Go to Final** (new)

Both share the exact gate already used for "Generate Semifinals" today:
`isLeaguePlayoffs && allLeagueComplete && semifinalMatches.length === 0 &&
!hasFinalMatch && teamCount >= 4`. Whichever the organizer clicks, that
gate condition becomes false immediately afterward (a Semifinal or Final
match now exists), so the other button disappears — the two paths are
mutually exclusive by construction, with no new locking logic required.

## Behavior

Clicking "Skip Semifinals — Go to Final" is a single, non-destructive
action:

1. Recompute league standings the same way `generateSemifinalMatches`
   already does (`computeStandings` over the completed league matches).
2. Take the #1 and #2 teams by standings (same ordering/tie-break rules
   already in use — no new ranking logic).
3. Insert one `matches` row: `stage: 'final'`, `round: 1`, `team_a_id` =
   #1 team, `team_b_id` = #2 team, `status: 'pending'`.

No team picker and no confirmation dialog — the action only ever appears
before any Semifinal or Final match exists, so there's nothing to
overwrite or lose.

## New code

- `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`: new
  server action `skipToFinalMatch(tournamentId)`, mirroring the shape of
  the existing `generateFinalMatch` (auth via `requireOrganizer()`,
  fetch league matches, compute standings, insert one match row,
  `revalidatePath`).
- `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`: new
  `showSkipToFinal` condition (identical to `showGenerateSemifinals`) and
  a new button wired to `skipToFinalMatch.bind(null, id)`, rendered next
  to the existing "Generate Semifinals" button.

## Unaffected (verified, no changes needed)

- **Tournament completion** (`lib/tournament/completion.ts`,
  `isTournamentComplete`): for League + Playoffs with 4+ teams, this
  already only checks for a completed `stage === 'final'` match — it has
  no dependency on a Semifinal ever having existed.
- **Regenerate All Rounds** (`showRegenerateLeaguePlayoffsRounds` on the
  Bracket page): already locks once `semifinalMatches.length > 0 ||
  finalMatches.length > 0` — a Final created via the skip path locks it
  exactly the same as a Final created via the normal Semifinal path.
- **Standings/champion display elsewhere in the app**: both paths produce
  an identical `matches` row shape (`stage: 'final'`), so nothing that
  reads the Final match needs to know which path produced it.

## Out of scope

- No option to skip semifinals for tournaments with fewer than 4 teams
  (no Semifinal stage exists for those today either — unchanged).
- No manual team picker for the Final's two teams — always the #1/#2
  standings teams, per the organizer's explicit choice.
