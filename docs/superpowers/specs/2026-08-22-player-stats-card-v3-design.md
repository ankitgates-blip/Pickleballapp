# Player Stats Card — v3 Design (Signature Shots + Layout Rework)

Status: Approved.

## Background

Follow-up to the v2 visual redesign
(`docs/superpowers/specs/2026-08-21-player-stats-card-v2-design.md`),
refined through several rounds of live mockup iteration in the
browser-based design companion. This spec captures the final approved
state.

## What changes

**New "Age · Handedness" line** under the name, above the "PICKLERALLY
DXB PLAYER CARD" tagline — e.g. "Age 34 · Right-handed". Shows only the
parts the player actually has set (just age, just handedness, both
joined with " · ", or omitted entirely if neither is set).

**Bottom stat row removed** from the main panel (the 4-column Record /
Streak / Trend / Wins-vs-Higher row under the shield). **Record (W-L)**
moves into the side panel's bullet list as its new first item — the
only one of those four stats that wasn't already duplicated there.

**New "Signature Shots" section** replaces that freed space: a
"SIGNATURE SHOTS" label (bold, letter-spaced) followed by a vertical
list of the player's signature shots — **short skill name only** (e.g.
"💣 Smash", not the fun nickname), one per line, italic. Occupies the
left portion of the row that also contains the shield. If a player has
no signature shots set, the whole section (label included) is omitted.
If a player has more than 5, the list shows the first 5 and a final
"+N more" line rather than overflowing.

**Shield moves right**: instead of being horizontally centered in the
main panel, the shield (with its wings, chevrons, and tier ribbon
below it) shifts to the right side of that row, making room for the
Signature Shots list on the left. The shield itself is unchanged in
size and detail from v2 — earlier attempts to also shrink it to fit
longer combined "skill — nickname" text were tried and explicitly
rejected in favor of keeping the shield's visual weight and showing
short names only.

## What stays the same

- Everything from v2 not mentioned above: bigger type throughout, the
  gold photo ring, the 3 stat boxes (Rating/Form/Threat Level), the
  wing-flourished shield with tier-appropriate chevrons and the
  skull+laurel flourish for DO NOT PLAY only, the ribbon-style tier
  banner, the side panel's "🚨 THREAT LEVEL: N" header and its own
  ribbon banner, and the bordered warning line at the bottom.
- The 13 existing props on `PlayerStatsCardProps` (rating, form,
  threat, wins, losses, streak, trend, wins-vs-higher, total matches,
  wins-in-last-10, name, photo, star count) — unchanged.
- The PNG download pipeline, including the data-URI photo-embedding
  fix — untouched.

## New data

Two new props:

- `ageHandednessLabel: string | null` — pre-formatted by the Player
  Detail page (reusing its existing `person.age` and already-computed
  `handednessLabel`), so the component itself does no formatting logic.
- `signatureShots: { emoji: string; skillName: string }[]` — built by
  the Player Detail page from its already-computed `signatureShotBadges`
  (used elsewhere on the same page for the existing pill display),
  taking just the `emoji`/`skillName` fields — no new query, no new
  data fetching.

## Out of scope

- No fun-nickname text on the card's signature shots (tried, rejected
  for space reasons — the nickname stays visible elsewhere on the
  Player Detail page's existing pill display).
- No change to how signature shots are stored, selected, or edited on
  the profile form.
- No change to the shield's own size/detail from v2.
