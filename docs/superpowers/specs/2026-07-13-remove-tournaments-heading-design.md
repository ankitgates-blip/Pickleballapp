# Remove "Tournaments" Heading — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Remove the "Tournaments" `<h1>` heading from the top of the organizer
dashboard page, since it's redundant now that the header above it is
much more prominent (photo background, logo, brand name).

## Scope decision (resolved via brainstorming, 2026-07-13)

Delete the heading entirely — no replacement text, no spacing
adjustments needed elsewhere, since removing the whole line (including
its `mb-6` margin) leaves the page starting cleanly with the "Upcoming
Matches" section (or the empty-state message, if there are no
tournaments yet).

## Implementation

In `apps/organizer-web/app/tournaments/page.tsx`, delete:

```tsx
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">Tournaments</h1>
```

## Out of scope

- No change to the "+ New Tournament"/FAB, "Upcoming Matches", "Recently
  Completed", or any other section of this page.
- No change to any other page's heading.
