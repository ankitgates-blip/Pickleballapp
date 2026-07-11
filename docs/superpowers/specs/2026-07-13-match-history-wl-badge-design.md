# Match History W/L Badge — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Show a clear "W" or "L" badge on every row in the Match History list on
a player's profile, so wins and losses are legible at a glance rather
than only implied by score color.

## Scope decisions (resolved via brainstorming, 2026-07-13)

- **Style**: a small pill badge (reusing the existing `pillClass` helper
  from `apps/organizer-web/app/components/ui.ts:20-21`) placed right
  before the score — green for a win, red for a loss.
- **Placement**: both `apps/organizer-web/app/people/[id]/page.tsx`
  (organizer view) and `apps/organizer-web/app/p/[id]/page.tsx` (public
  view), kept in sync as every other stat on this page has been all
  session.
- **No new data**: `PersonMatchRecord.won: boolean`
  (`apps/organizer-web/lib/stats/types.ts`) already exists and is already
  used to color the score — the badge reads the same field.

## Implementation

In both files, the Match History row currently ends with:

```tsx
<span className={m.won ? 'font-bold text-teal-700' : 'font-bold text-slate-400'}>
  {m.scoreFor}-{m.scoreAgainst}
</span>
```

Add a badge span immediately before it, and wrap both in a flex container
so they sit side by side:

```tsx
<span className="flex items-center gap-2">
  <span className={`${pillClass} ${m.won ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
    {m.won ? 'W' : 'L'}
  </span>
  <span className={m.won ? 'font-bold text-teal-700' : 'font-bold text-slate-400'}>
    {m.scoreFor}-{m.scoreAgainst}
  </span>
</span>
```

`pillClass` is **not** currently imported in either file (both only
import `cardClass` from `@/app/components/ui`, confirmed by inspection).
Both imports need updating from:

```typescript
import { cardClass } from '@/app/components/ui';
```

to:

```typescript
import { cardClass, pillClass } from '@/app/components/ui';
```

(`apps/organizer-web/app/people/[id]/page.tsx:4` and
`apps/organizer-web/app/p/[id]/page.tsx:10`).

## Out of scope

- No change to `PersonMatchRecord`, `computePersonStats`, or any other
  data-layer code — `won` already exists.
- No change to score coloring (teal for win, slate for loss )— the badge
  is additive, not a replacement.
- No change to any other list on these pages (This Month, By Location,
  Win Rate Trend, Head-to-Head) — only the Match History row.
