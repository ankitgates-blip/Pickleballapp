# Navy & Gold Rebrand — Design

Status: Approved (converged through live visual iteration with the
brainstorming companion), pending spec review before implementation
plan.

## Goal

Apply the navy/gold/orange palette, Space Grotesk headings, bigger
logo, and refreshed nav icons the organizer approved after iterating
live in the visual companion, to the app's shared design tokens and
top-level shell — the change with the broadest visible impact for the
smallest, most coherent unit of work.

## Background

Colors were not invented — they were sampled directly from the
organizer's existing `public/logo.png` via canvas pixel analysis:

- **Navy** (dominant fill): `#0c1830` (darkest) / `#16294e` (mid) /
  `#1c3560` (lightest) — used for gradients
- **Antique gold** (text/trim on the logo): `#a8874f`
- **Vivid orange** (the ball): `#d2621c`, with `#b6462a` as a deeper
  variant for hover/pressed states

Typography: `Poppins` (current heading font) is replaced by
`Space Grotesk` — validated across every mockup round with no pushback
once introduced. Body text stays on the existing Geist Sans; only the
heading font changes.

Logo size in the header goes from 100px to 140px, per explicit
request. The existing `header-bg.png` (a blurred pickleball-court
photo with the Dubai skyline — already on-brand) is kept; only its
color overlay changes from green/teal to navy, so no new image asset
is needed there.

The bottom nav's `PersonIcon`/`BarChartIcon` are replaced with the
richer, gold-accented icons validated in the companion (a rounded
player-badge silhouette, and ascending bars with a small star for
"Leaderboard").

## Design

### 1. New theme color tokens (`app/globals.css`)

Add to the existing `@theme inline` block:

```css
--color-navy-deep: #0c1830;
--color-navy-mid: #16294e;
--color-navy-light: #1c3560;
--color-gold: #a8874f;
--color-brand-orange: #d2621c;
--color-brand-orange-deep: #b6462a;
```

(Named `brand-orange` rather than `orange` to avoid colliding with
Tailwind's built-in `orange-*` scale, which several pages already use
for unrelated warnings/badges.)

### 2. Font swap (`app/layout.tsx` + `app/globals.css`)

Replace the `Poppins` import with `Space_Grotesk` (same weights: 600,
700, 800), rename the CSS variable, and repoint `--font-heading` at it.
Every `<h1>`/`<h2>`/`<h3>` across the app already inherits
`var(--font-heading)` globally (`globals.css`'s `h1, h2, h3 {
font-family: var(--font-heading); }`), so this one change cascades
everywhere with no per-page edits needed.

### 3. Shared component restyle (`app/components/ui.ts`)

- `cardClass` — border color warms from `slate-200` to a cream tone
  matching the mockups (`#eee7db`)
- `vibrantCardClass` — border/shadow re-tinted from teal to navy
- `primaryButtonClass` — gradient changes from teal→cyan to
  orange→deep-orange (`#d2621c` → `#b6462a`)
- `accentButtonClass` — gradient changes from lime to gold-toned
  (`#c9a865` → `#a8874f`), with dark warm-brown text for contrast
  (mirrors how the current lime button uses dark green text)
- `outlineButtonClass` — border/text change from teal to navy
  (`#16294e`)
- `linkClass` — text color changes from teal to navy
- `headingClass` — text color changes from `slate-900` to navy
  (`#0c1830`) — this export is currently unused anywhere, updated for
  consistency/future use, not a visible change today

### 4. `OrganizerShell.tsx` restyle

- Header gradient overlay (drawn over the existing `header-bg.png`):
  green/teal → navy (`rgba(12,24,48,.92)` → `rgba(22,41,78,.82)` → 
  `rgba(12,24,48,.78)`)
- Logo: 100px → 140px, border width 4px → 5px, header padding-left
  widened so the wordmark still clears it (matches the validated
  mockup layout exactly)
- Bottom nav gradient: green/teal → navy, matching the header
- "+" Create Tournament FAB: cyan → vivid orange (`#d2621c`)
- `PersonIcon`: replaced with a rounded player-badge silhouette (head
  circle + shoulders arc), gold-colored
- `BarChartIcon` (Leaderboard): replaced with ascending bars plus a
  small star at the top, gold bars / orange star

### 5. Dashboard font-size and badge-color polish (`app/tournaments/page.tsx`)

Matching the specific proportions validated in the mockup: section
headers ("🔥 Upcoming Matches" / "✅ Recently Completed") and card
title text sized up one step, and the "days away" badge recolored to
the new brand orange for cohesion with the rest of the palette.

## Out of scope (deferred, not forgotten)

- Auditing every individual page's inline `teal-*`/`lime-*`/`cyan-*`
  Tailwind classes that don't route through the shared `ui.ts`
  constants (e.g. format-specific pills, the champion amber badge,
  per-page status colors). These pages will automatically pick up the
  new fonts and any shared-component changes, but their own
  hand-rolled color classes stay as-is until a follow-up polish pass —
  this increment intentionally targets the shared design-system layer
  (`ui.ts` + `OrganizerShell`) plus the Dashboard specifically, since
  that's what was actually validated live.
- App-wide heading/label font-SIZE increases beyond the Dashboard —
  each page currently sets its own Tailwind size classes inline; a
  global size sweep across every page is a separate, larger effort.
- Any new photography/logo asset — the existing `header-bg.png` and
  `logo.png` are reused as-is, just restyled around.
- Profile photo upload (still a separate, not-yet-built feature from
  an earlier request).
