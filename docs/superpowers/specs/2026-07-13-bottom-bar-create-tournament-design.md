# Bottom Bar "Create Tournament" Button — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Move the "+ New Tournament" action out of the Tournaments dashboard page
and into the middle of the new bottom nav bar (added in the prior
"Organizer Shell Bottom Nav Redesign" increment), as a raised, prominent
"Create Tournament" button.

## Scope decisions (resolved via brainstorming + visual companion mockups, 2026-07-13)

- **Removed from the dashboard**: the existing "+ New Tournament" button
  at the top of `apps/organizer-web/app/tournaments/page.tsx` is deleted
  entirely — it only lives in the bottom bar now, avoiding two
  differently-styled buttons that do the same thing on the same page.
- **Visual treatment**: a raised circular gold "FAB" (floating action
  button) that pokes above the bottom bar's top edge — the same pattern
  used by apps like Instagram/TikTok for their center "create" action —
  rather than sitting inline at the same height as "Player Profile" and
  "Locations". Chosen after comparing against an inline-pill alternative
  in the mockups.
- **Icon**: a plain "+" (plus) icon inside the gold circle — chosen after
  comparing against a trophy emoji and the pre-rebrand paddle emoji.
  Not the PicklerAlly logo (explicitly rejected — repeating the brand
  medallion here didn't read as a "create" action).
- **Label**: "Create Tournament", in small bold white text directly below
  the raised circle.
- **Position**: the middle bottom-bar item, between "Player Profile" (left)
  and "Locations" (right).
- **Destination**: links to `/tournaments/new` (the existing tournament
  creation form — unchanged).

## Implementation

### 1. Remove the button from the dashboard

`apps/organizer-web/app/tournaments/page.tsx` currently has:

```tsx
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Tournaments</h1>
        <Link href="/tournaments/new" className={accentButtonClass}>
          + New Tournament
        </Link>
      </div>
```

Becomes:

```tsx
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">Tournaments</h1>
```

Confirmed by inspection: `accentButtonClass` (imported at
`apps/organizer-web/app/tournaments/page.tsx:5`) is used only at the
removed line 55 — its import must be removed. `Link` (imported at line 2)
is used elsewhere in this file for tournament cards (lines 103, 132) —
its import stays.

### 2. Add the FAB to the bottom bar

`apps/organizer-web/app/components/OrganizerShell.tsx`'s bottom `<nav>`
currently renders exactly two flex-1 `<Link>`s (Player Profile, Locations)
side by side. A third `<Link>` goes between them, not `flex-1` like its
neighbors (so it doesn't stretch to fill space the same way), containing
a raised circular gold button:

```tsx
<Link
  href="/tournaments/new"
  className="relative flex-1 flex flex-col items-center"
>
  <span className="absolute -top-[18px] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-yellow-500 border-[3px] border-white shadow-lg">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1e293b" strokeWidth={3} strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  </span>
  <span className="mt-9 text-[10px] font-extrabold text-white">Create Tournament</span>
</Link>
```

This sits between the existing "Player Profile" and "Locations" `<Link>`s
in the `<nav>` (order: Player Profile, Create Tournament, Locations),
each still `flex-1` so all three divide the bar width evenly, with the
middle one's circular button visually overflowing upward via `absolute`
positioning and a negative top offset.

No active-state styling is needed for this item (it's an action, not a
page you navigate to and stay on, so there's no "current page" concept
for it) — it's always styled the same regardless of `pathname`.

## Out of scope

- No change to the `/tournaments/new` creation form itself.
- No change to "Player Profile" or "Locations" styling — only a new item
  is inserted between them.
- No change to the header (logo, brand text, tagline) from the prior
  increment.
