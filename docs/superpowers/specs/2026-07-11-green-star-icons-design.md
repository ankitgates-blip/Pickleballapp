# Green Star Icons — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Make the star rating icons on player profile pages render in green,
distinct from the surrounding win-rate percentage text.

## Scope decision (resolved via brainstorming, 2026-07-11)

A true, literal green (`text-green-600`) — not the app's existing teal
accent color used elsewhere for "positive" indicators.

## Implementation

Everywhere `renderStars(...)` is currently rendered inline as part of a
larger text string — the overall win-rate line (both `/people/[id]` and
`/p/[id]` headers) and the per-location rows in the "By Location" card
(both pages) — wrap just the star output in its own `<span
className="text-green-600">`, separate from the percentage number and
any surrounding text, so only the stars change color.

## Out of scope

- The Location Leaderboard page (`/locations`) doesn't render stars at
  all — untouched.
- No change to `renderStars`'s return value (still a plain string of
  `★`/`☆` characters) — this is purely a wrapping/styling change at the
  call sites, not a change to the pure function itself.
