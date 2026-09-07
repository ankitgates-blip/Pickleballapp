# Consistency Cleanup Batch (Design Audit — Medium Items, Batch 1 of 4)

## Problem

The app-wide design audit (`https://claude.ai/code/artifact/e77cc045-6df6-48cd-93e9-47e2591a2e23`, "PickleRally Design Audit") flags several "Medium" items — scoped fixes that still need a design call rather than a mechanical token swap. This is the first of 4 batches covering the audit's remaining Medium/Bigger-redesign items, grouped by risk: this batch is the lowest-risk group, applying patterns the app already uses elsewhere rather than introducing anything new.

Batch 2 (new content on existing pages), Batch 3 (structural nav rework), and Batch 4 (new features & brand) are out of scope for this spec — they'll each get their own brainstorm/spec/plan cycle.

## The 5 items

### 1. Header context strip (fixes the 80px dead band + missing league identity)

**Current state:** `OrganizerShell.tsx`'s circular logo sits at `top-[196px] -translate-y-1/2`, occupying only the leftmost ~180px of a full-width band; `main` carries `pt-20` (80px) purely to clear it, producing an 80px-tall, full-width empty strip below the header on all 14 routes. Separately, only `results/page.tsx` shows the tournament's name/date/venue (`{tournament.date} · 📍 {venueName} · 🕐 {timeslotLabel(...)} · {formatLabel(...)}`) — someone deep-linked to `/bracket` from WhatsApp has no on-screen confirmation which league they're even in.

**Fix:** `OrganizerShell` gains a new optional prop:

```ts
contextStrip?: { title: string; dateLabel: string; venueName: string };
```

When present, it renders in the same 80px band, to the right of the circular logo (not below it) — white text on the header photo, reusing the existing `{date} · 📍 {venue}` copy pattern already proven on Results. When absent, the header renders exactly as it does today (no visual change).

**Scope:** Only the 5 tournament sub-pages — Roster, Teams, Bracket, Standings, Results — pass `contextStrip` (each already fetches the tournament row for its own `TournamentNav`/page content, so no new query is needed). Every other route (Tournaments list, People list, Locations, Player of the Month, Settings, Login) omits it; there's no single entity in focus on those pages, so nothing is added there.

### 2. Unified `<StandingsTable>` component

**Current state:** Four distinct standings-table implementations:
- `standings/page.tsx` — the best one: real podium proportions, `▲`/`▼` movement glyphs, `win`/`loss` tokens, `stat-num` throughout.
- `/t/[id]/page.tsx` — public table: medals + `stat-num` on wins, but no point-diff column, no pills, no movement glyphs.
- `bracket/page.tsx`'s two plain W/L tables ("Team Standings (Playoff Seeding)" and "League Standings") — plainest of the four: no medals, no `stat-num`, no win/loss tokens, just `text-navy-mid`/`text-slate-500`.

**Fix:** Extract `app/components/StandingsTable.tsx` rendering the shape common to all four: rank (with medal + `aria-label` on top 3), name, and `stat-num`'d W/L columns using the `win`/`loss` tokens. All 4 spots adopt it for this common shape.

`standings/page.tsx` keeps its own additional podium and `▲`/`▼` movement-glyph layer on top of `<StandingsTable>` — that data (rank history) genuinely doesn't exist in the bracket-page or public-page contexts, so those two don't gain a podium or glyphs, just the shared, consistent table underneath.

### 3. `<RoundActionCard>` extraction

**Current state:** The Bracket page has ~13 identical blocks of the shape:
```tsx
<form action={...} className={`${actionCardClass} text-center mb-6`}>
  <p className="text-slate-600 mb-4">...message...</p>
  <SaveButton className={accentButtonClass | outlineButtonClass} pendingLabel="...">
    ...label...
  </SaveButton>
</form>
```
(across Popcorn, Gauntlet ×3, Claim the Throne ×3, Up and Down the River ×3, round-robin generate, league-playoffs generate, and Generate Final), plus 2 further blocks using the same `actionCardClass text-center mb-6` wrapper but different inner content — one with two buttons side by side ("Skip to Final"), one using a custom `<RegenerateLeagueRoundsButton>` instead of `<SaveButton>`.

**Fix:** `app/components/RoundActionCard.tsx` — a thin wrapper, not a rigid single-button component:

```ts
{
  as: 'form' | 'div';
  formAction?: (formData: FormData) => Promise<void>; // required when as="form"
  children: React.ReactNode; // the message + whatever button(s) the caller renders
}
```

It renders `<form>` or `<div>` with the shared `actionCardClass text-center mb-6` wrapper and nothing else — the message text and button(s) stay page-specific as children. All ~15 sites (13 identical + the two-button variant + the custom-button variant) drop their repeated wrapper markup and use this component; none of them need new props or a changed shape to fit.

### 4. Desktop container widening

**Current state:** `OrganizerShell.tsx`'s `main` is `max-w-3xl` (768px) on every route. On a 1440px display that's ~336px of empty margin each side — fine for forms and match lists, wasteful for the app's two pure-browsing surfaces: the People avatar grid (`grid-cols-2 sm:grid-cols-3`, no `lg:` variant) and the Tournaments card list (single-column `<ul>` of `TournamentCard`, no width variant at any breakpoint).

**Fix:** `OrganizerShell` gains a second new optional prop:

```ts
containerWidth?: 'default' | 'wide'; // default: 'default'
```

`'default'` keeps today's `max-w-3xl`; `'wide'` swaps in `max-w-5xl` (1024px). Only `app/people/page.tsx` and `app/tournaments/page.tsx` pass `'wide'`. Mobile is untouched (the swap only affects the container's max-width, not its base padding or the grid's own responsive columns below `lg:`).

At `lg:`, People's grid becomes `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`; Tournaments' card list becomes a 2-column grid (`lg:grid-cols-2 lg:gap-4`, replacing the plain `<ul className="space-y-3">` stack at that breakpoint only).

### 5. Two blacks — resolve `#1c1917` onto the navy ramp

**Current state:** `ThreatBadge.tsx` uses `bg-[#1c1917]` (warm near-black) as its pill/box background in both `size="default"` (profile header, next to the navy-toned `PlayerStatsCard`) and `size="compact"` (roster rows, team pairings). The same exact `#1c1917` also fills `PlayerStatsCard.tsx`'s 3 stat tiles (games/streak/threat) internally — inside a card whose outer background is a navy gradient. It's the only warm-black surface anywhere in an otherwise all-cool-navy app.

**Fix:** Replace `#1c1917` with `#0c1830` (the app's existing `--color-navy-deep` token value) in all 5 spots — `ThreatBadge.tsx`'s 2 background declarations and `PlayerStatsCard.tsx`'s 3 stat-tile `fill` values. Borders (`#3f3f46`), text colors, and every other value on these elements stay unchanged — this is a single fill-color swap, not a redesign of either component.

## Testing

All 5 items are presentational/structural refactors with existing behavior preserved — verified visually via a temporary dev-preview route and browser screenshot, matching how every other page-level/presentational change in this app has been verified this session. No new unit tests are needed except where a new component has real branching logic worth a small test file (consistent with `AlertBanner.test.ts`'s precedent) — `<RoundActionCard>` and `<StandingsTable>` are close calls; the implementation plan will decide per-component based on whether they contain any conditional logic beyond prop pass-through.

## Out of scope for this pass

- Batches 2-4 (new content, structural nav rework, new features & brand) — separate specs.
- Any change to the `win`/`loss`/`navy-deep` token values themselves — this batch only extends their reach into places that bypass them today.
- Rank-movement tracking for the bracket-page or public-page standings tables (needed to show podiums/glyphs there) — explicitly deferred; those two contexts get the shared table shape only.
