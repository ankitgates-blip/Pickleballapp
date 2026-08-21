# Player Stats Card — Design

Status: Approved.

## Goal

Replicate the reference "Threat Level" trading-card graphic as a real,
live section on the Player Detail page — titled **"Player Stats Card"**
— built from the player's actual data, with a click-to-download PNG.

## Placement

New section on `apps/organizer-web/app/people/[id]/page.tsx`, below the
existing profile info, headed "Player Stats Card." Renders unconditionally
for every player (see "No data" below for the zero-matches case) — no
click needed to see it; the click only triggers the PNG download.

## Layout

Two panels side by side, matching the reference image:

**Main panel** (dark metallic, circuit-board texture):
- Gold ring around the player's photo, name, and a tagline (defaults to
  "PICKLERALLY DXB PLAYER CARD" — no per-player bio field exists to pull
  a real tagline from).
- Three stat boxes: **Rating** (with a star row), **Form** (with a tier
  word), **Threat Level** (with a colored meter bar).
- A tier-colored shield with the tier's emoji inside, and the tier label
  (e.g. "DO NOT PLAY") below it.
- A bottom row of 5 small stats: **Record** (W-L), **Win Streak**,
  **Trend**, **Wins vs Higher-Rated**, **Matches** (total completed
  matches played).

**Side panel** ("Critical Status", purple/dark):
- Skull/shield medallion, "Status: <risk level>" line, big tier-colored
  headline text.
- A bulleted list mirroring 5 of the main panel's numbers: win streak,
  wins in the last 10 games, trend, wins vs higher-rated, and total
  matches played.
- A tier-appropriate warning line at the bottom (reusing the 5 status
  phrases from the original Threat Level tier table: "Just warming up" /
  "Getting dangerous" / "Don't underestimate" / "Serious competition" /
  "You have been warned").

## Stat formulas

Every number on the card is either an existing stat already computed
elsewhere in the app, or an explicitly-derived approximation (never a
literal invention) for the reference image's stats that need a full
rating system this app doesn't have:

| Stat | Source |
|---|---|
| Rating | `winPercentage / 100 * 5`, rounded to 2 decimals (e.g. 88% → 4.40). Star row rounds to the nearest half-star. |
| Form | This calendar month's win % (falls back to overall win % if no matches yet this month). Tier words: 🔥 ON FIRE / 📈 IN FORM / ➖ STEADY / 📉 COOLING OFF / 🧊 COLD, using the same score bands as Threat Level. |
| Threat Level | Overall win % — the exact number/tier already shipped on Profile/Leaderboard/Roster/Teams (`threatTierFor` from `lib/stats/threatLevel.ts`). |
| Trend | This week's win % vs. last week's, in percentage points — reuses the existing weekly-trend calculation already computed for `stats.weekly`. |
| Win Streak | Consecutive wins counting back from the player's most recent completed match, across all tournaments. Resets on a loss. |
| Wins in last 10 | Wins among the player's 10 most recent completed matches (fewer if they haven't played 10 yet). |
| Wins vs Higher-Rated | Count of career wins where the opponent side's average *current* win % is higher than the player's own current win % — an honest proxy for "beat someone better," without a true ranking system. |
| Record | Total wins-losses — already computed (`stats.matchHistory`). |
| Matches | Total completed matches played — `stats.matchHistory.length`. |

## Rendering approach

The card is built as inline SVG, not HTML/CSS — the same markup renders
live on the page and converts to a PNG:

1. On page render: the SVG string is generated server-side (as JSX,
   since this is a Server Component page like the rest of `people/[id]`)
   from the player's stats, and displayed directly.
2. On click: a small Client Component wraps the card, serializes the
   rendered SVG to a string, draws it onto an offscreen `<canvas>` via
   an `Image` + `drawImage`, then calls `canvas.toBlob()` and triggers a
   download — the same "generate client-side, download/share" pattern
   the existing PDF export (`SharePlayerStatsButton.tsx`) already uses,
   producing a PNG instead of a PDF. No new npm dependency.

## No data yet

A player with zero completed matches renders the card with 0s and no
tier badge/shield highlighted (consistent with how `ThreatBadge` already
renders nothing for a `null` win percentage elsewhere in the app) —
never a crash, never a missing section. The "Wins vs Higher-Rated" and
"Wins in last 10" stats simply show 0.

## Out of scope

- No changes to how win percentage, star rating, or weekly trend are
  calculated — all reused as-is.
- No public share-page (`/p/[id]`) placement — Player Detail page only,
  per this feature's scope.
- No new rating/ELO system — Rating, Form, and Wins-vs-Higher-Rated stay
  explicitly derived approximations, as agreed earlier in this feature's
  design conversation.
