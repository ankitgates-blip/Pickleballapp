# Google Sign-In — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Replace the app's email/password sign-in/sign-up with "Sign in with
Google," and safely migrate the one existing organizer account so its
tournament data stays attached after the switch.

## Scope decisions (resolved via brainstorming, 2026-07-13)

- **Replaces, not adds**: email/password sign-in and sign-up are removed
  entirely from the login page — Google becomes the only way in.
- **Apple Sign-In is a separate, later increment** — not built here (it
  requires a paid Apple Developer account and a more involved setup;
  scoped out to keep this increment focused).
- **External setup required from the user**: a Google Cloud Console
  project, OAuth consent screen, and OAuth 2.0 Client ID (Web
  application) with the authorized redirect URI set to the Supabase
  project's own callback URL
  (`https://cqhbouwhbnvyrmsqfzdt.supabase.co/auth/v1/callback`). The user
  provides the resulting Client ID and Client Secret.
- **Supabase provider config applied via the Management API** — using
  the same `SUPABASE_ACCESS_TOKEN`-based direct-API pattern already used
  this session for migrations, rather than requiring a manual dashboard
  step.
- **Existing account migration is required and must run exactly once,
  after the first real Google sign-in** — see "Data Migration" below.
  This is a real, one-time database fix on production data, not a
  reusable script; it will be executed carefully and explained
  step-by-step before running.

## Implementation

### 1. New OAuth callback route

New file `apps/organizer-web/app/auth/callback/route.ts` — a Next.js
Route Handler. Supabase redirects here (with a `?code=...` query
parameter) after the user completes the Google consent screen. The
handler exchanges the code for a session using the existing server
Supabase client (`@/lib/supabase/server`'s `createClient()`), then
redirects to `/tournaments` (or to `/login?error=...` if the exchange
fails).

### 2. Login page — `apps/organizer-web/app/login/page.tsx`

The existing "Sign in" and "First time here? Sign up" cards (with their
email/password/name inputs) are removed entirely. In their place, a
single "Sign in with Google" button, styled consistently with the
existing card-based layout (reusing `cardClass` and a button style
already defined in `@/app/components/ui`).

Since starting the OAuth flow requires a browser-side redirect
(`window.location.origin` and an actual page navigation), the button is
a small new client component (matching the existing `CopyLinkButton`/
`CancelTournamentButton` pattern already used in this codebase) that
calls the browser Supabase client's
`auth.signInWithOAuth({ provider: 'google', options: { redirectTo:
`${window.location.origin}/auth/callback` } })`.

### 3. `apps/organizer-web/app/login/actions.ts`

The `signUp` and `signIn` server actions are deleted (no longer
reachable from the UI). `signOut` is unchanged.

### 4. Supabase Auth provider configuration

Once the user provides the Google OAuth Client ID and Secret, the
Google provider is enabled on the Supabase project via a direct
Management API call (`PATCH
https://api.supabase.com/v1/projects/cqhbouwhbnvyrmsqfzdt/config/auth`
with `external_google_enabled: true`,
`external_google_client_id`, `external_google_secret`) — executed
directly, not part of the code changes shipped to the repo (no secrets
committed to git).

## Data Migration (existing account)

**Why this is needed:** `apps/organizer-web/lib/supabase/requireOrganizer.ts`
looks up the `organizers` row by `auth_user_id = <logged-in user's ID>`.
Today, exactly one organizer exists ("ankit gandhi",
`ankitthegates@gmail.com`), tied to an `auth.users` row created via
email/password sign-up. The database's `handle_new_user()` trigger
auto-creates a **new** `organizers` row for every **new** `auth.users`
row. The very first time you sign in with Google, Supabase creates a
brand-new `auth.users` row (a different ID, even though the email
matches) — which means a second, empty `organizers` row gets created,
and your real one (with all your tournaments) would become unreachable
under the new Google-authenticated session.

**The fix, run once after your first real Google sign-in:**
1. Confirm the new `auth.users.id` created by the Google sign-in and the
   new (empty, duplicate) `organizers` row the trigger created for it.
2. Update the **original** `organizers` row (the one with all your
   tournament data) so its `auth_user_id` points to the new
   Google-authenticated `auth.users.id`, instead of the old
   email/password one.
3. Delete the duplicate `organizers` row the trigger created in step 1
   (it has zero tournaments — nothing is lost).
4. Leave the old, now-unused email/password `auth.users` row in place,
   untouched — deleting it isn't necessary and avoids any cascade-delete
   risk to the tournament data now correctly re-attached in step 2.

This is a direct, one-time SQL fix run via the Supabase Management API
(same mechanism already used this session for schema migrations),
explained and confirmed with you before it runs.

## Out of scope

- Apple Sign-In (separate future increment).
- Any change to `handle_new_user()`'s trigger logic — it already reads
  `raw_user_meta_data->>'name'`, which Google's OAuth profile data also
  populates correctly.
- Any change to RLS policies — `is_tournament_owner()` and friends
  already key off `organizers.auth_user_id`, which continues to work
  unchanged once the migration in this spec is applied.
- Multi-provider account linking UI (e.g., letting one person sign in
  with either Google or a password) — Google becomes the sole method.
