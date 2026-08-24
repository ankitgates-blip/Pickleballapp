# WhatsApp League Sign-Up — Design

Status: Approved.

## Goal

Let an organizer share a league's public link to a WhatsApp group and have
players sign themselves up directly (no login, no organizer intervention
per signup), capped at a configurable max player count. The organizer gets
a lightweight "new signups since I last checked" indicator, and two
one-tap "share to WhatsApp" buttons — one to invite people, one to post a
current signup-count update. No automated bot, no WhatsApp Business API —
every existing "Share" feature in this app is organizer-triggered via the
native OS share sheet, and this follows the same pattern.

## Data

No new tables or columns. Reuses:
- `tournaments.max_players` (already exists, nullable, settable at league
  creation via the existing "Max players (optional)" field on
  `tournaments/new/page.tsx`) as the sign-up cap.
- `lib/tournament/capacity.ts`'s existing `isRosterFull(maxPlayers,
  currentCount)` / `slotsRemaining(maxPlayers, currentCount)` helpers,
  unchanged.
- `people` / `players` tables, same shape used by every other roster-add
  path in the app.
- `lib/people/matchNames.ts`'s existing `matchNamesToPeople(names,
  existingPeople)` for name-to-person matching, called with a one-item
  array.

## Public sign-up (`app/t/[id]/page.tsx`)

This is already the app's public tournament page (already linked from the
organizer's "Copy public link" button and every existing Share button) —
no new route. Add, above the existing Players list:

- **While `!tournament.completed_at` and not full**: a card with a name
  `<input>` and a submit button ("I'm in!"), plus a line showing
  `{count}/{max} signed up — {remaining} spot{s} left` when `max_players`
  is set, or just `{count} signed up so far` when it's null (no cap).
- **Once full** (`isRosterFull(max_players, count)` is true): the card is
  replaced with a plain "This league is full ({count}/{max})." message —
  no form. Same visual treatment as the existing "All Slots Full" message
  already used on the organizer's Roster page for consistency.
- **Once `tournament.completed_at` is set**: no sign-up card at all (the
  league already happened) — existing Players/Standings/Schedule sections
  are unaffected either way.

### New server action: `joinLeague`

New file: `app/t/[id]/actions.ts` (this route currently has no
`actions.ts` — it's the first public page in the app to need one). Unlike
every other mutating action in this codebase, this one does **not** call
`requireOrganizer()` — it's the app's first public, unauthenticated
mutation.

```ts
'use server';

export async function joinLeague(tournamentId: string, formData: FormData) {
  const supabase = await createClient(); // same public client app/t/[id]/page.tsx already uses

  const name = (formData.get('name') as string | null)?.trim();
  if (!name) {
    throw new Error('Please enter your name.');
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, organizer_id, max_players, completed_at')
    .eq('id', tournamentId)
    .single();

  if (tournamentError || !tournament) {
    throw new Error('League not found.');
  }
  if (tournament.completed_at) {
    throw new Error('This league has already finished.');
  }

  const { count, error: countError } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);
  if (countError) throw new Error(countError.message);

  if (isRosterFull(tournament.max_players, count ?? 0)) {
    throw new Error('This league is full.');
  }

  const { data: existingPeople, error: peopleError } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', tournament.organizer_id);
  if (peopleError) throw new Error(peopleError.message);

  const { matched, newNames } = matchNamesToPeople([name], existingPeople ?? []);

  let personId: string;
  if (matched.length > 0) {
    personId = matched[0].personId;
  } else {
    const { data: newPerson, error: insertPersonError } = await supabase
      .from('people')
      .insert({ organizer_id: tournament.organizer_id, name: newNames[0] })
      .select('id')
      .single();
    if (insertPersonError || !newPerson) {
      throw new Error(insertPersonError?.message ?? 'Could not sign you up.');
    }
    personId = newPerson.id;
  }

  const { error: insertPlayerError } = await supabase
    .from('players')
    .insert({ tournament_id: tournamentId, name, person_id: personId });
  if (insertPlayerError) throw new Error(insertPlayerError.message);

  revalidatePath(`/t/${tournamentId}`);
}
```

**Race condition note**: two people submitting at the exact moment the
league has 1 spot left could both pass the `isRosterFull` check before
either insert lands, resulting in one over-capacity signup. Given this is
a casual social-league app (not a payment system), this is accepted as a
rare, low-stakes edge case — the organizer's existing Roster "Remove"
button already handles the fix if it ever happens. Not solved with a DB
constraint in this pass (see Out of scope).

**RLS note**: `people`/`players` inserts currently go through
organizer-scoped policies (`auth.uid()`-based, since every existing insert
path is organizer-authenticated) — an anonymous request has no `auth.uid()`
and will be rejected by every existing policy. This needs two new
`anon`-role `INSERT` policies, real Supabase migrations (detailed further
in the implementation plan, which should verify the exact existing policy
names/shapes against the live schema before writing new ones):
- `people`: allow insert when `organizer_id` equals the `organizer_id` of
  some row in `tournaments` (any organizer — the public action can't know
  which organizer it's signing up for except via the tournament it was
  given, so the policy widens to "a valid organizer" rather than "the
  right one"; the app code is what actually scopes the insert correctly
  by reading `tournament.organizer_id` first, same as the design's
  `joinLeague` code above).
- `players`: allow insert when `tournament_id` references a row in
  `tournaments` where `completed_at IS NULL`.
Both are intentionally permissive at the RLS layer (anyone could insert a
`people`/`players` row for any non-completed tournament, not just the one
they were linked to) rather than tightly scoped, because Postgres RLS
policies can't easily see "the row currently being inserted's sibling
values" beyond the row itself — the same trade-off is spelled out to the
implementation plan as a known, accepted looseness (a public form was
always going to allow anonymous writes; this isn't a new class of risk
beyond what "no login required" already implies), not a bug to solve.

## Organizer-side sharing (Roster page)

Two new small button components, both following the existing
`navigator.share`-with-text-fallback-to-clipboard pattern already used
elsewhere (e.g. `CopyLinkButton`), placed next to the existing "Copy
public link" button on `app/tournaments/[id]/roster/page.tsx`:

- **`ShareLeagueInviteButton`**: shares `{title: tournamentName, text:
  "🏓 {tournamentName} — {date} at {venueName}, {timeslotLabel}. Join
  here:", url: "{origin}/t/{id}"}`.
- **`ShareSignupUpdateButton`**: shares text built from the current roster
  — `"🏓 {tournamentName}: {count}/{max} signed up — {names joined by
  ', '}. {remaining} spot{s} left! Join: {url}"` (or the no-cap phrasing
  when `max_players` is null, mirroring the public page's own phrasing).
  Only rendered when at least 1 player is on the roster.

Both are simple text shares (`navigator.share({title, text, url})`, no PDF
generation needed) — smaller than the existing `ShareRosterButton`, which
this doesn't replace or change.

## "New signups" indicator (Tournaments list)

`app/tournaments/page.tsx` already computes `playerCountByTournament` and
renders `👥 {playerCount} player{s}` per upcoming tournament (two render
sites, lines ~180 and ~228 today). Extract that into a new small client
component, `PlayerCountBadge({ tournamentId, playerCount }: { tournamentId:
string; playerCount: number })`:

- Reads `localStorage.getItem('roster-seen-count-' + tournamentId)`
  (missing key treated as `0`).
- If `playerCount > seenCount`, renders the existing `👥 N players` text
  plus a small `+{playerCount - seenCount} new` pill next to it.
- When the organizer's Roster page (`app/tournaments/[id]/roster/page.tsx`)
  loads, a tiny client-side effect writes
  `localStorage.setItem('roster-seen-count-' + tournamentId, String(playerCount))`
  — clearing the badge next time the Tournaments list renders.

No backend change. Per-browser only (doesn't sync across the organizer's
devices) — acceptable per the earlier discussion favoring the simplest
option over push notifications.

## Error handling

- `joinLeague` throws user-readable errors (empty name, league full,
  league completed, league not found) — same `<form action={...}>` +
  `SaveButton` pattern used everywhere else in the app surfaces these via
  Next.js's error boundary; no new error-display component needed since
  `app/t/[id]/page.tsx` doesn't currently have one and the existing
  pattern (thrown Error from a server action rendered by the nearest
  `error.tsx`) already covers it app-wide.
- Duplicate name signup (someone already on the list submits again) is
  allowed to go through as a second, separate `players` row under the
  same `person_id` — mirrors how the organizer's own "Add Existing
  Players" flow already permits re-adding, and avoids needing new
  duplicate-detection logic for a rare, self-correcting case (organizer
  can remove the duplicate via the existing Roster page).

## Testing

- `lib/tournament/capacity.ts` already has tests; no changes needed there.
- New: a focused test file is not practical for `joinLeague` itself (it's
  a server action requiring Supabase, matching this codebase's existing
  convention of verifying server actions via build + manual/preview
  testing rather than unit tests — see `addCustomMatch`,
  `autoGenerateCustomRound`, etc., none of which have dedicated test
  files).
- `PlayerCountBadge`'s localStorage comparison logic is a good candidate
  for a small pure-function unit test if the comparison is extracted into
  a testable helper (e.g. `newSignupsSince(seenCount, currentCount):
  number`) rather than left inline in the component — the implementation
  plan should do this extraction.

## Out of scope

- No self-cancel for players (organizer-only removal, via the existing
  Roster page).
- No real push notifications / service worker.
- No automated WhatsApp Business API bot — every share is organizer
  manually-triggered.
- No database-level race-condition guard on the capacity check (accepted
  low-stakes edge case, see note above).
- No waitlist once full.
- No cross-device sync for the "new signups seen" indicator.
