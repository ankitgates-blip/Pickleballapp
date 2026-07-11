# Organizer Shell Redesign: Bottom Nav + Prominent Header — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Redesign the organizer app's shared header/nav shell
(`apps/organizer-web/app/components/OrganizerShell.tsx`) so that:

- "Player Profile" and "Locations" move out of the top bar into a new,
  persistent bottom navigation bar, each with its own icon.
- The top bar becomes taller and more visually prominent, with a
  high-quality Dubai skyline + pickleball court photo background, and a
  large logo badge that overlaps the boundary between the header and the
  page content beneath it.
- The brand name gets a bolder display font, and a new italic tagline
  ("Premier Dubai Pickle League App") appears next to it.

This redesign touches only `OrganizerShell.tsx` — the shared wrapper
used by every organizer-facing page (dashboard, roster, teams, bracket,
matches, standings, results, player profiles, locations). It does not
touch the public-facing pages (`/p/[id]`, `/t/[id]`, `/login`), which
have no "Player Profile"/"Locations" nav links to move in the first
place.

## Scope decisions (resolved via brainstorming + visual companion mockups, 2026-07-13)

All of the following were confirmed against interactive mockups before
being locked in:

- **Header background**: a photo showing both the Dubai skyline and a
  pickleball court (net, player, court lines), cropped from the same
  source image the logo itself came from, clean of the medallion. Saved
  as `apps/organizer-web/public/header-bg.png`. Rendered as a CSS
  background image with a teal-to-cyan gradient overlay
  (`linear-gradient(120deg, rgba(6,95,70,0.88), rgba(13,148,136,0.75)
  55%, rgba(8,145,178,0.7))`) on top, so the photo is visible but text
  stays legible and the brand's teal palette is preserved.
- **Header height**: increased from the current compact `py-3` bar to a
  ~110px-tall band, to make room for the bigger logo and two lines of
  brand text.
- **Logo placement and size**: 100×100px (up from the current 36×36),
  positioned on the left side of the header (not centered), vertically
  centered exactly on the boundary between the header and the page
  content below — half the circle sits over the header's photo
  background, half sits over the page's white background — so it visibly
  "overlaps" the two areas. The brand text is padded/positioned so it
  never overlaps the logo.
- **Brand name font**: "PICKLERALLY DXB" renders in **Black Ops One**
  (Google Font) — a bold stencil/military display face — chosen after
  comparing it against five other options (Bebas Neue, Anton, Oswald,
  Poppins Black, Russo One, Bungee, Squada One, Cinzel) in the mockups.
- **Tagline**: "Premier Dubai Pickle League App" appears next to the
  brand name in an italic running/script font. The mockups used a system
  cursive font (`Brush Script MT`) as a stand-in — since that font isn't
  reliably available across browsers/OSes in production, this design
  specifies **Dancing Script** (Google Font), a widely-used, legible
  handwriting-style script font, as the real implementation choice. Not
  shown in the mockups directly — flagged here for your review.
- **Bottom bar background**: the same teal-to-emerald-to-cyan gradient
  used elsewhere in the app's header/buttons
  (`linear-gradient(120deg, #065f46, #0d9488 55%, #0891b2)`) — not white,
  per your feedback on the first bottom-bar mockup.
- **Bottom bar icons**: distinct icons instead of reusing the logo twice
  — a person icon for "Player Profile", a map-pin icon for "Locations"
  (simple inline SVGs, `currentColor`-based so they can be recolored for
  active/inactive state).
- **Bottom bar behavior**: fixed/sticky at the bottom of the viewport at
  all times (confirmed via clarifying question) — the page's main content
  area gets bottom padding so the fixed bar never covers content.
- **Header behavior**: scrolls away normally with the page (confirmed via
  clarifying question) — not sticky, unlike the bottom bar.
- **Active-tab indication**: the bottom bar needs to know which of
  "Player Profile" / "Locations" (or neither) is the current page, to
  highlight the active one. Rather than threading a new prop through
  every one of the many pages that already render `<OrganizerShell>`,
  `OrganizerShell` becomes a client component (`'use client'`) and uses
  Next.js's `usePathname()` hook to detect the active section itself
  (`pathname.startsWith('/people')` → Player Profile active;
  `pathname.startsWith('/locations')` → Locations active). This is a
  contained, one-file change — `children` remains server-rendered as
  usual; only the shell wrapper itself becomes a client component, which
  is a standard, supported Next.js pattern.

## Implementation

### 1. Fonts — `apps/organizer-web/app/layout.tsx`

Add two new Google Fonts alongside the existing `Geist`, `Geist_Mono`,
and `Poppins` imports:

```typescript
import { Geist, Geist_Mono, Poppins, Black_Ops_One, Dancing_Script } from "next/font/google";
```

```typescript
const blackOpsOne = Black_Ops_One({
  variable: "--font-black-ops-one",
  subsets: ["latin"],
  weight: "400",
});

const dancingScript = Dancing_Script({
  variable: "--font-dancing-script",
  subsets: ["latin"],
  weight: ["600", "700"],
});
```

Add both variables to the `className` on the `<html>` element, alongside
the existing font variables:

```tsx
className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} ${blackOpsOne.variable} ${dancingScript.variable} h-full antialiased`}
```

### 2. Header background asset

Already saved: `apps/organizer-web/public/header-bg.png` (a 453×360px
crop showing the pickleball court, net, player, and Dubai skyline, clean
of the logo medallion — no further work needed for this asset).

### 3. `OrganizerShell.tsx` — full rewrite

- Add `'use client'` at the top of the file.
- Import `usePathname` from `next/navigation`.
- Remove the "Player Profile" and "Locations" `<Link>`s from the top bar
  entirely.
- Increase header height, apply the photo + gradient-overlay background,
  reposition the logo to overlap the header/content boundary on the
  left, apply `font-black-ops-one` to the brand name, and add the
  `font-dancing-script` italic tagline next to it.
- Add a new fixed bottom nav bar with the two moved links, each with its
  icon, highlighted by `usePathname()`.
- Add bottom padding to `<main>` so it clears the fixed bar.

### 4. Manual verification

Since this is a page-shell/CSS change with no pure-function logic, there
are no new automated tests — verification is `npm run build` (TypeScript
check) plus a manual browser regression pass across a few representative
organizer pages (dashboard, a player profile, the locations page) to
confirm the header, logo overlap, fonts, and fixed bottom bar all render
and behave correctly, including on a mobile-width viewport where a
bottom tab bar matters most.

## Out of scope

- No changes to the public-facing pages (`/p/[id]`, `/t/[id]`, `/login`)
  — they don't have "Player Profile"/"Locations" links to move, and
  weren't part of this redesign's scope.
- No changes to "Hi, {name}" / "Sign out", which stay in the top bar
  exactly where they are.
- No changes to `TournamentNav` (the roster/teams/bracket/matches/
  standings sub-nav within a single tournament) — a separate, unrelated
  navigation component.
- No new "active" indicator styling beyond what's needed for the two
  bottom-bar items (i.e., no broader nav-highlighting redesign).
