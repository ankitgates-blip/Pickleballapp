# Guest Access Design

**Status:** Approved by user 2026-09-04. Proceeding to implementation plan.

## Problem

Today, every Google sign-in creates its own isolated `organizers` row (`organizers.auth_user_id` is unique) and can only ever see/manage tournaments it created itself. There is no way for a second person to help run the same organizer's leagues and tournaments.

The user wants to add a **guest**: someone who can create tournaments/leagues (including custom formats), generate rounds, and enter/skip match scores *inside the user's own workspace* — but cannot delete, cancel, or edit anything that already exists.

## Decisions made during brainstorming

1. **Shared workspace, not an isolated sandbox.** A guest operates inside the owner's existing organizer account — tournaments they create belong to the owner's workspace, visible and manageable by the owner like any other tournament.
2. **Invite by email allowlist**, not invite links/codes. The owner types the guest's Google email into a small UI; the next time that email signs in, it's linked into the owner's workspace as a guest instead of getting a new empty workspace.
3. **"Skip match" (marking a match as unplayed/walkover) is guest-allowed** — it's normal day-to-day running of a live round, not a correction to existing data.

## Data model

Two new tables. No changes to any existing table's columns.

```sql
-- One row per person's membership in a workspace. A login belongs to
-- exactly one workspace, either as its owner or as a guest in someone
-- else's -- auth_user_id is globally unique, not just per-organizer.
create table public.organizer_members (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'guest')),
  created_at timestamptz not null default now()
);

-- Pending guest invites, keyed by email (case-insensitive match at
-- sign-in time). Deleted once claimed.
create table public.guest_invites (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (organizer_id, email)
);
```

**Backward compatibility for existing solo organizers:** the sign-up path that today inserts a new `organizers` row (`organizers_insert_own` policy, triggered on first sign-in) must also insert a matching `organizer_members` row with `role = 'owner'`, `auth_user_id = auth.uid()`. This is the only change to the existing solo path, and produces no visible change in behavior for a user working alone.

**First-time account creation happens in `public.handle_new_user()`**, an existing `security definer` trigger function that already fires `after insert on auth.users` (see `supabase/migrations/20260708150259_init_schema.sql`) and today just inserts one `organizers` row per new login. This is the single place a brand-new Google account is ever provisioned — no app code path creates an `organizers` row — so it's the only place that needs to change, and it changes synchronously before the user's first app page ever loads:

1. Look up `guest_invites` for a row matching `new.email` (case-insensitive), any `organizer_id`.
2. If found: insert into `organizer_members` (`organizer_id` from the invite, `auth_user_id = new.id`, `role = 'guest'`), delete the invite row. Do **not** create an `organizers` row for this person.
3. If not found: insert a new `organizers` row (as today) and a matching `organizer_members` row (`organizer_id` = the new row's id, `auth_user_id = new.id`, `role = 'owner'`).

Because this resolves once at signup, `requireOrganizer()` never does first-time resolution — it only ever reads an already-existing `organizer_members` row for the current `auth.uid()`.

## Permission boundary

Every organizer-gated mutation in the app (i.e. every server action that calls `requireOrganizer()`) lives in one of 8 files: the 7 under `app/tournaments/**/actions.ts` plus `app/people/[id]/actions.ts` (roster-profile editing — missed in the first pass of this spec and added here). Two other action files exist (`app/t/[id]/actions.ts`, `app/login/actions.ts`) but neither calls `requireOrganizer()` — `joinLeague`/`setLeagueRsvp` are the public, unauthenticated sign-up path with their own separate authorization, and `signOut` isn't a data mutation — so neither is in scope for the owner/guest split. The boundary below is a straight split between "create/run" and "delete/modify":

**Guest-allowed (create / run the event):**
`createTournament`, `pairTeam`, `shuffleRemaining`, `startAddPlayers`, `addExistingPeople`, `confirmAddPlayers`, `addCustomMatch`, `generateBracket`, `generateLeaguePlayoffsBracket`, `generatePopcornBracket`, `advanceGauntletRound`, `advanceClaimTheThroneRound`, `advanceUpAndDownRiverRound`, `generateSemifinalMatches`, `skipToFinalMatch`, `generateFinalMatch`, `autoGenerateCustomRound`, `enterScore`, `skipMatch`.

**Owner-only (delete / modify existing data):**
`cancelTournament`, `removeTeam`, `removePlayer`, `removeCustomMatch`, `updateTournamentDetails`, `renameTournament`, `updateMatchTeams`, `unlockTournamentResults`, `lockTournamentResults`, `updatePersonProfile`, `uploadPersonPhoto`, `removePersonPhoto`, `deletePerson`, `regenerateLeaguePlayoffsBracket`. The four profile actions are a roster person's profile (name/nickname/photo) — editing or deleting one is unambiguously a modify/delete action, not part of creating or running an event. `regenerateLeaguePlayoffsBracket` deletes and re-creates the whole league schedule, which is destructive/corrective, not additive round generation (see Post-ship corrections below).

A guest calling an owner-only action gets a thrown error ("Only the workspace owner can do this") — never a silent no-op. The UI hides (not just disables) controls for actions a guest can't perform, following the existing pattern from the result-locking feature (`canEditScore`/`canEditTeams`).

## Enforcement

Two layers:

1. **`requireOrganizer()`** (in `lib/supabase/requireOrganizer.ts`, already the single choke-point nearly every server action calls) changes its lookup from `organizers.auth_user_id` directly to `organizer_members.auth_user_id` (joined to `organizers` for the name), since by the time any app code runs, `handle_new_user()` has already guaranteed a membership row exists. It returns `{ supabase, organizer, role }` instead of `{ supabase, organizer }`; every existing call site keeps compiling and working unchanged since object destructuring of a supertype is source-compatible.
2. **`requireOwner()`**, a new helper wrapping `requireOrganizer()`, throws if `role !== 'owner'`. The 13 owner-only actions call this instead of `requireOrganizer()` directly — a one-line change per action.

**RLS (defense-in-depth, not the primary gate):** `is_tournament_owner(t_id)` is renamed/generalized to `is_organizer_member(t_id)` (true for owner OR guest), and a new `is_organizer_owner(t_id)` (true for owner only) is added alongside it. Per table:
- `tournaments`, `matches`: INSERT and UPDATE use `is_organizer_member` (member-level — see the accepted gap below for why UPDATE can't be tightened further); DELETE uses `is_organizer_owner`.
- `players`, `teams`: INSERT uses `is_organizer_member`; DELETE uses `is_organizer_owner`. (`players` also gets an UPDATE policy using `is_organizer_owner` — today's `players_update_own_tournament` policy exists but no current action performs a `players` UPDATE except the owner-only `updatePersonProfile` rename cascade, so it's cleanly owner-only, no gap.)
- `people`: INSERT uses `is_organizer_member`-equivalent (organizer match, no per-tournament owner concept here); UPDATE and DELETE use the owner-only equivalent, matching that all four `people/[id]/actions.ts` actions are owner-only.

**Known accepted gap:** two tables' UPDATE policies are each used by both a guest-allowed and an owner-only action, and Postgres RLS cannot distinguish "which action called this" or "which columns changed" without a trigger — more machinery than this feature needs. Both stay member-level (owner OR guest) in RLS, with the owner-only split enforced at the `requireOwner()` layer in the app code instead:
- `matches` UPDATE: `enterScore`/`skipMatch` (guest-allowed) vs. `updateMatchTeams` (owner-only).
- `tournaments` UPDATE: `enterScore` and `skipMatch` both update `tournaments.completed_at` as a side effect via the shared `checkAndMarkTournamentComplete()` helper (`app/tournaments/[id]/matches/actions.ts`) when the last match finishes, and `generateLeaguePlayoffsBracket`/`regenerateLeaguePlayoffsBracket` update `tournaments.league_playoffs_rounds` — all guest-allowed — vs. `updateTournamentDetails`, `renameTournament`, `unlockTournamentResults`, `lockTournamentResults` (owner-only), all of which also write to `tournaments`.

This is the same shape of trust boundary this app already relies on for `canEditScore`/`canEditTeams` state-based gating. RLS still blocks a non-member entirely; it just can't further split a member's UPDATE grant on these two tables by column. Called out here explicitly rather than left as a silent gap.

## Guest management UI

A new `/settings` page (none exists yet, so this becomes the natural home for future settings too) with a "Guests" section:
- Add a guest by email (writes a `guest_invites` row).
- List pending invites and current guests (from `organizer_members` where `role = 'guest'`).
- "Remove" button on either — deletes the row immediately, no confirmation dialog needed (it only revokes access; it never touches tournament data).

Owner-only page: a guest who navigates to `/settings` is redirected to `/tournaments`, the same pattern `requireOrganizer()`'s callers already use for other access checks (e.g. redirecting to `/login`).

## Out of scope for this pass

- Invite links/codes (deferred; email-allowlist covers the stated need).
- More than two roles (e.g. "co-director", "referee" from the original PLAN.md roles list) — this pass ships exactly `owner` and `guest`; the `role` column and `is_organizer_owner`/`is_organizer_member` split are written generally enough that a third role could be added later without another migration shape change.
- A guest ever seeing or managing other guests, or removing themselves.

## Post-ship corrections (2026-09-05)

A final whole-branch review after this feature was merged and live-migrated found two bugs that six individual task reviews (each scoped to one task's diff) had no way to catch, since none of them could exercise real RLS behavior against a live database as a second identity:

1. **No guest could sign in.** `organizers` had no member-level SELECT policy, so `requireOrganizer()`'s embedded lookup came back null for every guest. Fixed by `organizers_select_member`.
2. **`regenerateLeaguePlayoffsBracket` could silently duplicate a tournament's schedule.** It was guest-allowed but deletes+recreates the league schedule; `matches` DELETE is owner-only, so a guest's delete silently no-opped while the recreate still ran. Reclassified as owner-only (moved in the Permission Boundary section above).
3. Added `claim_pending_guest_invite()`, a second invite-claim path (beyond `handle_new_user()`, which only ever fires once) so a removed-then-reinvited guest isn't permanently locked out.
4. Made the invite claim atomic (`for update skip locked`) to close two races: concurrent duplicate signups, and a signup racing an invite's revocation.

See `supabase/migrations/20260905090000_fix_guest_access_signin_and_regenerate.sql` and the accompanying app-code commits.
