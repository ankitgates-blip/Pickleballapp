# Dashboard Champion Display — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Show the winning team or player's name on each "Recently Completed"
tournament card on the dashboard (`/tournaments`), for every format.

## Current state

`apps/organizer-web/app/tournaments/[id]/results/page.tsx` already computes
a tournament's champion — a team name for `round_robin`, `league_playoffs`,
and `double_header`, or a player name for the individual/ladder formats
(`popcorn`, `gauntlet`, `claim_the_throne`, `up_and_down_the_river`, since
those don't have one fixed team for the whole tournament) — but this logic
is written inline in that one page, ~40 lines of format branching that
compute `championTeamId`/`championPlayerId` from `finalMatches`, `standings`,
`ladderStandings`, and `individualStandings`. The dashboard
(`apps/organizer-web/app/tournaments/page.tsx`) currently fetches only
`tournaments` rows and a `players` count per tournament — no matches, no
teams, no standings computation at all.

## Design

### Extract a shared pure function

New file `apps/organizer-web/lib/tournament/champion.ts`, exporting:

```typescript
export function computeTournamentChampionName(params: {
  format: string;
  completedAt: string | null;
  matches: {
    stage: string;
    team_a_id: string | null;
    team_b_id: string | null;
    score_a: number | null;
    score_b: number | null;
    status: string;
    round: number;
    court: number | null;
  }[];
  teams: { id: string; player_1_id: string; player_2_id: string }[];
  players: { id: string; name: string }[];
}): string | undefined
```

Returns `undefined` immediately if `completedAt` is null (mirroring the
Results page's existing `tournament.completed_at` gate — an in-progress
tournament's current leader is not a "winner" yet). Otherwise, internally:

1. Builds `playerById`/`teamById` (resolving to `"PlayerA / PlayerB"`
   display strings) maps from the given `players`/`teams`.
2. Determines `isIndividualFormat`/`isLadderFormat` using the same checks
   already used elsewhere (`isIndividualFormat()` from
   `lib/tournament/formats.ts`, and `format === 'claim_the_throne' ||
   format === 'up_and_down_the_river'` for the ladder check) — reused, not
   redefined.
3. Filters `matches` into league-stage and final-stage subsets, computes
   the appropriate standings via the already-shipped, unmodified
   `computeStandings` / `computeIndividualStandings` /
   `computeClaimTheThroneStandings` (from `lib/tournament/standings.ts`),
   exactly as the Results page already does today.
4. Resolves the champion team ID or player ID using the identical
   3-case priority the Results page's `championTeamId`/`championPlayerId`
   already use (final-match winner if a final exists, else top of
   standings; ladder standings for the two ladder formats; individual
   standings for the other individual formats).
5. Returns the resolved display name (via `teamById`/`playerById`) for
   whichever ID was found, or `undefined` if neither.

### Refactor the Results page to use it

`apps/organizer-web/app/tournaments/[id]/results/page.tsx`'s own
`championTeamId`/`championPlayerId`/champion-name-resolution block is
replaced with a single call to `computeTournamentChampionName`, passing
the same `matches`/`teams`/`players`/`format`/`completed_at` it already
fetches. The champion banner's rendering (the trophy card, its exact copy
and styling) is unchanged — only how the name is *computed* changes, not
how it's *displayed*.

### Add it to the dashboard

`apps/organizer-web/app/tournaments/page.tsx` gains a batch fetch of
`matches` and `teams` scoped to just the tournament IDs already in
`recentlyCompleted` (`.in('tournament_id', completedIds)`, mirroring the
existing `players` batch-fetch pattern already used for player counts —
`upcoming` tournaments are NOT fetched, since they have no champion to
show). For each card in the "Recently Completed" section, call
`computeTournamentChampionName` with that tournament's slice of the
batch-fetched data, and — only when it returns a name — render a new line
on the card: `🏆 {name}`, placed below the existing
venue/timeslot/player-count/date/format row and above the "View results
→" / delete-button footer row added in the previous feature.

### Testing

`computeTournamentChampionName` gets a dedicated test file,
`apps/organizer-web/lib/tournament/champion.test.ts`, covering at least:
a team-based format's champion (via final match, and via standings when no
final exists — e.g. a sub-4-team League + Playoffs tournament), an
individual format's champion (Popcorn/Gauntlet), a ladder format's
champion (Claim the Throne/Up and Down the River), and the
not-yet-completed case (`completedAt: null` → `undefined`). This is the
first genuinely new pure function this session's dashboard-adjacent work
has produced, so — unlike the page-only changes shipped so far today — it
gets real unit tests, consistent with this codebase's established
convention for pure functions under `lib/`.

## Out of scope

- Any change to the champion banner's visual design on the Results page.
- Any change to `upcoming` tournament cards (they have no champion).
- Caching or persisting the computed champion — it's recomputed on every
  dashboard load from the same live data the Results page already reads.
