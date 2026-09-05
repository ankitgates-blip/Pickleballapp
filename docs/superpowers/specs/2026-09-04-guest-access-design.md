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

Every mutation in the app goes through one of the 27 server actions below (inventoried directly from `app/tournaments/**/actions.ts`). The boundary is a straight split between "create/run" and "delete/modify":

**Guest-allowed (create / run the event):**
`createTournament`, `pairTeam`, `shuffleRemaining`, `startAddPlayers`, `addExistingPeople`, `confirmAddPlayers`, `addCustomMatch`, `generateBracket`, `generateLeaguePlayoffsBracket`, `generatePopcornBracket`, `regenerateLeaguePlayoffsBracket`, `advanceGauntletRound`, `advanceClaimTheThroneRound`, `advanceUpAndDownRiverRound`, `generateSemifinalMatches`, `skipToFinalMatch`, `generateFinalMatch`, `autoGenerateCustomRound`, `enterScore`, `skipMatch`.

**Owner-only (delete / modify existing data):**
`cancelTournament`, `removeTeam`, `removePlayer`, `removeCustomMatch`, `updateTournamentDetails`, `renameTournament`, `updateMatchTeams`, `unlockTournamentResults`, `lockTournamentResults`.

A guest calling an owner-only action gets a thrown error ("Only the workspace owner can do this") — never a silent no-op. The UI hides (not just disables) controls for actions a guest can't perform, following the existing pattern from the result-locking feature (`canEditScore`/`canEditTeams`).

## Enforcement

Two layers:

1. **`requireOrganizer()`** (in `lib/supabase/requireOrganizer.ts`, already the single choke-point nearly every server action calls) changes its lookup from `organizers.auth_user_id` directly to `organizer_members.auth_user_id` (joined to `organizers` for the name), since by the time any app code runs, `handle_new_user()` has already guaranteed a membership row exists. It returns `{ supabase, organizer, role }` instead of `{ supabase, organizer }`; every existing call site keeps compiling and working unchanged since object destructuring of a supertype is source-compatible.
2. **`requireOwner()`**, a new helper wrapping `requireOrganizer()`, throws if `role !== 'owner'`. The 9 owner-only actions call this instead of `requireOrganizer()` directly — a one-line change per action.

**RLS (defense-in-depth, not the primary gate):** `is_tournament_owner(t_id)` is renamed/generalized to `is_organizer_member(t_id)` (true for owner OR guest — backs INSERT and SELECT policies), and a new `is_organizer_owner(t_id)` (true for owner only) backs DELETE policies and the UPDATE policies for owner-only-shaped tables/columns.

**Known accepted gap:** the `matches` table's UPDATE policy is used by both `enterScore` (guest-allowed) and `updateMatchTeams` (owner-only). Postgres row-level security cannot distinguish these by which columns a statement touches without a trigger, which is more machinery than this feature needs. This split is enforced at the `requireOwner()` layer in `updateMatchTeams` itself, not in SQL — the same shape of trust boundary this app already relies on for `canEditScore`/`canEditTeams` state-based gating. RLS still blocks a non-member entirely; it just can't further split a member's UPDATE grant on `matches` by column. This is called out here explicitly rather than left as a silent gap.

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
