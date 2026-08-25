# Custom League Ad-Hoc Team Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Critical bug where ad-hoc teams (created by dynamic-round pairing) can be scheduled against fixed teams that share a player, by giving `teams` an `is_ad_hoc` marker and isolating the two pools everywhere they're consumed; also fix the Teams page and standings/champion breakage that followed from the same root cause.

**Architecture:** One schema addition (`teams.is_ad_hoc`) is the single source of truth. The fixed-team generator and the even-mode "Add Match" path only ever query `is_ad_hoc = false` teams; the fairness ledger and individual standings still need the unfiltered (fixed + ad-hoc) list to resolve every match's real roster. The trigger for dynamic mode changes from "player count is odd" to "at least one player has no fixed team" everywhere it's checked. Custom League standings/champion switch to player-level via a new `usesIndividualStandings` check, kept separate from `isIndividualFormat` (which still gates the Teams page's auto-paired banner and must not change for Custom).

**Tech Stack:** Supabase (Postgres), Next.js Server Actions, TypeScript, Vitest.

## Global Constraints

- `is_ad_hoc boolean not null default false` is added to `teams`. This codebase's Supabase client is **not schema-typed** (no generated types file, `createClient` is untyped) — `npm run build` and `npm test` will NOT fail if the migration hasn't actually been applied to the live database, only runtime queries will. **The migration file must be applied to the live Supabase project for this feature to work** — flag this to the user after the plan is executed; do not assume it happens automatically.
- Two different filters on the same `teams` data, used for two different purposes — do not mix them up in any task:
  - **Fixed-only** (`is_ad_hoc = false`): the fixed-team generator's candidate pool (`computeCustomAutoRound`'s `teams` argument), the even-mode "Add Match" team dropdown and its server-side validation, the Teams page's `unpairedPlayers`/main team list.
  - **Unfiltered** (fixed + ad-hoc): `derivePlayerHistory`'s `teams` argument, `computeIndividualStandings`'s `teamsForIndividual` argument (via `usesIndividualStandings`) — both need to resolve *any* past match's roster regardless of which generator created that match's teams.
- Dynamic-mode trigger, checked identically everywhere: query `teams` filtered to `is_ad_hoc = false`, collect paired player ids from those, and check whether any registered player is missing. This replaces every prior `... % 2 === 1` check.
- New ad-hoc teams get `is_ad_hoc: true` set explicitly on insert, in both `autoGenerateCustomRound` and `addCustomMatch`. Existing/reused teams (looked up by pair-key, fixed or ad-hoc) keep whatever `is_ad_hoc` value they already have.
- `isIndividualFormat` (from `lib/tournament/formats.ts`) and everything gated on it directly (in particular the Teams page's `isAutoPaired`) are **not modified**. The new `usesIndividualStandings` check is used only at the 3 standings/champion call sites.
- `bracket/actions.ts`, `bracket/page.tsx`, and `teams/page.tsx` have zero test coverage anywhere in this codebase, by established convention (confirmed in both prior features' plans) — do not add test files for them; verify via `npm run build` (typecheck) + `npm test` (regression) only. `champion.ts` and `formats.ts` have existing test files and get new cases added.
- Test command: `npm test` (Vitest) from `apps/organizer-web`. Build/typecheck: `npm run build` from `apps/organizer-web`.

---

### Task 1: Migration — `teams.is_ad_hoc`

**Files:**
- Create: `supabase/migrations/20260825120000_add_teams_is_ad_hoc.sql`

**Interfaces:** none — schema-only change, no code depends on this task directly (later tasks assume the column exists).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260825120000_add_teams_is_ad_hoc.sql`:

```sql
-- Distinguishes organizer-created "fixed" teams from ad-hoc teams that Custom
-- League's dynamic pairing (lib/tournament/customDynamic.ts) creates on the fly when
-- a player has no fixed partner. Without this marker, the fixed-team generator
-- (computeCustomAutoRound) has no way to avoid scheduling two teams that share a
-- player -- see docs/superpowers/specs/2026-08-25-custom-league-ad-hoc-teams-fix-design.md.
alter table public.teams add column is_ad_hoc boolean not null default false;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260825120000_add_teams_is_ad_hoc.sql
git commit -m "feat: add is_ad_hoc marker to distinguish ad-hoc from fixed teams"
```

**Note for the controller (not a task step):** this migration needs to be applied to the live Supabase project — via `npx supabase db push` (requires project link + credentials) or by pasting the SQL into the Supabase dashboard's SQL editor. Confirm with the user how they want this applied; do not assume it happens as a side effect of committing the file.

---

### Task 2: `usesIndividualStandings` helper

**Files:**
- Modify: `apps/organizer-web/lib/tournament/formats.ts`
- Modify: `apps/organizer-web/lib/tournament/formats.test.ts`

**Interfaces:**
- Produces: `usesIndividualStandings(format: string): boolean`, used by Task 7.

- [ ] **Step 1: Write the failing test**

The current `apps/organizer-web/lib/tournament/formats.test.ts` reads:

```ts
import { describe, it, expect } from 'vitest';
import { isLadderFormat } from './formats';

describe('isLadderFormat', () => {
  it('returns true for claim_the_throne and up_and_down_the_river', () => {
    expect(isLadderFormat('claim_the_throne')).toBe(true);
    expect(isLadderFormat('up_and_down_the_river')).toBe(true);
  });

  it('returns false for every other format', () => {
    expect(isLadderFormat('round_robin')).toBe(false);
    expect(isLadderFormat('popcorn')).toBe(false);
    expect(isLadderFormat('gauntlet')).toBe(false);
    expect(isLadderFormat('double_header')).toBe(false);
    expect(isLadderFormat('league_playoffs')).toBe(false);
    expect(isLadderFormat('custom')).toBe(false);
    expect(isLadderFormat('cream_of_the_crop')).toBe(false);
  });
});
```

Change the import line to:

```ts
import { isLadderFormat, usesIndividualStandings } from './formats';
```

And append a new describe block at the end of the file:

```ts

describe('usesIndividualStandings', () => {
  it('returns true for every isIndividualFormat value', () => {
    expect(usesIndividualStandings('popcorn')).toBe(true);
    expect(usesIndividualStandings('gauntlet')).toBe(true);
    expect(usesIndividualStandings('claim_the_throne')).toBe(true);
    expect(usesIndividualStandings('up_and_down_the_river')).toBe(true);
  });

  it('returns true for custom', () => {
    expect(usesIndividualStandings('custom')).toBe(true);
  });

  it('returns false for team-based, non-custom formats', () => {
    expect(usesIndividualStandings('round_robin')).toBe(false);
    expect(usesIndividualStandings('double_header')).toBe(false);
    expect(usesIndividualStandings('league_playoffs')).toBe(false);
    expect(usesIndividualStandings('cream_of_the_crop')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/organizer-web`): `npx vitest run lib/tournament/formats.test.ts`
Expected: FAIL — `usesIndividualStandings` is not exported from `./formats`.

- [ ] **Step 3: Add the function**

The current `apps/organizer-web/lib/tournament/formats.ts` ends with:

```ts
const LADDER_FORMATS: readonly string[] = ['claim_the_throne', 'up_and_down_the_river'];

export function isLadderFormat(format: string): boolean {
  return LADDER_FORMATS.includes(format);
}
```

Append after it:

```ts

// Custom League switches to player-level standings once dynamic (ad-hoc) pairing has
// ever occurred, since team identity there isn't stable across the tournament -- an
// ad-hoc team might play exactly one match. This is intentionally NOT the same as
// isIndividualFormat: that flag also drives the Teams page's auto-paired banner, which
// must stay off for Custom (fixed-team manual pairing still exists there). See
// docs/superpowers/specs/2026-08-25-custom-league-ad-hoc-teams-fix-design.md.
export function usesIndividualStandings(format: string): boolean {
  return isIndividualFormat(format) || format === 'custom';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/tournament/formats.test.ts`
Expected: PASS, 5 tests (2 existing `isLadderFormat` + 3 new `usesIndividualStandings`).

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/lib/tournament/formats.ts apps/organizer-web/lib/tournament/formats.test.ts
git commit -m "feat: add usesIndividualStandings helper"
```

---

### Task 3: `autoGenerateCustomRound` — fixed-team pool isolation

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`

**Interfaces:**
- Consumes: `derivePlayerHistory`, `computeCustomDynamicRound` (already imported in this file), the existing private `pairKey` helper (already in this file).
- Depends on: Task 1's `teams.is_ad_hoc` column existing in the database (the code compiles either way since this file is not schema-typed, but will error at runtime against an un-migrated database).

- [ ] **Step 1: Replace `autoGenerateCustomRound`**

The function currently reads (exact current text):

```ts
export async function autoGenerateCustomRound(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('format, custom_rounds, completed_at, results_unlocked_at')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (tournament?.format !== 'custom') {
    throw new Error('Auto-generate is only available for the Custom League format.');
  }

  if (!canEditScore(tournament?.completed_at ?? null, tournament?.results_unlocked_at ?? null)) {
    throw new Error('Scores are locked — unlock editing first to auto-generate a round.');
  }

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (playersError) {
    throw new Error(playersError.message);
  }

  const playerIds = (players ?? []).map((p) => p.id);
  const isOddMode = playerIds.length % 2 === 1;

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  if (!isOddMode && (!teams || teams.length < 2)) {
    throw new Error('Need at least 2 teams to auto-generate a round.');
  }
  if (isOddMode && playerIds.length < 4) {
    throw new Error('Need at least 4 players to auto-generate a round.');
  }

  const { data: existingMatchesRaw, error: matchesError } = await supabase
    .from('matches')
    .select('round, team_a_id, team_b_id')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league');

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const existingMatches: CustomAutoMatch[] = (existingMatchesRaw ?? [])
    .filter((m) => m.team_b_id !== null)
    .map((m) => ({ round: m.round, teamAId: m.team_a_id!, teamBId: m.team_b_id! }));

  const nextRound =
    existingMatches.length > 0 ? Math.max(...existingMatches.map((m) => m.round)) + 1 : 1;

  const targetRounds = tournament?.custom_rounds ?? 5;
  if (nextRound > targetRounds) {
    throw new Error(`All ${targetRounds} round${targetRounds === 1 ? '' : 's'} already have matches.`);
  }

  type MatchRow = {
    tournament_id: string;
    round: number;
    stage: 'league';
    team_a_id: string;
    team_b_id: string;
    status: 'pending';
  };
  let matchRows: MatchRow[];

  if (isOddMode) {
    const teamIdByPairKey = new Map<string, string>();
    for (const t of teams ?? []) {
      teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
    }

    const history = derivePlayerHistory(
      playerIds,
      existingMatches,
      (teams ?? []).map((t) => ({ id: t.id, player1Id: t.player_1_id, player2Id: t.player_2_id })),
      nextRound
    );
    const pairings = computeCustomDynamicRound(playerIds, history);

    const pairKeysNeeded = new Set<string>();
    for (const p of pairings) {
      pairKeysNeeded.add(pairKey(p.teamAPlayerIds[0], p.teamAPlayerIds[1]));
      pairKeysNeeded.add(pairKey(p.teamBPlayerIds[0], p.teamBPlayerIds[1]));
    }
    const newPairKeys = [...pairKeysNeeded].filter((key) => !teamIdByPairKey.has(key));

    if (newPairKeys.length > 0) {
      const { data: insertedTeams, error: insertTeamsError } = await supabase
        .from('teams')
        .insert(
          newPairKeys.map((key) => {
            const [player1Id, player2Id] = key.split('|');
            return { tournament_id: tournamentId, player_1_id: player1Id, player_2_id: player2Id };
          })
        )
        .select('id, player_1_id, player_2_id');

      if (insertTeamsError) {
        throw new Error(insertTeamsError.message);
      }

      for (const t of insertedTeams ?? []) {
        teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
      }
    }

    matchRows = pairings.map((p) => ({
      tournament_id: tournamentId,
      round: nextRound,
      stage: 'league' as const,
      team_a_id: teamIdByPairKey.get(pairKey(p.teamAPlayerIds[0], p.teamAPlayerIds[1]))!,
      team_b_id: teamIdByPairKey.get(pairKey(p.teamBPlayerIds[0], p.teamBPlayerIds[1]))!,
      status: 'pending' as const,
    }));
  } else {
    const pairings = computeCustomAutoRound(teams ?? [], existingMatches, nextRound);
    matchRows = pairings.map((p) => ({
      tournament_id: tournamentId,
      round: nextRound,
      stage: 'league' as const,
      team_a_id: p.teamAId,
      team_b_id: p.teamBId,
      status: 'pending' as const,
    }));
  }

  const { error: insertError } = await supabase.from('matches').insert(assignCourts(matchRows));

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}
```

Replace the whole function with:

```ts
export async function autoGenerateCustomRound(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('format, custom_rounds, completed_at, results_unlocked_at')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (tournament?.format !== 'custom') {
    throw new Error('Auto-generate is only available for the Custom League format.');
  }

  if (!canEditScore(tournament?.completed_at ?? null, tournament?.results_unlocked_at ?? null)) {
    throw new Error('Scores are locked — unlock editing first to auto-generate a round.');
  }

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (playersError) {
    throw new Error(playersError.message);
  }

  const playerIds = (players ?? []).map((p) => p.id);

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id, is_ad_hoc')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  const fixedTeams = (teams ?? []).filter((t) => !t.is_ad_hoc);
  const fixedPairedPlayerIds = new Set(fixedTeams.flatMap((t) => [t.player_1_id, t.player_2_id]));
  const isDynamicMode = playerIds.some((id) => !fixedPairedPlayerIds.has(id));

  if (!isDynamicMode && fixedTeams.length < 2) {
    throw new Error('Need at least 2 teams to auto-generate a round.');
  }
  if (isDynamicMode && playerIds.length < 4) {
    throw new Error('Need at least 4 players to auto-generate a round.');
  }

  const { data: existingMatchesRaw, error: matchesError } = await supabase
    .from('matches')
    .select('round, team_a_id, team_b_id')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league');

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const existingMatches: CustomAutoMatch[] = (existingMatchesRaw ?? [])
    .filter((m) => m.team_b_id !== null)
    .map((m) => ({ round: m.round, teamAId: m.team_a_id!, teamBId: m.team_b_id! }));

  const nextRound =
    existingMatches.length > 0 ? Math.max(...existingMatches.map((m) => m.round)) + 1 : 1;

  const targetRounds = tournament?.custom_rounds ?? 5;
  if (nextRound > targetRounds) {
    throw new Error(`All ${targetRounds} round${targetRounds === 1 ? '' : 's'} already have matches.`);
  }

  type MatchRow = {
    tournament_id: string;
    round: number;
    stage: 'league';
    team_a_id: string;
    team_b_id: string;
    status: 'pending';
  };
  let matchRows: MatchRow[];

  if (isDynamicMode) {
    const teamIdByPairKey = new Map<string, string>();
    for (const t of teams ?? []) {
      teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
    }

    const history = derivePlayerHistory(
      playerIds,
      existingMatches,
      (teams ?? []).map((t) => ({ id: t.id, player1Id: t.player_1_id, player2Id: t.player_2_id })),
      nextRound
    );
    const pairings = computeCustomDynamicRound(playerIds, history);

    const pairKeysNeeded = new Set<string>();
    for (const p of pairings) {
      pairKeysNeeded.add(pairKey(p.teamAPlayerIds[0], p.teamAPlayerIds[1]));
      pairKeysNeeded.add(pairKey(p.teamBPlayerIds[0], p.teamBPlayerIds[1]));
    }
    const newPairKeys = [...pairKeysNeeded].filter((key) => !teamIdByPairKey.has(key));

    if (newPairKeys.length > 0) {
      const { data: insertedTeams, error: insertTeamsError } = await supabase
        .from('teams')
        .insert(
          newPairKeys.map((key) => {
            const [player1Id, player2Id] = key.split('|');
            return {
              tournament_id: tournamentId,
              player_1_id: player1Id,
              player_2_id: player2Id,
              is_ad_hoc: true,
            };
          })
        )
        .select('id, player_1_id, player_2_id');

      if (insertTeamsError) {
        throw new Error(insertTeamsError.message);
      }

      for (const t of insertedTeams ?? []) {
        teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
      }
    }

    matchRows = pairings.map((p) => ({
      tournament_id: tournamentId,
      round: nextRound,
      stage: 'league' as const,
      team_a_id: teamIdByPairKey.get(pairKey(p.teamAPlayerIds[0], p.teamAPlayerIds[1]))!,
      team_b_id: teamIdByPairKey.get(pairKey(p.teamBPlayerIds[0], p.teamBPlayerIds[1]))!,
      status: 'pending' as const,
    }));
  } else {
    const pairings = computeCustomAutoRound(fixedTeams, existingMatches, nextRound);
    matchRows = pairings.map((p) => ({
      tournament_id: tournamentId,
      round: nextRound,
      stage: 'league' as const,
      team_a_id: p.teamAId,
      team_b_id: p.teamBId,
      status: 'pending' as const,
    }));
  }

  const { error: insertError } = await supabase.from('matches').insert(assignCourts(matchRows));

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}
```

Key changes: `teams` select now includes `is_ad_hoc`; a new `fixedTeams` array filters to `is_ad_hoc === false`; the mode flag is renamed `isDynamicMode` and computed from "any player missing from `fixedPairedPlayerIds`" instead of parity; the even-mode branch passes `fixedTeams` (not `teams`) to `computeCustomAutoRound`; new ad-hoc team inserts set `is_ad_hoc: true`. The `derivePlayerHistory` call is unchanged — it already used the unfiltered `teams ?? []`.

- [ ] **Step 2: Verify**

Run: `npm test` (from `apps/organizer-web`) — expect all existing tests still pass.
Run: `npm run build` (from `apps/organizer-web`) — expect a clean TypeScript build.

- [ ] **Step 3: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/actions.ts"
git commit -m "fix: isolate fixed-team pool from ad-hoc teams in autoGenerateCustomRound"
```

---

### Task 4: `addCustomMatch` — fixed-team pool isolation

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`

**Interfaces:**
- Consumes: the existing private `pairKey` helper (already in this file).

- [ ] **Step 1: Replace `addCustomMatch`**

The function currently reads (exact current text):

```ts
export async function addCustomMatch(tournamentId: string, formData: FormData) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('format, custom_rounds, completed_at, results_unlocked_at')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (tournament?.format !== 'custom') {
    throw new Error('Matches can only be added manually for the Custom League format.');
  }

  if (!canEditScore(tournament?.completed_at ?? null, tournament?.results_unlocked_at ?? null)) {
    throw new Error('Scores are locked — unlock editing first to add a match.');
  }

  const targetRounds = tournament?.custom_rounds ?? 5;
  const roundRaw = formData.get('round');
  const round = typeof roundRaw === 'string' ? Number(roundRaw) : NaN;

  if (!Number.isInteger(round) || round < 1 || round > targetRounds) {
    throw new Error(`Round must be a whole number between 1 and ${targetRounds}`);
  }

  const { data: players, error: playersCountError } = await supabase
    .from('players')
    .select('id')
    .eq('tournament_id', tournamentId);

  if (playersCountError) {
    throw new Error(playersCountError.message);
  }

  const isOddMode = (players ?? []).length % 2 === 1;

  let teamAId: string;
  let teamBId: string;

  if (isOddMode) {
    const teamAPlayer1 = formData.get('teamAPlayer1Id');
    const teamAPlayer2 = formData.get('teamAPlayer2Id');
    const teamBPlayer1 = formData.get('teamBPlayer1Id');
    const teamBPlayer2 = formData.get('teamBPlayer2Id');

    if (
      typeof teamAPlayer1 !== 'string' ||
      !teamAPlayer1 ||
      typeof teamAPlayer2 !== 'string' ||
      !teamAPlayer2 ||
      typeof teamBPlayer1 !== 'string' ||
      !teamBPlayer1 ||
      typeof teamBPlayer2 !== 'string' ||
      !teamBPlayer2
    ) {
      throw new Error('All 4 players must be selected');
    }

    const selectedPlayerIds = [teamAPlayer1, teamAPlayer2, teamBPlayer1, teamBPlayer2];
    if (new Set(selectedPlayerIds).size !== 4) {
      throw new Error('All 4 selected players must be different');
    }

    const { data: validPlayers, error: validPlayersError } = await supabase
      .from('players')
      .select('id')
      .eq('tournament_id', tournamentId)
      .in('id', selectedPlayerIds);

    if (validPlayersError) {
      throw new Error(validPlayersError.message);
    }

    const validPlayerIds = new Set((validPlayers ?? []).map((p) => p.id));
    if (selectedPlayerIds.some((pid) => !validPlayerIds.has(pid))) {
      throw new Error('Selected players must belong to this tournament');
    }

    const { data: roundMatches, error: roundMatchesError } = await supabase
      .from('matches')
      .select('team_a_id, team_b_id')
      .eq('tournament_id', tournamentId)
      .eq('stage', 'league')
      .eq('round', round);

    if (roundMatchesError) {
      throw new Error(roundMatchesError.message);
    }

    const busyTeamIds = new Set(
      (roundMatches ?? []).flatMap((m) =>
        [m.team_a_id, m.team_b_id].filter((tid): tid is string => tid !== null)
      )
    );

    if (busyTeamIds.size > 0) {
      const { data: busyTeams, error: busyTeamsError } = await supabase
        .from('teams')
        .select('player_1_id, player_2_id')
        .in('id', [...busyTeamIds]);

      if (busyTeamsError) {
        throw new Error(busyTeamsError.message);
      }

      const busyPlayerIds = new Set((busyTeams ?? []).flatMap((t) => [t.player_1_id, t.player_2_id]));

      if (selectedPlayerIds.some((pid) => busyPlayerIds.has(pid))) {
        throw new Error('One of the selected players is already in a match this round');
      }
    }

    const { data: existingTeams, error: existingTeamsError } = await supabase
      .from('teams')
      .select('id, player_1_id, player_2_id')
      .eq('tournament_id', tournamentId);

    if (existingTeamsError) {
      throw new Error(existingTeamsError.message);
    }

    const teamIdByPairKey = new Map<string, string>();
    for (const t of existingTeams ?? []) {
      teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
    }

    const neededPairs: [string, string][] = [
      [teamAPlayer1, teamAPlayer2],
      [teamBPlayer1, teamBPlayer2],
    ];
    const newPairKeys = neededPairs.map(([a, b]) => pairKey(a, b)).filter((key) => !teamIdByPairKey.has(key));

    if (newPairKeys.length > 0) {
      const { data: insertedTeams, error: insertTeamsError } = await supabase
        .from('teams')
        .insert(
          newPairKeys.map((key) => {
            const [player1Id, player2Id] = key.split('|');
            return { tournament_id: tournamentId, player_1_id: player1Id, player_2_id: player2Id };
          })
        )
        .select('id, player_1_id, player_2_id');

      if (insertTeamsError) {
        throw new Error(insertTeamsError.message);
      }

      for (const t of insertedTeams ?? []) {
        teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
      }
    }

    teamAId = teamIdByPairKey.get(pairKey(teamAPlayer1, teamAPlayer2))!;
    teamBId = teamIdByPairKey.get(pairKey(teamBPlayer1, teamBPlayer2))!;
  } else {
    const teamAIdRaw = formData.get('teamAId');
    const teamBIdRaw = formData.get('teamBId');

    if (typeof teamAIdRaw !== 'string' || typeof teamBIdRaw !== 'string' || !teamAIdRaw || !teamBIdRaw) {
      throw new Error('Both teams must be selected');
    }

    if (teamAIdRaw === teamBIdRaw) {
      throw new Error('Team A and Team B must be different teams');
    }

    const { data: validTeams, error: teamsError } = await supabase
      .from('teams')
      .select('id')
      .eq('tournament_id', tournamentId)
      .in('id', [teamAIdRaw, teamBIdRaw]);

    if (teamsError) {
      throw new Error(teamsError.message);
    }

    const validIds = new Set((validTeams ?? []).map((t) => t.id));
    if (!validIds.has(teamAIdRaw) || !validIds.has(teamBIdRaw)) {
      throw new Error('Selected teams must belong to this tournament');
    }

    teamAId = teamAIdRaw;
    teamBId = teamBIdRaw;
  }

  const { count: existingInRound, error: existingInRoundError } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league')
    .eq('round', round);

  if (existingInRoundError) {
    throw new Error(existingInRoundError.message);
  }

  const { error } = await supabase.from('matches').insert({
    tournament_id: tournamentId,
    round,
    stage: 'league' as const,
    team_a_id: teamAId,
    team_b_id: teamBId,
    status: 'pending' as const,
    court: courtForIndex(existingInRound ?? 0),
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}
```

Replace the whole function with:

```ts
export async function addCustomMatch(tournamentId: string, formData: FormData) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('format, custom_rounds, completed_at, results_unlocked_at')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (tournament?.format !== 'custom') {
    throw new Error('Matches can only be added manually for the Custom League format.');
  }

  if (!canEditScore(tournament?.completed_at ?? null, tournament?.results_unlocked_at ?? null)) {
    throw new Error('Scores are locked — unlock editing first to add a match.');
  }

  const targetRounds = tournament?.custom_rounds ?? 5;
  const roundRaw = formData.get('round');
  const round = typeof roundRaw === 'string' ? Number(roundRaw) : NaN;

  if (!Number.isInteger(round) || round < 1 || round > targetRounds) {
    throw new Error(`Round must be a whole number between 1 and ${targetRounds}`);
  }

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id')
    .eq('tournament_id', tournamentId);

  if (playersError) {
    throw new Error(playersError.message);
  }

  const { data: fixedTeams, error: fixedTeamsError } = await supabase
    .from('teams')
    .select('player_1_id, player_2_id')
    .eq('tournament_id', tournamentId)
    .eq('is_ad_hoc', false);

  if (fixedTeamsError) {
    throw new Error(fixedTeamsError.message);
  }

  const fixedPairedPlayerIds = new Set(
    (fixedTeams ?? []).flatMap((t) => [t.player_1_id, t.player_2_id])
  );
  const isDynamicMode = (players ?? []).some((p) => !fixedPairedPlayerIds.has(p.id));

  let teamAId: string;
  let teamBId: string;

  if (isDynamicMode) {
    const teamAPlayer1 = formData.get('teamAPlayer1Id');
    const teamAPlayer2 = formData.get('teamAPlayer2Id');
    const teamBPlayer1 = formData.get('teamBPlayer1Id');
    const teamBPlayer2 = formData.get('teamBPlayer2Id');

    if (
      typeof teamAPlayer1 !== 'string' ||
      !teamAPlayer1 ||
      typeof teamAPlayer2 !== 'string' ||
      !teamAPlayer2 ||
      typeof teamBPlayer1 !== 'string' ||
      !teamBPlayer1 ||
      typeof teamBPlayer2 !== 'string' ||
      !teamBPlayer2
    ) {
      throw new Error('All 4 players must be selected');
    }

    const selectedPlayerIds = [teamAPlayer1, teamAPlayer2, teamBPlayer1, teamBPlayer2];
    if (new Set(selectedPlayerIds).size !== 4) {
      throw new Error('All 4 selected players must be different');
    }

    const { data: validPlayers, error: validPlayersError } = await supabase
      .from('players')
      .select('id')
      .eq('tournament_id', tournamentId)
      .in('id', selectedPlayerIds);

    if (validPlayersError) {
      throw new Error(validPlayersError.message);
    }

    const validPlayerIds = new Set((validPlayers ?? []).map((p) => p.id));
    if (selectedPlayerIds.some((pid) => !validPlayerIds.has(pid))) {
      throw new Error('Selected players must belong to this tournament');
    }

    const { data: roundMatches, error: roundMatchesError } = await supabase
      .from('matches')
      .select('team_a_id, team_b_id')
      .eq('tournament_id', tournamentId)
      .eq('stage', 'league')
      .eq('round', round);

    if (roundMatchesError) {
      throw new Error(roundMatchesError.message);
    }

    const busyTeamIds = new Set(
      (roundMatches ?? []).flatMap((m) =>
        [m.team_a_id, m.team_b_id].filter((tid): tid is string => tid !== null)
      )
    );

    if (busyTeamIds.size > 0) {
      const { data: busyTeams, error: busyTeamsError } = await supabase
        .from('teams')
        .select('player_1_id, player_2_id')
        .in('id', [...busyTeamIds]);

      if (busyTeamsError) {
        throw new Error(busyTeamsError.message);
      }

      const busyPlayerIds = new Set((busyTeams ?? []).flatMap((t) => [t.player_1_id, t.player_2_id]));

      if (selectedPlayerIds.some((pid) => busyPlayerIds.has(pid))) {
        throw new Error('One of the selected players is already in a match this round');
      }
    }

    const { data: existingTeams, error: existingTeamsError } = await supabase
      .from('teams')
      .select('id, player_1_id, player_2_id')
      .eq('tournament_id', tournamentId);

    if (existingTeamsError) {
      throw new Error(existingTeamsError.message);
    }

    const teamIdByPairKey = new Map<string, string>();
    for (const t of existingTeams ?? []) {
      teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
    }

    const neededPairs: [string, string][] = [
      [teamAPlayer1, teamAPlayer2],
      [teamBPlayer1, teamBPlayer2],
    ];
    const newPairKeys = neededPairs.map(([a, b]) => pairKey(a, b)).filter((key) => !teamIdByPairKey.has(key));

    if (newPairKeys.length > 0) {
      const { data: insertedTeams, error: insertTeamsError } = await supabase
        .from('teams')
        .insert(
          newPairKeys.map((key) => {
            const [player1Id, player2Id] = key.split('|');
            return {
              tournament_id: tournamentId,
              player_1_id: player1Id,
              player_2_id: player2Id,
              is_ad_hoc: true,
            };
          })
        )
        .select('id, player_1_id, player_2_id');

      if (insertTeamsError) {
        throw new Error(insertTeamsError.message);
      }

      for (const t of insertedTeams ?? []) {
        teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
      }
    }

    teamAId = teamIdByPairKey.get(pairKey(teamAPlayer1, teamAPlayer2))!;
    teamBId = teamIdByPairKey.get(pairKey(teamBPlayer1, teamBPlayer2))!;
  } else {
    const teamAIdRaw = formData.get('teamAId');
    const teamBIdRaw = formData.get('teamBId');

    if (typeof teamAIdRaw !== 'string' || typeof teamBIdRaw !== 'string' || !teamAIdRaw || !teamBIdRaw) {
      throw new Error('Both teams must be selected');
    }

    if (teamAIdRaw === teamBIdRaw) {
      throw new Error('Team A and Team B must be different teams');
    }

    const { data: validTeams, error: teamsError } = await supabase
      .from('teams')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('is_ad_hoc', false)
      .in('id', [teamAIdRaw, teamBIdRaw]);

    if (teamsError) {
      throw new Error(teamsError.message);
    }

    const validIds = new Set((validTeams ?? []).map((t) => t.id));
    if (!validIds.has(teamAIdRaw) || !validIds.has(teamBIdRaw)) {
      throw new Error('Selected teams must belong to this tournament');
    }

    teamAId = teamAIdRaw;
    teamBId = teamBIdRaw;
  }

  const { count: existingInRound, error: existingInRoundError } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league')
    .eq('round', round);

  if (existingInRoundError) {
    throw new Error(existingInRoundError.message);
  }

  const { error } = await supabase.from('matches').insert({
    tournament_id: tournamentId,
    round,
    stage: 'league' as const,
    team_a_id: teamAId,
    team_b_id: teamBId,
    status: 'pending' as const,
    court: courtForIndex(existingInRound ?? 0),
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}
```

Key changes: the `players`-count-only query is replaced by a `players` query plus a `fixedTeams` query filtered to `is_ad_hoc = false`; `isOddMode` becomes `isDynamicMode`, computed from unpaired-players-against-fixed-teams; the even-mode team validation query adds `.eq('is_ad_hoc', false)` so an ad-hoc team id can never validate as a selectable team; new ad-hoc team inserts (dynamic-mode branch) set `is_ad_hoc: true`.

- [ ] **Step 2: Verify**

Run: `npm test` (from `apps/organizer-web`) — expect all existing tests still pass.
Run: `npm run build` (from `apps/organizer-web`) — expect a clean TypeScript build.

- [ ] **Step 3: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/actions.ts"
git commit -m "fix: isolate fixed-team pool from ad-hoc teams in addCustomMatch"
```

---

### Task 5: Bracket page — fixed-team pool + trigger update

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`

**Interfaces:** none — pure UI change, consumes nothing new from other tasks.

- [ ] **Step 1: Add `is_ad_hoc` to the teams select and derive `fixedTeams`**

Change:

```ts
  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', id);
```

to:

```ts
  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id, is_ad_hoc')
    .eq('tournament_id', id);

  const fixedTeams = (teams ?? []).filter((t) => !t.is_ad_hoc);
```

- [ ] **Step 2: Replace the trigger/mode computation and add `customFixedTeamCount`**

Change:

```ts
  const teamCount = (teams ?? []).length;
  const playerCount = (players ?? []).length;
  const isOddMode = playerCount % 2 === 1;
```

to:

```ts
  const teamCount = (teams ?? []).length;
  const playerCount = (players ?? []).length;
  const customFixedTeamCount = fixedTeams.length;
  const fixedPairedPlayerIds = new Set(fixedTeams.flatMap((t) => [t.player_1_id, t.player_2_id]));
  const isDynamicMode = (players ?? []).some((p) => !fixedPairedPlayerIds.has(p.id));
```

`teamCount` is left completely unchanged (still the unfiltered count) — it's shared with `league_playoffs`-only logic elsewhere in this file (`leaguePlayoffsFullRounds`, `showGenerateSemifinals`, the round-robin/league-playoffs banners) and must not be touched.

- [ ] **Step 3: Use `customFixedTeamCount` for the coverage message**

Change:

```ts
  const customFullCoverageRoundsValue = isCustom ? customFullCoverageRounds(teamCount) : 0;
```

to:

```ts
  const customFullCoverageRoundsValue = isCustom ? customFullCoverageRounds(customFixedTeamCount) : 0;
```

- [ ] **Step 4: Replace the "Add Match" card**

The card currently reads (exact current text):

```tsx
      {isCustom && canEditScoreValue && (
        <div className={`${actionCardClass} mb-6`}>
          <h2 className="text-sm font-bold text-navy-mid uppercase tracking-wide mb-1">
            Add Match
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            Target: {customTargetRounds} round{customTargetRounds === 1 ? '' : 's'} — highest
            round added so far: {currentCustomMaxRound || 'none yet'}.
          </p>
          {isOddMode && (
            <p className="text-xs text-navy-mid bg-navy-tint rounded-lg px-3 py-2 mb-3">
              Odd number of players — matches are paired by individual player instead of saved
              teams until the count is even again.
            </p>
          )}
          {(isOddMode ? playerCount < 4 : teamCount < 2) ? (
            <p className="text-sm text-red-700">
              {isOddMode
                ? 'Need at least 4 players before you can add a match.'
                : 'Need at least 2 teams before you can add a match — go back and pair more teams first.'}
            </p>
          ) : (
            <>
              {!isOddMode && (
                <p className="text-xs text-slate-400 mb-3">
                  Full round-robin coverage for {teamCount} team{teamCount === 1 ? '' : 's'} needs{' '}
                  {customFullCoverageRoundsValue} round{customFullCoverageRoundsValue === 1 ? '' : 's'}.
                </p>
              )}
              {currentCustomMaxRound < customTargetRounds && (
                <form action={autoGenerateCustomRoundWithId} className="mb-4">
                  <SaveButton className={accentButtonClass} pendingLabel="Generating…">
                    Auto-generate Round {currentCustomMaxRound + 1}
                  </SaveButton>
                </form>
              )}
              <form action={addCustomMatchWithId} className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Round</label>
                  <input
                    name="round"
                    type="number"
                    defaultValue={1}
                    min={1}
                    max={customTargetRounds}
                    required
                    className={`${inputClass} w-20`}
                  />
                </div>
                {isOddMode ? (
                  <>
                    <div className="flex items-end gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          Team A — Player 1
                        </label>
                        <select name="teamAPlayer1Id" defaultValue="" required className={inputClass}>
                          <option value="" disabled>
                            Select player
                          </option>
                          {(players ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          Team A — Player 2
                        </label>
                        <select name="teamAPlayer2Id" defaultValue="" required className={inputClass}>
                          <option value="" disabled>
                            Select player
                          </option>
                          {(players ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <span className="text-slate-400 font-bold pb-2">vs</span>
                    <div className="flex items-end gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          Team B — Player 1
                        </label>
                        <select name="teamBPlayer1Id" defaultValue="" required className={inputClass}>
                          <option value="" disabled>
                            Select player
                          </option>
                          {(players ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          Team B — Player 2
                        </label>
                        <select name="teamBPlayer2Id" defaultValue="" required className={inputClass}>
                          <option value="" disabled>
                            Select player
                          </option>
                          {(players ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Team A</label>
                      <select name="teamAId" defaultValue="" required className={inputClass}>
                        <option value="" disabled>
                          Select team
                        </option>
                        {(teams ?? []).map((t) => (
                          <option key={t.id} value={t.id}>
                            {teamById.get(t.id)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <span className="text-slate-400 font-bold pb-2">vs</span>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Team B</label>
                      <select name="teamBId" defaultValue="" required className={inputClass}>
                        <option value="" disabled>
                          Select team
                        </option>
                        {(teams ?? []).map((t) => (
                          <option key={t.id} value={t.id}>
                            {teamById.get(t.id)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                <SaveButton className={accentButtonClass} pendingLabel="Adding…">
                  Add Match
                </SaveButton>
              </form>
            </>
          )}
        </div>
      )}
```

Replace the whole block with:

```tsx
      {isCustom && canEditScoreValue && (
        <div className={`${actionCardClass} mb-6`}>
          <h2 className="text-sm font-bold text-navy-mid uppercase tracking-wide mb-1">
            Add Match
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            Target: {customTargetRounds} round{customTargetRounds === 1 ? '' : 's'} — highest
            round added so far: {currentCustomMaxRound || 'none yet'}.
          </p>
          {isDynamicMode && (
            <p className="text-xs text-navy-mid bg-navy-tint rounded-lg px-3 py-2 mb-3">
              A player is unpaired — matches are paired by individual player instead of saved
              teams until everyone has a fixed partner again.
            </p>
          )}
          {(isDynamicMode ? playerCount < 4 : customFixedTeamCount < 2) ? (
            <p className="text-sm text-red-700">
              {isDynamicMode
                ? 'Need at least 4 players before you can add a match.'
                : 'Need at least 2 teams before you can add a match — go back and pair more teams first.'}
            </p>
          ) : (
            <>
              {!isDynamicMode && (
                <p className="text-xs text-slate-400 mb-3">
                  Full round-robin coverage for {customFixedTeamCount} team{customFixedTeamCount === 1 ? '' : 's'} needs{' '}
                  {customFullCoverageRoundsValue} round{customFullCoverageRoundsValue === 1 ? '' : 's'}.
                </p>
              )}
              {currentCustomMaxRound < customTargetRounds && (
                <form action={autoGenerateCustomRoundWithId} className="mb-4">
                  <SaveButton className={accentButtonClass} pendingLabel="Generating…">
                    Auto-generate Round {currentCustomMaxRound + 1}
                  </SaveButton>
                </form>
              )}
              <form action={addCustomMatchWithId} className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Round</label>
                  <input
                    name="round"
                    type="number"
                    defaultValue={1}
                    min={1}
                    max={customTargetRounds}
                    required
                    className={`${inputClass} w-20`}
                  />
                </div>
                {isDynamicMode ? (
                  <>
                    <div className="flex items-end gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          Team A — Player 1
                        </label>
                        <select name="teamAPlayer1Id" defaultValue="" required className={inputClass}>
                          <option value="" disabled>
                            Select player
                          </option>
                          {(players ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          Team A — Player 2
                        </label>
                        <select name="teamAPlayer2Id" defaultValue="" required className={inputClass}>
                          <option value="" disabled>
                            Select player
                          </option>
                          {(players ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <span className="text-slate-400 font-bold pb-2">vs</span>
                    <div className="flex items-end gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          Team B — Player 1
                        </label>
                        <select name="teamBPlayer1Id" defaultValue="" required className={inputClass}>
                          <option value="" disabled>
                            Select player
                          </option>
                          {(players ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          Team B — Player 2
                        </label>
                        <select name="teamBPlayer2Id" defaultValue="" required className={inputClass}>
                          <option value="" disabled>
                            Select player
                          </option>
                          {(players ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Team A</label>
                      <select name="teamAId" defaultValue="" required className={inputClass}>
                        <option value="" disabled>
                          Select team
                        </option>
                        {fixedTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {teamById.get(t.id)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <span className="text-slate-400 font-bold pb-2">vs</span>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Team B</label>
                      <select name="teamBId" defaultValue="" required className={inputClass}>
                        <option value="" disabled>
                          Select team
                        </option>
                        {fixedTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {teamById.get(t.id)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                <SaveButton className={accentButtonClass} pendingLabel="Adding…">
                  Add Match
                </SaveButton>
              </form>
            </>
          )}
        </div>
      )}
```

Note: `teamById` (used for display labels) is intentionally left reading from the unfiltered `teams` map built earlier in the file — ad-hoc teams still need a display name wherever a match involving them is rendered elsewhere on this page. Only the dropdown *options* and the *count* used for gating/coverage-math switch to `fixedTeams`.

- [ ] **Step 5: Verify**

Run: `npm run build` (from `apps/organizer-web`) — expect a clean TypeScript build (this page has no test file — see Global Constraints).

- [ ] **Step 6: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx"
git commit -m "fix: use fixed-team pool for Add Match dropdown and trigger on bracket page"
```

---

### Task 6: Teams page — hide ad-hoc teams, update trigger

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/teams/page.tsx`

**Interfaces:** none — pure UI change.

- [ ] **Step 1: Add `is_ad_hoc` to the teams select and derive `fixedTeams`**

Change:

```ts
  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', id);
```

to:

```ts
  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id, is_ad_hoc')
    .eq('tournament_id', id);

  const fixedTeams = (teams ?? []).filter((t) => !t.is_ad_hoc);
```

- [ ] **Step 2: Base `pairedPlayerIds` on fixed teams only**

Change:

```ts
  const pairedPlayerIds = new Set(
    (teams ?? []).flatMap((t) => [t.player_1_id, t.player_2_id])
  );
```

to:

```ts
  const pairedPlayerIds = new Set(
    fixedTeams.flatMap((t) => [t.player_1_id, t.player_2_id])
  );
```

- [ ] **Step 3: Reword and re-gate the odd-count note**

Change:

```tsx
      {tournament?.format === 'custom' && (players ?? []).length % 2 === 1 && (
        <div className="rounded-lg bg-navy-tint border border-navy-mid/25 text-navy-deep text-sm px-4 py-3 mb-6">
          Odd number of players signed up — the extra player won&apos;t be stuck on the bench.
          Matches generated while the count is odd pair players directly instead of using the
          teams below, so everyone still gets games.
        </div>
      )}
```

to:

```tsx
      {tournament?.format === 'custom' && unpairedPlayers.length > 0 && (
        <div className="rounded-lg bg-navy-tint border border-navy-mid/25 text-navy-deep text-sm px-4 py-3 mb-6">
          {unpairedPlayers.length} player{unpairedPlayers.length === 1 ? '' : 's'} unpaired —
          nobody is stuck on the bench. Matches generated while anyone is unpaired pair players
          directly instead of using the teams below, so everyone still gets games.
        </div>
      )}
```

- [ ] **Step 4: Show only fixed teams in the main Teams list**

Change:

```tsx
      <div className={`${cardClass} mb-6`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">Teams ({(teams ?? []).length})</h2>
        <ul className="space-y-2">
          {(teams ?? []).map((t) => {
```

to:

```tsx
      <div className={`${cardClass} mb-6`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">Teams ({fixedTeams.length})</h2>
        <ul className="space-y-2">
          {fixedTeams.map((t) => {
```

`teamCount` (used only for the League + Playoffs cap check and header badge, both unrelated to Custom League) is left unchanged.

- [ ] **Step 5: Verify**

Run: `npm run build` (from `apps/organizer-web`) — expect a clean TypeScript build (this page has no test file — see Global Constraints).

- [ ] **Step 6: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/teams/page.tsx"
git commit -m "fix: hide ad-hoc teams from Teams page and update unpaired-player trigger"
```

---

### Task 7: Individual standings and champion for Custom League

**Files:**
- Modify: `apps/organizer-web/lib/tournament/champion.ts`
- Modify: `apps/organizer-web/lib/tournament/champion.test.ts`
- Modify: `apps/organizer-web/app/tournaments/[id]/results/page.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/standings/page.tsx`

**Interfaces:**
- Consumes: `usesIndividualStandings(format: string): boolean` from `@/lib/tournament/formats` (Task 2).

- [ ] **Step 1: Write the failing test**

The current `apps/organizer-web/lib/tournament/champion.test.ts` starts with:

```ts
import { describe, it, expect } from 'vitest';
import { computeTournamentChampionName, computeTournamentChampionPersonIds } from './champion';

const teamsFixture = [
  { id: 't1', player_1_id: 'p1', player_2_id: 'p2' },
  { id: 't2', player_1_id: 'p3', player_2_id: 'p4' },
];

const playersFixture = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
  { id: 'p3', name: 'Carol' },
  { id: 'p4', name: 'Dave' },
];

describe('computeTournamentChampionName', () => {
```

Add a new test inside the `describe('computeTournamentChampionName', ...)` block (anywhere among its other `it(...)` cases):

```ts
  it('resolves a per-player champion for Custom League from a mix of fixed and ad-hoc teams', () => {
    const mixedTeams = [
      { id: 't1', player_1_id: 'p1', player_2_id: 'p2' },
      { id: 't2', player_1_id: 'p3', player_2_id: 'p4' },
      { id: 't3', player_1_id: 'p1', player_2_id: 'p4' },
      { id: 't4', player_1_id: 'p2', player_2_id: 'p3' },
    ];
    const result = computeTournamentChampionName({
      format: 'custom',
      completedAt: '2026-01-01T00:00:00Z',
      matches: [
        {
          stage: 'league',
          team_a_id: 't1',
          team_b_id: 't2',
          score_a: 11,
          score_b: 5,
          status: 'complete',
          round: 1,
          court: null,
        },
        {
          stage: 'league',
          team_a_id: 't3',
          team_b_id: 't4',
          score_a: 11,
          score_b: 5,
          status: 'complete',
          round: 2,
          court: null,
        },
      ],
      teams: mixedTeams,
      players: playersFixture,
    });
    // Alice (p1) wins both matches -- once on fixed team t1, once on ad-hoc team t3 --
    // for a 2-0 individual record. No single team has that record (t1 is 1-0, t3 is
    // 1-0), so a correct result here proves the champion is resolved per-player, not
    // per-team, for Custom League.
    expect(result).toBe('Alice');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/organizer-web`): `npx vitest run lib/tournament/champion.test.ts`
Expected: FAIL — with `format: 'custom'` currently resolved as a team format, the result is a team-name string (e.g. `"Alice / Bob"` or similar), not `'Alice'`.

- [ ] **Step 3: Update `champion.ts`**

Change:

```ts
import { isIndividualFormat, isLadderFormat as isLadderFormatCheck } from './formats';
```

to:

```ts
import { usesIndividualStandings, isLadderFormat as isLadderFormatCheck } from './formats';
```

Change:

```ts
  const isLadderFormat = isLadderFormatCheck(format);
  const isIndividual = isIndividualFormat(format);
```

to:

```ts
  const isLadderFormat = isLadderFormatCheck(format);
  const isIndividual = usesIndividualStandings(format);
```

(Every other usage of the local `isIndividual` variable in this file — the `individualStandings` gate, `championTeamId`, `championPlayerId` — is unchanged; only its derivation moved.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/tournament/champion.test.ts`
Expected: PASS, including the new test.

- [ ] **Step 5: Update `results/page.tsx`**

Change:

```ts
import { formatLabel, isIndividualFormat as isIndividualFormatCheck, isLadderFormat as isLadderFormatCheck } from '@/lib/tournament/formats';
```

to:

```ts
import { formatLabel, usesIndividualStandings, isLadderFormat as isLadderFormatCheck } from '@/lib/tournament/formats';
```

Change:

```ts
  const isIndividualFormat = isIndividualFormatCheck(tournament.format);
```

to:

```ts
  const isIndividualFormat = usesIndividualStandings(tournament.format);
```

(The local variable name `isIndividualFormat` is kept — every downstream usage in this file, including the standings title, export rows, and the standings table header/body, stays valid unchanged.)

- [ ] **Step 6: Update `standings/page.tsx`**

Change:

```ts
import { isIndividualFormat as isIndividualFormatCheck, isLadderFormat as isLadderFormatCheck } from '@/lib/tournament/formats';
```

to:

```ts
import { usesIndividualStandings, isLadderFormat as isLadderFormatCheck } from '@/lib/tournament/formats';
```

Change:

```ts
  const isIndividualFormat = isIndividualFormatCheck(tournament?.format ?? '');
```

to:

```ts
  const isIndividualFormat = usesIndividualStandings(tournament?.format ?? '');
```

- [ ] **Step 7: Verify**

Run: `npm test` (from `apps/organizer-web`) — expect all tests passing, including `champion.test.ts`'s new case.
Run: `npm run build` (from `apps/organizer-web`) — expect a clean TypeScript build (confirms `results/page.tsx` and `standings/page.tsx` still typecheck — these two files have no test files, per Global Constraints).

- [ ] **Step 8: Commit**

```bash
git add apps/organizer-web/lib/tournament/champion.ts apps/organizer-web/lib/tournament/champion.test.ts "apps/organizer-web/app/tournaments/[id]/results/page.tsx" "apps/organizer-web/app/tournaments/[id]/standings/page.tsx"
git commit -m "fix: route Custom League standings and champion through individual standings"
```

---

## After all tasks

Run the full suite once more from `apps/organizer-web`: `npm test && npm run build`. Then:

1. **Apply the Task 1 migration to the live Supabase project** (`npx supabase db push` or the dashboard SQL editor) — the code will not work correctly at runtime without it, and neither `npm test` nor `npm run build` can catch a missing column in this codebase (no schema-typed Supabase client).
2. Live-check with the dev server (`organizer-web` launch config, port 3000): create a Custom League tournament with 5 players, pair 2 into a fixed team, leave 3 unpaired, generate a round (confirm dynamic pairing, no permanently-benched player), pair the fixed team's players differently, generate another round with an even, fully-paired roster (confirm it uses fixed teams and no match features a repeated player on both sides), and confirm the Standings/Results pages show individual (not team) rows with a sensible champion once the tournament is marked complete.
