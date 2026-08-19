# Match Team Reassignment — Design

Status: Approved, pending spec review before implementation plan.

This closes the "Match Admin Controls" gap flagged as a follow-up
during the earlier "Unlock Team Roster Editing" feature: organizers
could already edit scores on any match (including completed ones, via
the Bracket page's inline disclosure), but had no way to correct which
teams are assigned to a match if it was recorded wrong.

## Goal

Let the organizer reassign which two teams are on a given match — any
match, completed or not — directly from the Bracket page, without
resetting the match's score.

## Current state

`apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`'s
`renderMatchList` already wraps each real match in a `<details>`
disclosure containing an inline score-entry form bound to the existing
`enterScore` action (`apps/organizer-web/app/tournaments/[id]/matches/actions.ts`).
There is no way today to change `matches.team_a_id`/`team_b_id` once a
match row exists — only its score.

## Design

### New server action: `updateMatchTeams`

`apps/organizer-web/app/tournaments/[id]/bracket/actions.ts` gains:

```typescript
export async function updateMatchTeams(
  tournamentId: string,
  matchId: string,
  formData: FormData
) {
  const { supabase } = await requireOrganizer();
  const teamAId = formData.get('teamAId') as string;
  const teamBId = formData.get('teamBId') as string;

  if (teamAId === teamBId) {
    throw new Error('Team A and Team B must be different teams');
  }

  const { error } = await supabase
    .from('matches')
    .update({ team_a_id: teamAId, team_b_id: teamBId })
    .eq('id', matchId)
    .eq('tournament_id', tournamentId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}
```

The score (`score_a`/`score_b`/`status`) is untouched — reassigning
teams corrects a data-entry mistake about *who played*, not the result
of the game that was actually played.

### Bracket page: a second inline form per match

Inside the same `<details>` disclosure that already holds the score
form, add a second, visually separated mini-form: two `<select>`
dropdowns (Team A, Team B) listing every team in the tournament
(`teamById`, already fetched on this page), defaulting to the match's
current `team_a_id`/`team_b_id`, plus a "Save Teams" button bound to
`updateMatchTeams`. A small caption above it reads:

> Changing a match's teams doesn't recompute any standings, seeding,
> or later rounds already generated from it — double-check anything
> downstream that depended on this match.

This mirrors the "warn but never block" pattern the organizer already
chose for roster editing — informational, not gating.

### Scope

Works on every match on the Bracket page, not just completed ones
(restricting to only completed matches would be an arbitrary
inconsistency with the score form, which already has no such
restriction). No restriction on which team can be picked for A or B
beyond "must be two different teams" — no check against a team already
playing elsewhere in the same round, consistent with this app's
existing tolerance for that kind of overlap (bracket generation itself
doesn't enforce it either).

## Out of scope

- Deleting or manually adding match rows outside the normal generation
  flow — a separate, not-yet-designed capability if it's still wanted.
- Any change to `enterScore` or the score form.
- Any change to standings/seeding recomputation — the warning caption
  is the only mitigation for the compounding-risk concern flagged
  earlier (task_a1778330); actually recomputing dependent state is a
  separate, larger effort not undertaken here.
