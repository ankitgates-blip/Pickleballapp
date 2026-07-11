# Completed-Status Dashboard Split — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Once all of a round-robin tournament's matches have scores entered (and
standings are determined), the tournament should move into "completed"
state on the organizer dashboard — regardless of its scheduled date.

## Problem

`tournaments/[id]/matches/actions.ts`'s `enterScore` action already sets
`tournaments.completed_at` server-side whenever `isTournamentComplete`
returns true — this already works correctly for round-robin (all real
matches must be `status: 'complete'`) and league_playoffs (final match
complete) formats. No change needed there.

The bug is purely in the dashboard's display logic
(`apps/organizer-web/app/tournaments/page.tsx`): it currently splits
tournaments into "Upcoming Matches" and "Recently Completed" based only on
the tournament's **date** (today-or-later vs. earlier), never checking
`completed_at`. As a result:

- A tournament dated today or in the future that gets fully scored early
  still shows under "Upcoming Matches" (with full edit rights via the
  roster page's link), even though it's actually done.
- A tournament dated in the past that's still missing scores shows under
  "Recently Completed", misleadingly implying it's finished.

## Scope decisions (resolved via brainstorming, 2026-07-13)

- **Split logic**: fully status-based. "Upcoming Matches" = `completed_at
  IS NULL` (regardless of date). "Recently Completed" = `completed_at IS
  NOT NULL` (regardless of date).
- **Overdue badge**: for a tournament whose date has already passed but
  isn't completed yet (now visible under "Upcoming Matches" since it's
  incomplete), replace the days-away countdown badge with a red
  "OVERDUE" badge instead of showing a negative day count.

## Implementation

`apps/organizer-web/app/tournaments/page.tsx` already selects
`completed_at` in its query (line 13) — no query or migration change
needed.

Change the `upcoming` / `recentlyCompleted` filters from:

```typescript
const upcoming = (tournaments ?? [])
  .filter((t) => new Date(`${t.date}T00:00:00`) >= today)
  .sort((a, b) => (a.date < b.date ? -1 : 1));

const recentlyCompleted = (tournaments ?? [])
  .filter((t) => new Date(`${t.date}T00:00:00`) < today)
  .sort((a, b) => (a.date < b.date ? 1 : -1));
```

to:

```typescript
const upcoming = (tournaments ?? [])
  .filter((t) => !t.completed_at)
  .sort((a, b) => (a.date < b.date ? -1 : 1));

const recentlyCompleted = (tournaments ?? [])
  .filter((t) => Boolean(t.completed_at))
  .sort((a, b) => (a.date < b.date ? 1 : -1));
```

Sort order is unchanged (Upcoming ascending by date, Recently Completed
descending by date) — only the filter predicate changes.

For the badge on each Upcoming card, replace the unconditional days-away
label with an overdue check:

```typescript
const daysAway = Math.round(
  (new Date(`${t.date}T00:00:00`).getTime() - today.getTime()) / 86400000
);
const isOverdue = daysAway < 0;
```

```jsx
<span className={`absolute top-0 right-0 ${isOverdue ? 'bg-red-600' : 'bg-orange-500'} text-white text-[10px] font-extrabold px-3 py-1 rounded-bl-xl rounded-tr-2xl tracking-wide`}>
  {isOverdue ? 'OVERDUE' : daysAway === 0 ? 'TODAY' : `${daysAway} DAY${daysAway === 1 ? '' : 'S'}`}
</span>
```

## Out of scope

- No change to `isTournamentComplete`, `enterScore`, or any other
  completion-detection logic — it already works correctly.
- No change to the roster page's edit-gating (`isCompleted` from
  `completed_at`) — already correct.
- No change to the results page — it already renders correctly for any
  format and shows the champion banner only when `completed_at` is set.
- The previously-flagged, separate issue of the Teams page not enforcing
  read-only after completion server-side (spawned as a background task
  suggestion in an earlier session) is not addressed here — out of scope
  for this display-only fix.
