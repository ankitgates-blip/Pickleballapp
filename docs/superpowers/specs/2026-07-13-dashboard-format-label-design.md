# Dashboard Format Label — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Show the tournament format (e.g., "Round Robin", "League + Playoffs") in
the meta row of each card under both "Upcoming Matches" and "Recently
Completed" on the dashboard, so organizers and players can see at a
glance which format is being played.

## Scope decisions (resolved via brainstorming, 2026-07-13)

- **Icon**: 🎯, prefixed the same way every other meta item already is
  (📍 venue, 🕐 timeslot, 👥 players, 📅 date).
- **Placement**: appended at the end of the existing meta row, after the
  date, on both card types.
- **Reuses existing logic**: `formatLabel(format: string): string` already
  exists in `apps/organizer-web/lib/tournament/formats.ts:14-16` and is
  already used on the results page
  (`apps/organizer-web/app/tournaments/[id]/results/page.tsx:131`) — no
  new function needed.

## Implementation

`apps/organizer-web/app/tournaments/page.tsx`'s query currently selects:

```typescript
.select('id, name, date, timeslot, completed_at, venues(name)')
```

Add `format`:

```typescript
.select('id, name, date, timeslot, completed_at, format, venues(name)')
```

Import `formatLabel`:

```typescript
import { formatLabel } from '@/lib/tournament/formats';
```

In both the Upcoming Matches meta row and the Recently Completed meta
row, add one more `<span>` after the existing `📅 {t.date}` span:

```tsx
<span>📅 {t.date}</span>
<span>🎯 {formatLabel(t.format)}</span>
```

## Out of scope

- No change to `formatLabel` itself, or to any other page that already
  displays format (results page is unaffected).
- No new migration — `tournaments.format` already exists (added in
  `supabase/migrations/20260710150611_add_tournament_format.sql`).
