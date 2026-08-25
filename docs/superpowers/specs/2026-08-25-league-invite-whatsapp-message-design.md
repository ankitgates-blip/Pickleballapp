# League Invite WhatsApp Message — Design

**Date:** 2026-08-25
**Status:** Approved for planning

## Problem

Organizers share the League Playoffs sign-up link via the existing "Share League Invite" button (`ShareLeagueInviteButton.tsx` on the Roster page), which today composes one short, generic line:

```
🏓 {tournamentName} — {date} at {venueName}, {timeslotLabel}. Join here: {url}
```

For League Playoffs specifically — which just gained a structured RSVP list (see `2026-08-25-league-playoffs-rsvp-design.md`) — the organizer wants a longer, promotional message that explains the RSVP flow (In/Out/Tentative, auto-assigned partners, waiting list, 5:00 PM cutoff) and reads like an event invite, with the day-of-week, date, venue, and RSVP deadline all pulled from the tournament's actual schedule instead of being hand-typed each week.

## Scope decisions (resolved during brainstorming)

- **RSVP deadline text:** "5:00 PM" — matches the League Playoffs RSVP feature's actual enforced cutoff (Asia/Dubai, `tournament.date` at 17:00). The message must never state a deadline the app doesn't enforce, so the earlier "1:00 PM" draft is corrected to 5:00 PM here.
- **Format scope:** League Playoffs only. `ShareLeagueInviteButton` renders on every tournament format's Roster page; only when `format === 'league_playoffs'` does it switch to the new template. Every other format keeps today's short generic message unchanged — the "partners auto-assigned" framing is only true for League Playoffs' RSVP flow.
- **Tone:** the long/detailed template (the user's "Option 1"), not the short/punchy alternative.
- **Title/venue naming:** dynamic, not a fixed brand string — `"{Venue} {Weekday} Pickleball Rumble!"`, substituting the tournament's actual venue name and the actual weekday computed from `tournament.date`. (Not hardcoded to "Pickleturf Thursday" regardless of the real venue/day.)
- **Contact info:** venue-specific, sourced from a new nullable `contact_info` column on `venues` (schema currently has no such field). Seeded `null` for both existing venues (Pickleturf, Picklers) — no admin UI to edit it is being built in this pass, since the organizer doesn't have final contact text yet. The message omits the contact-info line entirely when null, and picks it back up automatically once the column is populated (by future migration or future admin UI — out of scope here).

## Message template

Static skeleton with dynamic pieces in `{brackets}`, all sourced from data `ShareLeagueInviteButton` already receives or can receive as new props:

```
🎉 Welcome to the {Venue} {Weekday} Pickleball Rumble! 🏓

📅 {Weekday}, {Date}
🕐 {Timeslot}
📍 {Venue}

We're getting the crew together for a fun round of league play! Just RSVP below and we'll take care of the rest — partners will be automatically assigned by the app, so no need to find your own team.

✅ I'm In  ❌ I'm Out  🤔 Tentative

⏰ RSVP by 5:00 PM on {Weekday} to lock in your spot. Spots are limited — once we're full, extra RSVPs go on the waiting list and get bumped in automatically if someone drops out.

{Contact info line, only when venue.contact_info is set}

👉 {link}

See you on the court! 🏓
```

Notes:
- The ✅/❌/🤔 line is descriptive text, not an interactive control — this button shares a plain-text message (via `shareOrCopyText`, same Web Share API / clipboard mechanism as today), not a form. The actual RSVP buttons live on the page at `{link}` (`/t/{tournamentId}`, already built by the RSVP feature).
- `{Date}` is formatted the same human-readable way the rest of the app already displays `tournament.date` (existing `date` prop, no new formatting utility needed beyond weekday derivation).
- `{Weekday}` is derived from `tournament.date` (e.g. `new Date(tournament.date).toLocaleDateString('en-US', { weekday: 'long' })`), computed once and reused for both the title and the RSVP-deadline line so they can never drift apart from each other or from the actual tournament date.
- `{link}` is `${window.location.origin}/t/${tournamentId}`, exactly as today.

## Architecture

### Data model

One-column migration, additive and backward-compatible:

```sql
alter table public.venues add column contact_info text;
```

No RLS change needed — `venues` has no RLS restricting read access beyond what already exists (confirmed: `venues` rows are already readable wherever venue names are shown today, including the public `/t/[id]` page). No seed values are inserted for the two existing rows — a new nullable column defaults every existing row to `null` automatically, which is exactly the "omit the line" state this design wants.

### Message-building logic

New pure helper, matching this codebase's established convention of keeping tournament-formatting logic in `lib/tournament/*.ts` so it's independently testable:

`apps/organizer-web/lib/tournament/inviteMessage.ts`

```ts
export function buildLeagueInviteMessage(params: {
  venueName: string;
  date: string; // tournament.date, 'YYYY-MM-DD'
  dateLabel: string; // already-formatted human date, as currently passed to ShareLeagueInviteButton
  timeslotLabel: string;
  contactInfo: string | null;
  link: string;
}): string
```

It computes the weekday from `params.date` internally (single source of truth for both the title and the deadline line), assembles the fixed template above, and conditionally includes the contact-info line. `ShareLeagueInviteButton` calls this function instead of building its own template string when `format === 'league_playoffs'`; for every other format it keeps building today's short line inline, unchanged.

### Component changes

`ShareLeagueInviteButton.tsx` gains two new props:

```ts
type ShareLeagueInviteButtonProps = {
  tournamentId: string;
  tournamentName: string;
  date: string;
  venueName: string;
  timeslotLabel: string;
  format: string;           // new
  venueContactInfo: string | null; // new
};
```

Inside `handleClick`, branch on `format === 'league_playoffs'`: call `buildLeagueInviteMessage(...)` for the long template, otherwise keep today's existing one-liner. `shareOrCopyText` itself is unchanged — it already just takes a `text` string.

### Page wiring

`app/tournaments/[id]/roster/page.tsx`:
- Extend the existing `tournaments` select's embedded `venues(name)` to `venues(name, contact_info)`.
- Extend the existing `venue` destructuring (the `Array.isArray(venue) ? venue[0] : venue` pattern already present at line 48-49) to also pull `contact_info`.
- Pass `format={tournament?.format ?? ''}` and `venueContactInfo={venueContactInfo}` into the existing `<ShareLeagueInviteButton>` call alongside its current props.

No other page touches `ShareLeagueInviteButton` (confirmed: it's only imported in this one file).

## Testing

- `buildLeagueInviteMessage` is a new pure function in `lib/tournament/*.ts` — gets real Vitest coverage, per this codebase's established convention: weekday derivation for a few known dates, contact-info line present vs. omitted, exact template assembly for one full example.
- `ShareLeagueInviteButton.tsx` and `roster/page.tsx` remain untested directly (client component / page, zero coverage by established convention) — verified via `npm run build` + `npm test` (regression) + manual check in the running app: open a League Playoffs roster page, click "Share League Invite," confirm the composed text matches the template with real values substituted and the correct weekday; open a non-League-Playoffs roster page, confirm the button still sends today's short message unchanged.
- Migration is schema-only (one additive column, no data change) — no test file, matching every other migration in this codebase.

## Out of scope

- An admin UI for editing `venues.contact_info` — added later once the organizer has final contact text to enter; until then it's `null` for both venues and the message simply omits that line.
- The short/punchy "Option 2" tone — not built in this pass.
- Any change to `shareOrCopyText`, `lib/share/shareText.ts`, or the RSVP feature's own enforcement logic (Postgres function, UI lock) — this feature only changes what text gets composed for sharing, not any enforcement behavior.
- Extending the long template to any other tournament format.
