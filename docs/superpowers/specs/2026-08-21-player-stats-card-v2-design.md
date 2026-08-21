# Player Stats Card — Visual Redesign v2

Status: Approved.

## Background

The shipped Player Stats Card (`docs/superpowers/specs/2026-08-21-player-stats-card-design.md`)
fell well short of the reference image visually — a flat colored dot
stood in for the reference's illustrated shield/medallion, and the
bottom stat row was cramped into one thin line. This redesigns the
card's visual presentation only. No data, formulas, or props change —
this is a rebuild of `PlayerStatsCard.tsx`'s markup and styling,
approved via a live mockup in the browser-based design companion,
iterated against a clearer reference image (a legend of all 5 tier
shields plus a fully-worked player card example) and against the
player's real data.

## What changes

**Typography and stat boxes**: bigger, bolder numbers throughout (26px
vs. the shipped 19px), plain dark boxes (no translucent fill), name in
plain white/light instead of cyan (matching the clearer reference, which
uses white — the cyan choice in the shipped version doesn't appear in
either reference image).

**The shield/badge** (the biggest gap) is rebuilt with actual geometry
instead of a single emoji:
- Two mirrored "wing" flourishes (angular feather-stripe shapes) behind
  the shield, tier-colored.
- The shield outline itself (unchanged path shape from the shipped
  version).
- A small circular "pickleball" icon (a plain circle with 5 dot holes)
  at the top of the shield.
- A tier-appropriate number of chevron stripes inside the shield: 1 for
  LOW THREAT, 2 for WATCH OUT, 3 for DANGEROUS, 3 for HIGH THREAT — DO
  NOT PLAY gets 2 chevrons plus a skull glyph and laurel-branch flourish
  below them (only DO NOT PLAY shows the skull/laurel, matching the
  reference legend).
- A ribbon-style banner below the shield showing the tier label, instead
  of plain text.

**Bottom stat row** (main panel): 4 boxed stat columns — Record (W-L),
Win Streak, Trend, Wins vs Higher-Rated — each with a bigger icon,
number, and label, matching the reference's 4-column layout exactly.

**Total Matches Played**: the reference image's card doesn't show this
stat at all (it wasn't part of the organizer's original reference), but
it's an explicit, already-agreed requirement from earlier in this
feature's design conversation. It stays on the card, moved to the side
panel's bulleted list as a 5th line ("🎾 N matches played") rather than
forced into the main panel's now-reference-matching 4-column row.

**Side panel**: bigger "🚨 THREAT LEVEL: N" header (N = the same overall
win % already shown as Threat Level on the main panel), a ribbon-style
tier banner, divider lines between the bulleted stats, and a bordered
(not plain-text) warning line at the bottom.

## What stays the same

- All stat formulas, all props, all data wiring (`people/[id]/page.tsx`
  is untouched by this redesign — only `PlayerStatsCard.tsx` changes).
- The photo ring, initial-letter fallback, and PNG download mechanism
  (including the data-URI photo-embedding fix) — unchanged.
- The 13-prop `PlayerStatsCardProps` interface — unchanged.
- Still an honest coded approximation, not a literal replication of the
  reference's photorealistic metal texture and lighting — flat shapes
  and gradients, not illustrated artwork. The organizer explicitly
  accepted this trade-off (no separate image assets available).

## Out of scope

- No new stats, no new props, no page-level changes.
- No pursuit of pixel-perfect photorealistic fidelity to the reference —
  that would require actual illustrated graphic assets, which aren't
  available for this feature.
