# Guest Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `guest` role that can create tournaments/leagues, generate rounds, and enter/skip scores inside the existing organizer's workspace, but can never delete or modify anything.

**Architecture:** A new `organizer_members` table (role: `owner`/`guest`) replaces the current 1-login-1-workspace assumption; a `guest_invites` email allowlist links a new sign-in into an existing workspace via the existing `handle_new_user()` Postgres trigger. `requireOrganizer()` (the one choke-point nearly every server action already calls) now returns a `role`, and a new `requireOwner()` wrapper gates the 13 actions that delete or modify existing data. RLS is generalized the same way as defense-in-depth.

**Tech Stack:** Next.js App Router Server Actions, Supabase Postgres (RLS + a `security definer` trigger function), Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-04-guest-access-design.md` (read this first for the "why" behind every decision below — this plan only carries the "what").
- Guest-allowed actions (must keep working exactly as today, for both owner and guest): `createTournament`, `pairTeam`, `shuffleRemaining`, `startAddPlayers`, `addExistingPeople`, `confirmAddPlayers`, `addCustomMatch`, `generateBracket`, `generateLeaguePlayoffsBracket`, `generatePopcornBracket`, `regenerateLeaguePlayoffsBracket`, `advanceGauntletRound`, `advanceClaimTheThroneRound`, `advanceUpAndDownRiverRound`, `generateSemifinalMatches`, `skipToFinalMatch`, `generateFinalMatch`, `autoGenerateCustomRound`, `enterScore`, `skipMatch`.
- Owner-only actions (must throw for a guest caller): `cancelTournament`, `removeTeam`, `removePlayer`, `removeCustomMatch`, `updateTournamentDetails`, `renameTournament`, `updateMatchTeams`, `unlockTournamentResults`, `lockTournamentResults`, `updatePersonProfile`, `uploadPersonPhoto`, `removePersonPhoto`, `deletePerson`.
- A blocked action throws a clear error ("Only the workspace owner can do this.") — never a silent no-op.
- No existing test may regress: `npx vitest run` must stay at its current pass count or higher, `npx tsc --noEmit` clean, `npx eslint` clean on every changed file, `npm run build` clean.
- Every commit message ends with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Database migration — `organizer_members`, `guest_invites`, trigger rewrite, RLS

**Files:**
- Create: `supabase/migrations/20260904120000_add_guest_access.sql`

**Interfaces:**
- Produces: table `public.organizer_members(id, organizer_id, auth_user_id, email, role, created_at)`; table `public.guest_invites(id, organizer_id, email, created_at)`; SQL functions `public.current_organizer_id()`, `public.current_organizer_role()`, `public.is_organizer_member(t_id uuid)`, `public.is_organizer_owner(t_id uuid)`. Task 2 reads `role` off `organizer_members` by joining to `organizers`. Task 4/5 read/write `organizer_members` (`role = 'guest'`) and `guest_invites` directly.

This task is SQL-only — there is no local Postgres/pgTAP harness in this repo (confirmed: no `supabase/config.toml`-driven test setup, no Docker available in this environment), so correctness here is established by careful review now and by live verification against the real database in Task 7, exactly like this repo's prior migrations (see `supabase/migrations/20260820190000_add_tournament_results_unlocked_at.sql` and its sibling plan's Task 7).

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260904120000_add_guest_access.sql`:

```sql
-- Guest access: a workspace ("organizer") can now have more than one
-- signed-in person acting on it. organizer_members is the membership row
-- that used to be implicit in organizers.auth_user_id being unique; email
-- is duplicated here (not looked up from auth.users, a protected schema
-- the app's normal client can't query) so the Settings page can show who a
-- guest is without a second privileged lookup.
create table public.organizer_members (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'guest')),
  created_at timestamptz not null default now()
);

-- Pending guest invites, matched by email at sign-in time and deleted once claimed.
create table public.guest_invites (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (organizer_id, email)
);

alter table public.organizer_members enable row level security;
alter table public.guest_invites enable row level security;

-- Backfill: every existing organizer becomes their own 'owner' member.
-- (organizers.name isn't necessarily an email, so email is copied from
-- auth.users -- this migration runs with elevated privileges and can read
-- the protected auth schema directly, unlike the app's normal client.)
insert into public.organizer_members (organizer_id, auth_user_id, email, role)
select o.id, o.auth_user_id, u.email, 'owner'
from public.organizers o
join auth.users u on u.id = o.auth_user_id;

-- Helper functions used by RLS policies below (security definer so they
-- read organizer_members/organizers without RLS recursion -- the exact
-- pattern is_tournament_owner() already used successfully in this schema).
create or replace function public.current_organizer_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select organizer_id from public.organizer_members where auth_user_id = auth.uid();
$$;

create or replace function public.current_organizer_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.organizer_members where auth_user_id = auth.uid();
$$;

-- Generalizes is_tournament_owner(t_id): true for the owner OR a guest of
-- the tournament's workspace. Existing callers of is_tournament_owner keep
-- working unchanged (kept as an alias) except where noted below.
create or replace function public.is_organizer_member(t_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = t_id and t.organizer_id = public.current_organizer_id()
  );
$$;

create or replace function public.is_organizer_owner(t_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_organizer_member(t_id) and public.current_organizer_role() = 'owner';
$$;

-- is_tournament_owner is still referenced by its original name nowhere
-- after this migration (every call site below is rewritten), but is kept
-- defined as an alias rather than dropped, in case anything outside this
-- repo's tracked migrations depends on it.
create or replace function public.is_tournament_owner(t_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_organizer_member(t_id);
$$;

-- Rewrite handle_new_user(): check the guest_invites allowlist before
-- creating a brand-new workspace.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_invite public.guest_invites%rowtype;
  new_organizer_id uuid;
begin
  -- If the same email were ever invited by two different organizers (not
  -- possible today -- there is exactly one real owner in this app -- but
  -- not prevented by the schema either), this picks one arbitrarily
  -- (no order by). Acceptable for the current single-owner scale; would
  -- need real handling before a second independent organizer workspace
  -- ever exists.
  select * into matched_invite
  from public.guest_invites
  where lower(email) = lower(new.email)
  limit 1;

  if found then
    insert into public.organizer_members (organizer_id, auth_user_id, email, role)
    values (matched_invite.organizer_id, new.id, new.email, 'guest');

    delete from public.guest_invites where id = matched_invite.id;
  else
    insert into public.organizers (auth_user_id, name)
    values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email))
    returning id into new_organizer_id;

    insert into public.organizer_members (organizer_id, auth_user_id, email, role)
    values (new_organizer_id, new.id, new.email, 'owner');
  end if;

  return new;
end;
$$;

-- organizer_members RLS: anyone can read their own membership row (needed
-- by requireOrganizer() before their organizer_id is known); an owner can
-- also read/remove the guest rows in their own workspace. Only the trigger
-- (security definer, bypasses RLS) ever inserts a row.
create policy "organizer_members_select_self" on public.organizer_members
  for select using (auth_user_id = auth.uid());
create policy "organizer_members_select_workspace_owner" on public.organizer_members
  for select using (
    organizer_id = public.current_organizer_id()
    and public.current_organizer_role() = 'owner'
  );
create policy "organizer_members_delete_guest_by_owner" on public.organizer_members
  for delete using (
    organizer_id = public.current_organizer_id()
    and public.current_organizer_role() = 'owner'
    and role = 'guest'
  );

-- guest_invites RLS: owner-only, scoped to their own workspace.
create policy "guest_invites_all_owner" on public.guest_invites
  for all using (
    organizer_id = public.current_organizer_id()
    and public.current_organizer_role() = 'owner'
  )
  with check (
    organizer_id = public.current_organizer_id()
    and public.current_organizer_role() = 'owner'
  );

-- tournaments: INSERT and UPDATE become member-level (owner OR guest) --
-- UPDATE can't be split further in SQL because enterScore/skipMatch
-- (guest-allowed) and generateLeaguePlayoffsBracket (guest-allowed) share
-- the UPDATE verb on this table with renameTournament/updateTournamentDetails/
-- unlockTournamentResults/lockTournamentResults (owner-only); that split is
-- enforced by requireOwner() in Task 3. DELETE (cancelTournament) becomes
-- owner-only.
drop policy "tournaments_insert_own" on public.tournaments;
drop policy "tournaments_update_own" on public.tournaments;
drop policy "tournaments_delete_own" on public.tournaments;

create policy "tournaments_insert_member" on public.tournaments
  for insert with check (organizer_id = public.current_organizer_id());
create policy "tournaments_update_member" on public.tournaments
  for update using (organizer_id = public.current_organizer_id());
create policy "tournaments_delete_owner" on public.tournaments
  for delete using (
    organizer_id = public.current_organizer_id()
    and public.current_organizer_role() = 'owner'
  );

-- players: INSERT stays member-level; DELETE (removePlayer) becomes
-- owner-only. UPDATE also becomes owner-only -- the only players UPDATE in
-- the app is the owner-only updatePersonProfile rename cascade, so this
-- needs no member/owner split, unlike tournaments/matches.
drop policy "players_update_own_tournament" on public.players;
drop policy "players_delete_own_tournament" on public.players;

create policy "players_update_owner" on public.players
  for update using (public.is_organizer_owner(tournament_id));
create policy "players_delete_owner" on public.players
  for delete using (public.is_organizer_owner(tournament_id));

-- teams: DELETE (removeTeam) becomes owner-only. (No teams UPDATE policy
-- exists today; none is added.)
drop policy "teams_delete_own_tournament" on public.teams;

create policy "teams_delete_owner" on public.teams
  for delete using (public.is_organizer_owner(tournament_id));

-- matches: UPDATE stays member-level for the same reason as tournaments
-- (enterScore/skipMatch vs. updateMatchTeams share the UPDATE verb; split
-- enforced by requireOwner() in Task 3). DELETE becomes owner-only.
drop policy "matches_update_own_tournament" on public.matches;
drop policy "matches_delete_own_tournament" on public.matches;

create policy "matches_update_member" on public.matches
  for update using (public.is_organizer_member(tournament_id));
create policy "matches_delete_owner" on public.matches
  for delete using (public.is_organizer_owner(tournament_id));

-- people: UPDATE and DELETE become owner-only (every people/[id]/actions.ts
-- action is owner-only). INSERT stays member-level (confirmAddPlayers /
-- addExistingPeople, both guest-allowed, insert into people).
drop policy "people_update_own" on public.people;
drop policy "people_delete_own" on public.people;

create policy "people_update_owner" on public.people
  for update using (
    organizer_id = public.current_organizer_id()
    and public.current_organizer_role() = 'owner'
  );
create policy "people_delete_owner" on public.people
  for delete using (
    organizer_id = public.current_organizer_id()
    and public.current_organizer_role() = 'owner'
  );
```

Note what is deliberately left untouched: `organizers_select_own`/`organizers_insert_own`/`organizers_update_own` (the trigger still inserts exactly one `organizers` row per brand-new workspace, unchanged), every `_select_all` policy (read access was never owner-scoped), `people_insert_own`/`players_insert_own_tournament`/`teams_insert_own_tournament`/`matches_insert_own_tournament` (still member-level via `is_tournament_owner`, now an alias for `is_organizer_member` — no behavior change), and the public-signup policies from `20260824190000_tighten_public_signup_policies.sql` (anonymous/cross-organizer, untouched by this feature).

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260904120000_add_guest_access.sql
git commit -m "feat: add guest access migration (organizer_members, guest_invites)"
```

Not applied to the live database in this task — that happens in Task 7.

---

### Task 2: `requireOrganizer()` / `requireOwner()`

**Files:**
- Modify: `apps/organizer-web/lib/supabase/requireOrganizer.ts`
- Create: `apps/organizer-web/lib/supabase/requireOrganizer.test.ts`

**Interfaces:**
- Consumes: table `organizer_members` (from Task 1) with columns `role`, `auth_user_id`, embedded `organizers(id, name)`.
- Produces: `requireOrganizer(): Promise<{ supabase: SupabaseClient; organizer: { id: string; name: string }; role: 'owner' | 'guest' }>`, `requireOwner(): Promise<{ supabase: SupabaseClient; organizer: { id: string; name: string }; role: 'owner' }>` (throws instead of returning if the caller is a guest). Every action in Tasks 3-5 imports one of these two.

- [ ] **Step 1: Write the failing tests**

Create `apps/organizer-web/lib/supabase/requireOrganizer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockSingle = vi.fn();

vi.mock('./server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockSingle,
        })),
      })),
    })),
  })),
}));

import { requireOrganizer, requireOwner } from './requireOrganizer';

describe('requireOrganizer', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockSingle.mockReset();
  });

  it('returns the organizer and role for an owner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockSingle.mockResolvedValue({
      data: { role: 'owner', organizers: { id: 'org-1', name: 'Ankit' } },
      error: null,
    });

    const result = await requireOrganizer();

    expect(result.organizer).toEqual({ id: 'org-1', name: 'Ankit' });
    expect(result.role).toBe('owner');
  });

  it('returns the organizer and role for a guest', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-2' } } });
    mockSingle.mockResolvedValue({
      data: { role: 'guest', organizers: { id: 'org-1', name: 'Ankit' } },
      error: null,
    });

    const result = await requireOrganizer();

    expect(result.role).toBe('guest');
    expect(result.organizer).toEqual({ id: 'org-1', name: 'Ankit' });
  });

  it('handles the embedded organizers relation coming back as an array', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-3' } } });
    mockSingle.mockResolvedValue({
      data: { role: 'owner', organizers: [{ id: 'org-2', name: 'Other' }] },
      error: null,
    });

    const result = await requireOrganizer();

    expect(result.organizer).toEqual({ id: 'org-2', name: 'Other' });
  });
});

describe('requireOwner', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockSingle.mockReset();
  });

  it('returns the result unchanged when the caller is the owner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockSingle.mockResolvedValue({
      data: { role: 'owner', organizers: { id: 'org-1', name: 'Ankit' } },
      error: null,
    });

    const result = await requireOwner();

    expect(result.role).toBe('owner');
    expect(result.organizer).toEqual({ id: 'org-1', name: 'Ankit' });
  });

  it('throws a clear error when the caller is a guest', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-2' } } });
    mockSingle.mockResolvedValue({
      data: { role: 'guest', organizers: { id: 'org-1', name: 'Ankit' } },
      error: null,
    });

    await expect(requireOwner()).rejects.toThrow('Only the workspace owner can do this.');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/organizer-web && npx vitest run lib/supabase/requireOrganizer.test.ts`
Expected: FAIL — `requireOwner` is not exported yet (and the current `requireOrganizer` queries `organizers` directly, not `organizer_members`, so its shape doesn't match either).

- [ ] **Step 3: Rewrite `requireOrganizer()` and add `requireOwner()`**

Replace the full contents of `apps/organizer-web/lib/supabase/requireOrganizer.ts`:

```typescript
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

type Organizer = { id: string; name: string };
type Role = 'owner' | 'guest';

export async function requireOrganizer(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  organizer: Organizer;
  role: Role;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: membership, error } = await supabase
    .from('organizer_members')
    .select('role, organizers(id, name)')
    .eq('auth_user_id', user.id)
    .single();

  if (error || !membership) {
    redirect('/login');
  }

  // Supabase's JS client returns an embedded belongs-to relation as a
  // single object, but is defensive about arrays here to match this
  // codebase's existing handling of embedded relations elsewhere (see
  // app/tournaments/page.tsx's venue lookup).
  const organizerRow = Array.isArray(membership!.organizers)
    ? membership!.organizers[0]
    : membership!.organizers;

  if (!organizerRow) {
    redirect('/login');
  }

  return {
    supabase,
    organizer: organizerRow as Organizer,
    role: membership!.role as Role,
  };
}

export async function requireOwner() {
  const result = await requireOrganizer();

  if (result.role !== 'owner') {
    throw new Error('Only the workspace owner can do this.');
  }

  return { ...result, role: 'owner' as const };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/organizer-web && npx vitest run lib/supabase/requireOrganizer.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Run the full suite and type-check**

Run: `cd apps/organizer-web && npx tsc --noEmit && npx vitest run`
Expected: `tsc` clean; every test file passes (existing count plus 7 new).

- [ ] **Step 6: Commit**

```bash
git add apps/organizer-web/lib/supabase/requireOrganizer.ts apps/organizer-web/lib/supabase/requireOrganizer.test.ts
git commit -m "feat: requireOrganizer() resolves through organizer_members; add requireOwner()"
```

---

### Task 3: Gate the 13 owner-only actions with `requireOwner()`

**Files:**
- Modify: `apps/organizer-web/app/tournaments/actions.ts` (`cancelTournament`)
- Modify: `apps/organizer-web/app/tournaments/[id]/teams/actions.ts` (`removeTeam`)
- Modify: `apps/organizer-web/app/tournaments/[id]/roster/actions.ts` (`removePlayer`, `updateTournamentDetails`)
- Modify: `apps/organizer-web/app/tournaments/[id]/results/actions.ts` (`renameTournament`)
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts` (`removeCustomMatch`, `updateMatchTeams`, `unlockTournamentResults`, `lockTournamentResults`)
- Modify: `apps/organizer-web/app/people/[id]/actions.ts` (`updatePersonProfile`, `uploadPersonPhoto`, `removePersonPhoto`, `deletePerson`)

**Interfaces:**
- Consumes: `requireOwner()` from Task 2 (`import { requireOwner } from '@/lib/supabase/requireOrganizer';`).

Every one of these 13 functions currently opens with the exact line `const { supabase } = await requireOrganizer();` (some destructure `organizer` too — those are untouched here since `requireOwner()` still returns `organizer`). This task swaps `requireOrganizer` for `requireOwner` in exactly these 13 functions, and nowhere else in these 6 files (each file also has guest-allowed functions that must keep calling plain `requireOrganizer()`).

This is mechanical wiring with no new logic of its own — `requireOwner()`'s throw behavior is already covered by Task 2's tests, so no new unit tests are added here. Verification is the full suite staying green plus the manual QA checklist in Task 7.

- [ ] **Step 1: `app/tournaments/actions.ts`**

Change the import and the one call site:

```typescript
import { requireOwner } from '@/lib/supabase/requireOrganizer';

export async function cancelTournament(tournamentId: string) {
  const { supabase } = await requireOwner();
```

- [ ] **Step 2: `app/tournaments/[id]/teams/actions.ts`**

This file has three functions calling `requireOrganizer()`: `pairTeam` (guest-allowed, line ~11), `shuffleRemaining` (guest-allowed, line ~59), and `removeTeam` (owner-only, line ~134). Add a second import and change only `removeTeam`'s call:

```typescript
import { requireOrganizer, requireOwner } from '@/lib/supabase/requireOrganizer';

export async function removeTeam(tournamentId: string, teamId: string) {
  const { supabase } = await requireOwner();
```

Leave `pairTeam` and `shuffleRemaining` calling `requireOrganizer()` unchanged.

- [ ] **Step 3: `app/tournaments/[id]/roster/actions.ts`**

This file has functions calling `requireOrganizer()`: `startAddPlayers` (guest-allowed), `confirmAddPlayers` (guest-allowed), `removePlayer` (owner-only), `updateTournamentDetails` (owner-only). Add the second import and change the two owner-only call sites:

```typescript
import { requireOrganizer, requireOwner } from '@/lib/supabase/requireOrganizer';

export async function removePlayer(tournamentId: string, playerId: string) {
  const { supabase } = await requireOwner();
```

```typescript
export async function updateTournamentDetails(tournamentId: string, formData: FormData) {
  const { supabase } = await requireOwner();
```

Leave `startAddPlayers` and `confirmAddPlayers` calling `requireOrganizer()` unchanged.

- [ ] **Step 4: `app/tournaments/[id]/results/actions.ts`**

This file's only server action is `renameTournament`, which is owner-only. Replace the import and call site:

```typescript
import { requireOwner } from '@/lib/supabase/requireOrganizer';

export async function renameTournament(
  tournamentId: string,
```
(next line, unchanged signature continues, then:)
```typescript
  const { supabase } = await requireOwner();
```

- [ ] **Step 5: `app/tournaments/[id]/bracket/actions.ts`**

This file has the most functions. Guest-allowed (leave calling `requireOrganizer()` unchanged): `generateBracket`, `generateLeaguePlayoffsBracket`, `regenerateLeaguePlayoffsBracket`, `generatePopcornBracket`, `advanceGauntletRound`, `advanceClaimTheThroneRound`, `advanceUpAndDownRiverRound`, `generateSemifinalMatches`, `skipToFinalMatch`, `generateFinalMatch`, `addCustomMatch`, `autoGenerateCustomRound`. Owner-only (change to `requireOwner()`): `updateMatchTeams`, `removeCustomMatch`, `unlockTournamentResults`, `lockTournamentResults`.

Add the second import:

```typescript
import { requireOrganizer, requireOwner } from '@/lib/supabase/requireOrganizer';
```

Change these four call sites:

```typescript
export async function updateMatchTeams(
  tournamentId: string,
  matchId: string,
  formData: FormData
) {
  const { supabase } = await requireOwner();
```

```typescript
export async function removeCustomMatch(tournamentId: string, matchId: string) {
  const { supabase } = await requireOwner();
```

```typescript
export async function unlockTournamentResults(tournamentId: string) {
  const { supabase } = await requireOwner();
```

```typescript
export async function lockTournamentResults(tournamentId: string) {
  const { supabase } = await requireOwner();
```

- [ ] **Step 6: `app/people/[id]/actions.ts`**

All four functions in this file are owner-only. Replace the import and all four call sites:

```typescript
import { requireOwner } from '@/lib/supabase/requireOrganizer';
```

```typescript
export async function updatePersonProfile(personId: string, formData: FormData) {
  const { supabase } = await requireOwner();
```

```typescript
export async function uploadPersonPhoto(personId: string, formData: FormData) {
  const { supabase, organizer } = await requireOwner();
```

```typescript
export async function removePersonPhoto(personId: string) {
  const { supabase, organizer } = await requireOwner();
```

```typescript
export async function deletePerson(personId: string) {
  const { supabase, organizer } = await requireOwner();
```

(Keep whichever of `supabase`/`organizer` each function already destructures — only the function name `requireOrganizer` → `requireOwner` changes.)

- [ ] **Step 7: Type-check, lint, test, build**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint app/tournaments/actions.ts app/tournaments/[id]/teams/actions.ts app/tournaments/[id]/roster/actions.ts app/tournaments/[id]/results/actions.ts app/tournaments/[id]/bracket/actions.ts app/people/[id]/actions.ts
npx vitest run
npm run build
```
Expected: all clean; test count unchanged from Task 2 (this task adds no new tests, per the reasoning above).

- [ ] **Step 8: Commit**

```bash
git add apps/organizer-web/app/tournaments/actions.ts apps/organizer-web/app/tournaments/[id]/teams/actions.ts apps/organizer-web/app/tournaments/[id]/roster/actions.ts apps/organizer-web/app/tournaments/[id]/results/actions.ts apps/organizer-web/app/tournaments/[id]/bracket/actions.ts apps/organizer-web/app/people/[id]/actions.ts
git commit -m "feat: gate the 13 delete/modify actions behind requireOwner()"
```

---

### Task 4: Guest invite management server actions

**Files:**
- Create: `apps/organizer-web/lib/settings/normalizeGuestEmail.ts`
- Create: `apps/organizer-web/lib/settings/normalizeGuestEmail.test.ts`
- Create: `apps/organizer-web/app/settings/actions.ts`

**Interfaces:**
- Produces: `normalizeGuestEmail(raw: string | null): string` (throws `Error` on empty/invalid input) — used by `addGuestInvite`. `addGuestInvite(formData: FormData): Promise<void>`, `removeGuestInvite(inviteId: string): Promise<void>`, `removeGuestMember(memberId: string): Promise<void>` — all three consumed by Task 5's page.
- Consumes: `requireOwner()` from Task 2.

- [ ] **Step 1: Write the failing test for the pure validation helper**

Create `apps/organizer-web/lib/settings/normalizeGuestEmail.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeGuestEmail } from './normalizeGuestEmail';

describe('normalizeGuestEmail', () => {
  it('lowercases and trims a valid email', () => {
    expect(normalizeGuestEmail('  Guest@Example.com  ')).toBe('guest@example.com');
  });

  it('throws on null', () => {
    expect(() => normalizeGuestEmail(null)).toThrow('Enter a valid email address.');
  });

  it('throws on an empty string', () => {
    expect(() => normalizeGuestEmail('   ')).toThrow('Enter a valid email address.');
  });

  it('throws when there is no @', () => {
    expect(() => normalizeGuestEmail('not-an-email')).toThrow('Enter a valid email address.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/organizer-web && npx vitest run lib/settings/normalizeGuestEmail.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the helper**

Create `apps/organizer-web/lib/settings/normalizeGuestEmail.ts`:

```typescript
export function normalizeGuestEmail(raw: string | null): string {
  const email = raw?.trim().toLowerCase() ?? '';

  if (!email || !email.includes('@')) {
    throw new Error('Enter a valid email address.');
  }

  return email;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/organizer-web && npx vitest run lib/settings/normalizeGuestEmail.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the server actions**

Create `apps/organizer-web/app/settings/actions.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/supabase/requireOrganizer';
import { normalizeGuestEmail } from '@/lib/settings/normalizeGuestEmail';

export async function addGuestInvite(formData: FormData) {
  const { supabase, organizer } = await requireOwner();
  const email = normalizeGuestEmail(formData.get('email') as string | null);

  const { error } = await supabase
    .from('guest_invites')
    .insert({ organizer_id: organizer.id, email });

  if (error) {
    if (error.code === '23505') {
      throw new Error('That email is already invited.');
    }
    throw new Error(error.message);
  }

  revalidatePath('/settings');
}

export async function removeGuestInvite(inviteId: string) {
  const { supabase, organizer } = await requireOwner();

  const { error } = await supabase
    .from('guest_invites')
    .delete()
    .eq('id', inviteId)
    .eq('organizer_id', organizer.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/settings');
}

export async function removeGuestMember(memberId: string) {
  const { supabase, organizer } = await requireOwner();

  const { error } = await supabase
    .from('organizer_members')
    .delete()
    .eq('id', memberId)
    .eq('organizer_id', organizer.id)
    .eq('role', 'guest');

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/settings');
}
```

- [ ] **Step 6: Type-check, lint, full test run**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint lib/settings/normalizeGuestEmail.ts app/settings/actions.ts
npx vitest run
```
Expected: all clean; 4 new tests passing on top of Task 2's.

- [ ] **Step 7: Commit**

```bash
git add apps/organizer-web/lib/settings/normalizeGuestEmail.ts apps/organizer-web/lib/settings/normalizeGuestEmail.test.ts apps/organizer-web/app/settings/actions.ts
git commit -m "feat: guest invite management server actions"
```

---

### Task 5: `/settings` page UI

**Files:**
- Create: `apps/organizer-web/app/settings/page.tsx`

**Interfaces:**
- Consumes: `requireOrganizer()` from Task 2; `addGuestInvite`/`removeGuestInvite`/`removeGuestMember` from Task 4; `OrganizerShell` (existing, `role` prop added in Task 6 — this task can pass `role` even before Task 6 wires it through everywhere else, since `OrganizerShell`'s prop is additive and optional); `SaveButton` (existing, `apps/organizer-web/app/components/SaveButton.tsx`).

No new pure logic here (this is a server component reading two tables and rendering forms already covered by Task 4's actions), so no new unit tests — verified via the manual QA checklist in Task 7, consistent with how every other page in this app is verified (no existing page has its own test file).

- [ ] **Step 1: Write the page**

Create `apps/organizer-web/app/settings/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import SaveButton from '@/app/components/SaveButton';
import { addGuestInvite, removeGuestInvite, removeGuestMember } from './actions';

export default async function SettingsPage() {
  const { supabase, organizer, role } = await requireOrganizer();

  if (role !== 'owner') {
    redirect('/tournaments');
  }

  const { data: guests } = await supabase
    .from('organizer_members')
    .select('id, email')
    .eq('organizer_id', organizer.id)
    .eq('role', 'guest')
    .order('created_at', { ascending: true });

  const { data: invites } = await supabase
    .from('guest_invites')
    .select('id, email')
    .eq('organizer_id', organizer.id)
    .order('created_at', { ascending: true });

  return (
    <OrganizerShell organizerName={organizer.name} role={role}>
      <h1 className="text-xl font-bold mb-2">Guests</h1>
      <p className="text-sm text-slate-600 mb-4">
        A guest can create tournaments and leagues, generate rounds, and enter scores —
        they can never delete or edit anything.
      </p>

      <form action={addGuestInvite} className="flex gap-2 mb-6">
        <input
          type="email"
          name="email"
          required
          placeholder="guest@gmail.com"
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <SaveButton
          className="rounded bg-slate-900 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
          pendingLabel="Adding…"
        >
          Add guest
        </SaveButton>
      </form>

      <div className="space-y-2">
        {(guests ?? []).map((g) => {
          const removeGuestMemberWithId = removeGuestMember.bind(null, g.id);
          return (
            <div key={g.id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
              <span className="text-sm">{g.email}</span>
              <form action={removeGuestMemberWithId}>
                <SaveButton className="text-sm text-red-600 font-semibold" pendingLabel="Removing…">
                  Remove
                </SaveButton>
              </form>
            </div>
          );
        })}
        {(invites ?? []).map((i) => {
          const removeGuestInviteWithId = removeGuestInvite.bind(null, i.id);
          return (
            <div key={i.id} className="flex items-center justify-between rounded border border-dashed border-slate-300 px-3 py-2">
              <span className="text-sm text-slate-500">{i.email} (pending)</span>
              <form action={removeGuestInviteWithId}>
                <SaveButton className="text-sm text-red-600 font-semibold" pendingLabel="Removing…">
                  Cancel invite
                </SaveButton>
              </form>
            </div>
          );
        })}
        {(guests ?? []).length === 0 && (invites ?? []).length === 0 && (
          <p className="text-sm text-slate-500">No guests yet.</p>
        )}
      </div>
    </OrganizerShell>
  );
}
```

- [ ] **Step 2: Type-check and lint**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint app/settings/page.tsx
```
Expected: clean. (`tsc` will only be fully clean once Task 6 adds the `role` prop to `OrganizerShell` — if doing these tasks out of order, do Task 6 first or expect a transient type error here.)

- [ ] **Step 3: Commit**

```bash
git add apps/organizer-web/app/settings/page.tsx
git commit -m "feat: add /settings page for managing guests"
```

---

### Task 6: Settings entry point in the nav

**Files:**
- Modify: `apps/organizer-web/app/components/OrganizerShell.tsx`
- Modify: `apps/organizer-web/app/tournaments/page.tsx`

**Interfaces:**
- Consumes: `role` from `requireOrganizer()` (Task 2), already available in `app/tournaments/page.tsx` at line 35 (`const { supabase, organizer } = await requireOrganizer();` becomes `const { supabase, organizer, role } = await requireOrganizer();`).

Only the `/tournaments` page (the landing page after login) gets the entry point in this pass — not all 13 pages that render `OrganizerShell`. This keeps the change small; threading `role` through every page is a trivial, low-risk follow-up once this ships, not required for the feature to work (an owner can always reach `/settings` directly, and this adds the one link from the page they land on).

- [ ] **Step 1: Add an optional `role` prop and a Settings link to `OrganizerShell`**

In `apps/organizer-web/app/components/OrganizerShell.tsx`, change the props signature:

```typescript
export default function OrganizerShell({
  children,
  organizerName,
  role,
}: {
  children: React.ReactNode;
  organizerName?: string;
  role?: 'owner' | 'guest';
}) {
```

Change the header's sign-out block to also show a Settings link, owner-only:

```tsx
{organizerName && (
  <div className="absolute top-3 right-4 flex items-center gap-3">
    {role === 'owner' && (
      <Link
        href="/settings"
        className="text-sm font-semibold bg-navy-mid/60 hover:bg-navy-mid transition-colors px-3 py-1.5 rounded-full backdrop-blur-sm"
      >
        Settings
      </Link>
    )}
    <span className="text-sm text-[#dbe4f5] hidden sm:inline">
      Hi, {organizerName}
    </span>
    <form action={signOut}>
      <SaveButton
        className="text-sm font-semibold bg-navy-mid/60 hover:bg-navy-mid transition-colors px-3 py-1.5 rounded-full backdrop-blur-sm disabled:opacity-50"
        pendingLabel="Signing out…"
      >
        Sign out
      </SaveButton>
    </form>
  </div>
)}
```

(This replaces the existing `<form action={signOut} className="absolute top-3 right-4 flex items-center gap-3">...</form>` block — the `<form>` now wraps only the sign-out button, with the outer `<div>` carrying the positioning classes it used to.)

- [ ] **Step 2: Pass `role` from the Tournaments page**

In `apps/organizer-web/app/tournaments/page.tsx`, change line 35:

```typescript
const { supabase, organizer, role } = await requireOrganizer();
```

And the file's one `<OrganizerShell>` call site (line 145):

```tsx
<OrganizerShell organizerName={organizer.name} role={role}>
```

- [ ] **Step 3: Type-check, lint, build**

```bash
cd apps/organizer-web
npx tsc --noEmit
npx eslint app/components/OrganizerShell.tsx app/tournaments/page.tsx app/settings/page.tsx
npm run build
```
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add apps/organizer-web/app/components/OrganizerShell.tsx apps/organizer-web/app/tournaments/page.tsx
git commit -m "feat: add a Settings entry point to the Tournaments page header"
```

---

### Task 7: Apply the migration, push, verify CI, manual QA

**Files:** none (verification-only task).

- [ ] **Step 1: Apply the migration to the live database**

Using a fresh, transient Supabase personal access token (never persisted to disk), apply Task 1's migration via the Supabase Management API's SQL execution endpoint. Verify afterward with introspection queries:
- `select count(*) from organizer_members;` returns at least 1 (the backfilled existing organizer).
- `select proname from pg_proc where proname in ('current_organizer_id', 'current_organizer_role', 'is_organizer_member', 'is_organizer_owner');` returns all 4.
- `select policyname from pg_policies where tablename = 'tournaments';` shows `tournaments_insert_member`, `tournaments_update_member`, `tournaments_delete_owner` (and no leftover `_own` policies).

- [ ] **Step 2: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 3: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 4: Hand off manual QA to the user**

This step cannot be completed by the agent: it requires a second real Google account signing in through the actual OAuth flow, which is outside what this session's tooling can drive (this session's own Browser pane has no authenticated session in this app — every attempt to reach an authenticated page this session hit the "Sign in with Google" wall). Report to the user, and ask them to work through this checklist with a second Google account they control:

1. On `/settings`, add that second account's Gmail address as a guest.
2. Sign in as that account (a different browser or incognito window).
3. Confirm it lands in the same workspace — tournaments the owner already created are visible.
4. As the guest: create a tournament, generate its rounds, enter a score. All should work exactly as they do for the owner.
5. As the guest: confirm there is no Cancel button on any tournament card, no Remove-team/Remove-player control, no rename/edit-details control, no team-reassignment control, no Unlock/Lock Editing button, and no edit/delete controls on a person's profile page. All should be entirely absent from the UI, not merely disabled.
6. As the guest: confirm `/settings` redirects away instead of showing the Guests UI.
7. As the owner: confirm the guest now appears in `/settings`, and "Remove" revokes them (have the guest try to sign in again afterward — with the migration in place, since `organizer_members.auth_user_id` is unique but their row was deleted, they should re-provision fresh — flag if this instead errors, since it is a genuine edge case not covered by any automated test in this plan: a guest removed and then invited again vs. a guest removed with no new invite, expected to hit `requireOrganizer()`'s existing `redirect('/login')` path since `handle_new_user()` only fires on a brand-new `auth.users` row, not a returning one with no membership).

Clean up any disposable test tournament/guest data used for this check afterward.
