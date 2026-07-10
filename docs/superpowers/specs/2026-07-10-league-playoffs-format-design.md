# League + Playoffs Tournament Format — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Add a new selectable tournament format, "League + Playoffs": a round-robin league
stage (every team plays every other team) followed by a top-4 knockout stage
(semifinals, then a final) to crown a champion. User-specified rules:

- Maximum 16 players / 8 teams of 2, randomly paired.
- Fewer than 16 players still form teams in pairs; the format adjusts accordingly.
- League stage: full round robin.
- Ranking: wins first, then score differential (and other predefined tiebreakers).
- Top 4 advance to semifinals: 1st vs 4th, 2nd vs 3rd.
- Semifinal winners meet in the Final to decide the champion.

## Scope decisions (resolved via brainstorming, 2026-07-10)

- **Name**: "League + Playoffs" in the format picker.
- **Fewer than 4 teams**: no semifinal/final are generated. The round-robin league
  stage runs as normal, and whoever is #1 in the final standings is the champion —
  the tournament still auto-completes once all league matches are scored.
- **16-player / 8-team cap**: enforced as a hard limit. Once a League + Playoffs
  tournament has 8 teams, both manual pairing and "Shuffle Remaining Players" are
  blocked from creating a 9th. No other format is capped.
- **Playoff progression is manual (button-click), not automatic** — matches the
  existing "Generate Bracket" pattern used everywhere else in the app. A "Generate
  Semifinals" button appears once all league matches are scored; a "Generate Final"
  button appears once both semifinals are scored. This also gives the organizer a
  chance to fix a mis-entered score before the next stage locks in who advances.

## Data model

- `tournaments.format` check constraint gains an 8th valid value: `'league_playoffs'`.
- New column `matches.stage`: `text not null default 'league' check (stage in ('league', 'semifinal', 'final'))`.
  Additive — every match from every other existing format is implicitly (and
  correctly) `'league'`, since those formats have only one stage.

## Business logic (`lib/tournament/`, plain TypeScript, unit-tested — same pattern as `roundRobin.ts`/`standings.ts`/`shuffle.ts`)

- **League stage** reuses `generateRoundRobin` unchanged. The only difference at the
  call site is that generated matches are inserted with `stage: 'league'`.
- **Standings/ranking** reuses `computeStandings` unchanged — already ranks by wins
  then point differential, which is exactly the spec's tiebreaker rule.
- **New**: `generateSemifinals(standings: StandingsRow[]): Array<{ teamAId: string; teamBId: string }>`.
  Takes the top 4 standings rows (caller passes `standings.slice(0, 4)`, already
  ranked 1st→4th) and returns `[{ teamAId: rank1, teamBId: rank4 }, { teamAId: rank2, teamBId: rank3 }]`.
  Throws if fewer than 4 rows are passed — the caller (UI/action layer) is
  responsible for only invoking this once there are genuinely ≥4 teams; the
  function itself does not silently handle the sub-4-team case.
- **New**: `isTournamentComplete(format: string, teamCount: number, matches: Array<{ stage: string; status: string; teamBId: string | null }>): boolean`.
  Replaces the current inline "are all matches complete" check used for
  auto-completion:
  - For every format other than `'league_playoffs'`: unchanged from today — true
    when at least one non-bye match exists and every non-bye match is `'complete'`.
  - For `'league_playoffs'` with `teamCount < 4`: same rule as above, applied only
    to `stage: 'league'` matches (there will never be semifinal/final matches in
    this case, so this is equivalent to "all matches complete").
  - For `'league_playoffs'` with `teamCount >= 4`: true only when a `stage: 'final'`
    match exists and its status is `'complete'`. This is the critical fix that
    prevents the tournament from being wrongly marked complete the moment the
    league stage finishes but before playoffs have even been generated — with the
    old "all existing matches complete" logic, that moment would look identical to
    "tournament complete" because no semifinal/final rows exist yet.

## Team cap enforcement (League + Playoffs only)

On the Teams page, both the manual "Pair" action and "Shuffle Remaining Players"
check the tournament's format and current team count before writing. If
`format === 'league_playoffs'` and the tournament already has 8 teams, the action
rejects the request and the UI shows "8/8 teams — maximum reached" instead of the
pairing controls. No cap applies to any other format.

## Bracket page flow (multi-stage, League + Playoffs only)

1. No league matches yet → the existing "Generate League Bracket" button (≥2 teams
   required, same as today), generating `stage: 'league'` matches via
   `generateRoundRobin`.
2. League matches exist, not all scored → league schedule + live standings
   (computed from `stage: 'league'` matches only), same presentation as today's
   round-robin bracket view.
3. All league matches scored:
   - **Fewer than 4 teams**: no button appears — league standings are the final
     result. The tournament auto-completes via `isTournamentComplete`.
   - **4+ teams**: a "Generate Semifinals" button appears. Clicking it computes
     `computeStandings` on the league matches, takes the top 4, and calls
     `generateSemifinals` to create 2 matches (`stage: 'semifinal'`, `round: 1`).
4. Both semifinal matches scored → a "Generate Final" button appears. Clicking it
   determines each semifinal's winner (higher score) and creates 1 match
   (`stage: 'final'`, `round: 1`) between them.
5. Final match scored → tournament auto-completes (`isTournamentComplete` now sees
   the final match as complete); the champion is the final's winning team.

## Other page changes

- **Scores page** (`matches/page.tsx`): groups matches by stage with clear section
  headers ("League", "Semifinal", "Final") instead of one flat list — semifinal/
  final sections simply don't render until those matches exist.
- **Results page**: for League + Playoffs tournaments, shows league standings, then
  a "Semifinals" section with both results, then a "Final" section, with the
  champion team called out prominently at the top. For every other format, the
  Results page is unchanged.
- **Standings page**: unchanged — continues to show standings computed from
  whatever matches exist for the tournament (for League + Playoffs, this remains
  the league-stage standings, which is still meaningful information mid-tournament).

## Testing

- Unit (Vitest): `generateSemifinals` — correct 1v4/2v3 pairing from a 4-row
  standings input; throws on fewer than 4 rows. `isTournamentComplete` — every
  branch above (non-league_playoffs unchanged behavior; league_playoffs with <4
  teams; league_playoffs with ≥4 teams and no final yet; league_playoffs with ≥4
  teams and a completed final).
- Manual/browser verification: run a full League + Playoffs tournament with 4
  teams end-to-end — pair/shuffle up to the 8-team cap and confirm the 9th is
  blocked, generate league bracket, score all league matches, generate
  semifinals, score them, generate the final, score it, confirm the tournament
  auto-completes and the Results page shows the correct champion.

## Out of scope for this feature

- Best-of-N scoring for the final (single game score, same as every other match,
  consistent with the rest of the app).
- Any UI for reseeding or manually overriding who advances to semifinals/final —
  seeding is always derived directly from league standings.
- Enforcing the 16-player cap at the roster level — only team count is capped;
  the roster itself can hold more names than will actually get paired.
