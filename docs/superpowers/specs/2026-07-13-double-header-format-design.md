# Double Header Format — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Make the "Double Header" tournament format actually generate a
bracket, instead of showing the current "coming soon" message. This is
the first of six unimplemented formats being built incrementally
(Popcorn, Gauntlet, Up and Down the River, Claim the Throne, Cream of
the Crop, Double Header) — the rest follow as separate later
increments, in that order, from simplest/most schema-compatible to
most complex.

## Scope decisions (resolved via brainstorming, 2026-07-13)

- **Rule**: fixed teams, same as Round Robin — but every real matchup
  (excluding byes) is played as **two games back-to-back in the same
  round**, not spread across the event as separate legs.
- **Standings, completion detection, score entry, and the results
  page all need zero changes** — they already tally/aggregate whatever
  match rows exist generically, so two games between the same teams
  simply count as two data points, which is exactly the intended
  behavior. Confirmed by reading `computeStandings`
  (`apps/organizer-web/lib/tournament/standings.ts`) — it has no
  assumption of one-match-per-pairing.

## Implementation

### 1. New pure function — `apps/organizer-web/lib/tournament/roundRobin.ts`

Add alongside the existing `generateRoundRobin`:

```typescript
export function generateDoubleHeaderRoundRobin(teamIds: string[]): RoundRobinPairing[] {
  const singleRound = generateRoundRobin(teamIds);
  const doubled: RoundRobinPairing[] = [];

  for (const pairing of singleRound) {
    doubled.push(pairing);
    if (pairing.teamBId !== null) {
      doubled.push({ ...pairing });
    }
  }

  return doubled;
}
```

Byes (`teamBId === null`) are emitted once per round, exactly like
`generateRoundRobin` already does — there's no opponent to play twice.
Every real matchup is emitted twice, both tagged with the same `round`
number as the original pairing.

### 2. `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`

`generateBracket` currently only fetches teams and always calls
`generateRoundRobin`. It needs to also fetch the tournament's `format`
and branch:

```typescript
const { data: tournament } = await supabase
  .from('tournaments')
  .select('format')
  .eq('id', tournamentId)
  .single();

const pairings =
  tournament?.format === 'double_header'
    ? generateDoubleHeaderRoundRobin(teams.map((t) => t.id))
    : generateRoundRobin(teams.map((t) => t.id));
```

(Exact insertion point and surrounding code to be spelled out in the
implementation plan.)

### 3. `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`

Add `isDoubleHeader = format === 'double_header'` and include it in
`isSupported` (currently `isRoundRobin || isLeaguePlayoffs`), so the
"coming soon" banner no longer shows for this format and the existing
"Generate League Bracket" button/flow works for it.

## Out of scope

- The other five unimplemented formats (Popcorn, Gauntlet, Up and Down
  the River, Claim the Throne, Cream of the Crop) — separate future
  increments.
- No change to `computeStandings`, `isTournamentComplete`, score entry,
  or the results page — all already generic enough to handle repeated
  matchups correctly with no modification.
- No UI copy change to reflect "two games per round" explicitly (e.g.,
  the button still says "Generate League Bracket") — not required for
  correct behavior, and can be revisited later if it proves confusing
  in practice.
