# Create Tournament FAB Color Change — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Change the "Create Tournament" bottom-bar FAB's background color from gold
to bright cyan, so it reads more consistently with the app's teal/cyan
palette while still standing out against the darker bar behind it.

## Scope decision (resolved via brainstorming, 2026-07-13)

- **New color**: Tailwind's `cyan-400` (a vivid, lighter cyan), chosen
  specifically because the bottom bar itself is a darker
  emerald-to-cyan gradient (`#065f46` → `#0d9488` → `#0891b2`) — a
  brighter, lighter cyan stays visibly distinct against that darker
  background, especially combined with the button's existing white
  border.
- **Icon color unchanged**: the plus icon's dark slate stroke
  (`#1e293b`) stays as-is — it already contrasts well against a bright
  background color and doesn't need to change just because the fill
  color does.
- **No other changes**: size (52×52px), position (-18px above the bar),
  border, shadow, label text, and link destination are all unchanged
  from the prior increment.

## Implementation

In `apps/organizer-web/app/components/OrganizerShell.tsx`, the FAB's
circular background currently uses `bg-yellow-500`. Change it to
`bg-cyan-400`:

```tsx
<span className="absolute -top-[18px] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-cyan-400 border-[3px] border-white shadow-lg">
```

(Only the `bg-yellow-500` → `bg-cyan-400` class changes; every other
class and the SVG icon inside are untouched.)

## Out of scope

- No change to "Player Profile"/"Locations" styling.
- No change to the header, logo, or any other part of the shell.
