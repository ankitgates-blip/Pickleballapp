# Player Stats PDF: Include Profile Details — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Include a player's profile details (handedness, age, playing style,
strengths — added by the "Player Profile Editing" feature) in the
Player Stats PDF, matching what's already shown on the Player Detail
page.

## Current state

`apps/organizer-web/app/people/[id]/page.tsx` already computes
`profileSummary: string | null` — a single `·`-joined line built from
whichever of the four profile attributes are set (e.g. "Right-handed ·
Age 34 · All-Court · Power, Serve"), `null` if none are set. It's
rendered on-page right after the win-rate summary paragraph, but is
never passed to `SharePlayerStatsButton`, so the PDF doesn't include
it.

## Design

`SharePlayerStatsButton`'s props gain `profileSummary: string | null`.
Inside the PDF-building code, right after the existing "Last played /
star rating" line (same `doc.text([...].join(' · '), ...)` block that
already exists), add:

```typescript
if (profileSummary) {
  doc.text(profileSummary, 14, y);
  y += 8;
}
```

The page passes its already-computed `profileSummary` value straight
through — no new computation, no new query, no change to the pure
`personStatsExport.ts` functions.

## Out of scope

- Any change to the on-page display.
- Profile photo (not yet built).
