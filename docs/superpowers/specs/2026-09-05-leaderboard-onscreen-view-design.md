# Leaderboard On-Screen Readability Design

## Problem

`LocationLeaderboardCard` and `RaceLeaderboardCard` (Player of the Month) each render as a single fixed-width (760px) SVG that doubles as both the on-screen leaderboard view and the shareable PNG export. On a real phone, that SVG scales down to roughly 0.45× to fit the content column, so text that's a comfortable 26px in the SVG's own coordinate space renders at an effective ~11.7px on screen, down to ~4.3px for the smallest label. The Leaderboard page is a bottom-nav destination — one of five top-level app screens — and it's currently unreadable there. The SVG also can't be zoomed or text-selected: it's an `<img>`-equivalent inside a `<button>` whose click handler downloads it.

The underlying card design is good — medal gradients for ranks 1–3, zebra body rows, one hero number per row, name-shrinking before truncation. The problem is entirely the delivery mechanism: a shareable image is standing in for the in-app view.

## Decisions made during brainstorming

1. **Fix both `LocationLeaderboardCard` and `RaceLeaderboardCard` in one pass.** Same root cause, same fix shape; a shared on-screen component avoids building the fix twice.
2. **The SVG/PNG export logic is barely touched.** It's already correct and carefully tuned (manual font embedding for the PNG export, 2× canvas scaling, image inlining) — the fix is about what's *visible*, not about the export pipeline.
3. **The on-screen view keeps the same navy/gold palette as the share card**, per the organizer's own recorded preference in the existing code (`LocationLeaderboardCard.tsx`'s "All-navy throughout, on the organizer's explicit request" comment) — this is not a fresh design decision, it's continuity with an already-stated preference.
4. **The on-screen podium (ranks 1–3) mirrors the share card's own row-based treatment** (full-width rows: medal disc, name, W–L, tier badge, points plate) rather than the Standings page's side-by-side height-podium. These two leaderboard cards are already a visual family; keeping the on-screen view and the shared image looking like siblings matters more here than matching a different page's podium shape.
5. **The on-screen table shows every ranked player, not just the share image's 12-row cap.** The 12-row limit exists only to keep the exported PNG a reasonable size for WhatsApp; the on-screen view has no such constraint and should let an organizer actually see a venue's full ranking.
6. **The empty-venue fallback moves onto the same navy ground** as populated venues, instead of a plain white card sitting beside them in the same list (a small bundled fix — same per-venue block already being touched).

## Architecture

Three pieces, replacing the current single "SVG is both the view and the button" component:

1. **The existing SVG components become share-only.** Rename `LocationLeaderboardCard.tsx` → `LocationLeaderboardShareCard.tsx` and `RaceLeaderboardCard.tsx` → `RaceLeaderboardShareCard.tsx` (names reflecting their real, narrowed role). Internally, almost nothing changes: same `<svg>`, same `svgRef`, same `handleDownload`, same font/image embedding. Two changes only:
   - The `<svg>` is wrapped in a container that removes it from visual layout (`className="hidden"` — this does not affect the export, since `handleDownload` clones the SVG and rebuilds its own fonts/images from scratch rather than relying on how it was rendered on screen).
   - The outer `<button>` stops wrapping the SVG and becomes a small, explicit share button — `outlineButtonClass`, "📤 Share Leaderboard" — matching the existing `ShareResultsButton`/`ShareScheduleButton` pattern exactly, rather than "click anywhere on the card" behavior.
2. **A new shared `LeaderboardTable` component** (`app/components/LeaderboardTable.tsx`) renders the real on-screen view: podium rows for ranks 1–3, a real `<table>` for the rest. Used by both the Locations page and the Player-of-the-Month page, parameterized by:
   - `rows`: a common row shape covering both call sites — `{ rank, name, matchWins, losses, totalPoints, overallWinPercentage, secondaryStat?: { label: string; value: number } }` (the `secondaryStat` slot covers `tournamentWins` for Locations and `leagueWins` for Player of the Month, both rendered as the existing "★ N" treatment).
   - `title`, `kicker` (venue name vs. month label), `isLive` (drives the LIVE pill, Player of the Month only), `footerCaption` (the differing ranking-formula text per page), `overflowNote` (unused now that the table shows every row, but the prop stays available rather than assuming it can never matter again).
3. **Each page renders both**: the visible `LeaderboardTable` followed by the (hidden-SVG, visible-button) share component, per venue/section.

### `LeaderboardTable` visual structure

- **Podium rows (rank ≤ 3):** full-width row, medal-gradient disc (CSS `radial-gradient`/`linear-gradient` using the same gold/silver/bronze deep→light stops as the SVG, declared once as shared color constants — not re-derived), name (CSS ellipsis truncation, replacing the SVG's manual character-width heuristic), W–L using the existing `win`/`loss` tokens, `ThreatShieldBadge` at size 24, a "TOTAL POINTS" plate matching the SVG's boxed treatment.
- **Body rows (rank > 3):** a real `<table>` — `<caption>` (visually hidden, states what the table is for screen readers), `<th scope="col">` for POS / PLAYER / W–L / PTS, zebra striping via alternating row background (same two navy shades as the SVG), `ThreatShieldBadge` at size 18, `stat-num` tabular-figure class on every numeric cell.
- **LIVE pill** (Player of the Month only, `isLive` prop): a solid rounded pill reading "LIVE" in `#d1601f` — the exact color and treatment the SVG already uses (`RaceLeaderboardCard.tsx:74,320-331`) for the same signal (a live in-progress-month snapshot, not a frozen period) — reproduced in CSS, not reinvented.
- Typography uses the app's existing `font-heading` (Oswald) class — the same family the SVG already renders via `var(--font-oswald)` — so the on-screen table matches the rest of the app natively, with no new font introduced.

## Data flow

No changes to how rows are computed — `locations/page.tsx` and `player-of-the-month/page.tsx` already build the full, unsliced `rows` array server-side (via `sortLeaderboardCardRows`/`assignRanksWithTies`) before passing it down. That same array now goes to `LeaderboardTable` (all rows, no cap) and to the renamed share component (which keeps its own internal 12-row slice for the PNG export, unchanged).

## Testing

`LeaderboardTable` is a presentational component with no new business logic (rank/tier/points are all pre-computed) — no new unit tests, consistent with how every other page-level component in this app is verified (no existing page component has its own test file; verification is visual, via a temporary dev-preview route and a browser screenshot, per this project's established workflow).

The SVG share components' internal logic (font embedding, canvas export, row-count cap) is unchanged, so no new tests are needed there either — a manual check that the exported PNG is pixel-identical to before is the right verification, done via the existing "Share Leaderboard" button.

## Out of scope for this pass

- Restyling the podium metals' greyscale-failing colors on the Standings page (a separate, already-flagged finding in the design audit — different page, different bug).
- A second, effort-based leaderboard (matches played / most improved) — a design-audit suggestion, but a different feature, not part of fixing readability.
- Rank-change deltas (▲/▼) or current-user row pinning on the leaderboard — real improvements, but new capability, not part of this readability fix.
