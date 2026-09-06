# Design Audit Quick Wins

## Problem

The app-wide design audit (published as an artifact, `https://claude.ai/code/artifact/e77cc045-6df6-48cd-93e9-47e2591a2e23`) found 11 small, independently-fixable issues where the app's own established design system (navy/gold/win/loss tokens, `cardClass`/`inputClass`/`primaryButtonClass`, `stat-num`) exists but wasn't applied, plus a few pieces of dead code and minor accessibility/copy gaps. None of these require a new design decision — the audit already specifies the exact fix for each.

## Decisions made during brainstorming

1. **`pickleturf-logo.png`** (the unused full wordmark) gets a home instead of being deleted: a small wordmark in `LeaderboardTable`'s header, shown only when the card's venue is Pickleturf — matching the exact venue-match convention `TournamentCard.tsx` already uses (`venue.trim().toLowerCase() === 'pickleturf'`).
2. Everything else is a direct, unambiguous application of an existing pattern already used elsewhere in the app — no new visual language introduced.

## The 11 items

### 1. Token adoption on the public player page
`app/p/[id]/page.tsx` uses raw `bg-green-100 text-green-800` / `bg-red-100 text-red-800` for win/loss pills and `text-amber-400` for the star row. Switch to the `win`/`loss`/`gold-bright` tokens already used identically on `app/people/[id]/page.tsx`.

### 2. Podium metal color fix on Standings
`app/tournaments/[id]/standings/page.tsx` hardcodes podium gradient stops (`#fde68a→#d4a017` gold, `#cbd5e1→#94a3b8` silver, `#fdba74→#c2703d` bronze) — bronze's highlight is lighter than silver's, so the podium reads gold/bronze/silver in greyscale, and white rank numerals on the silver block are ~1.4:1 contrast. Replace with the existing `gold-highlight`/`silver-light`/`bronze-dark` tokens (`app/globals.css`), and darken the rank-numeral text color on the silver/bronze blocks so it's legible.

### 3. Restyle `/settings` onto the design system
`app/settings/page.tsx` uses `rounded`/`border-slate-300`/`bg-slate-900` — values that appear nowhere else in the app. Replace with `cardClass`, `inputClass`, `primaryButtonClass`, `headingClass` from `app/components/ui.ts`. Keep the dashed border on the pending-invite row as-is (a good non-color state cue, per the audit).

### 4. Move Danger Zone to the bottom of the profile page
`app/people/[id]/page.tsx`'s Danger Zone card currently sits roughly a third of the way down the page, above every stat. Move it to the end of the page, after Match History.

### 5. Extract a shared alert component
~10 hand-rolled `bg-amber-50 border-amber-200 text-amber-800` / `bg-red-50 border-red-200 text-red-700` banners across `roster/page.tsx`, `teams/page.tsx`, `bracket/page.tsx`, and `login/page.tsx`. New `app/components/AlertBanner.tsx`: `{ tone: 'warning' | 'error'; children: React.ReactNode }`, rendering the existing amber/red treatments. Replace every hand-rolled instance with it.

### 6. Apply `stat-num` on the profile page
`app/people/[id]/page.tsx`'s Match History scores, This Month figures, and By Location counts don't use the `stat-num` tabular-figures class that `standings`/`results`/`bracket` already apply. Add it.

### 7. Logo cleanup
Delete `public/next.svg`, `public/vercel.svg`, `public/file.svg`, `public/globe.svg`, `public/window.svg` (unused Next.js scaffold leftovers). Add `public/pickleturf-logo.png` as a small wordmark (roughly 80-100px wide) in `LeaderboardTable`'s header row, shown only when `title.trim().toLowerCase() === 'pickleturf'`.

### 8. Accessibility
Add `aria-label` (e.g. `"1st place"`) to every medal emoji (`standings/page.tsx`, `results/page.tsx`, `t/[id]/page.tsx`). Add `aria-current="page"` to the active tab in `app/components/TournamentNav.tsx`.

### 9. Share-hint dedup
Extract the 4 copies of `<p className="text-xs text-muted mt-1.5">Opens your share sheet on mobile — downloads the file on desktop.</p>` (in `roster/page.tsx`, `bracket/page.tsx`, `results/page.tsx`, `people/[id]/page.tsx`) into a single `app/components/ShareHint.tsx`.

### 10. Copy fix
`app/tournaments/page.tsx`: "Upcoming Matches" → "Upcoming Leagues" (match-vs-league terminology correctness, per the audit).

### 11. Sizing fixes
- `app/components/AchievementsGrid.tsx`: `grid-cols-4` at every breakpoint → `grid-cols-3` at base, `sm:grid-cols-4`. Description text `text-[8.5px]` → `text-[10px]`.
- `app/tournaments/[id]/bracket/page.tsx`: score-entry inputs `w-20 text-lg` → `w-24 text-2xl min-h-[56px]`, plus `inputMode="numeric"`.

## Testing

Most of the 11 items are pure presentational changes (styling, copy, dead-code removal) — no new unit tests, consistent with how every other page-level/presentational change in this app is verified (visual, via a temporary dev-preview route and browser screenshot, not a test file).

The one exception: `AlertBanner`'s `tone -> className` mapping is a small pure branching function, the same class of logic as `medalStops()` in `leaderboardPalette.ts` (which has its own 4-test file). Give `AlertBanner` the same treatment — a small test asserting the right classes come back for `'warning'` and `'error'`.

## Out of scope for this pass

- Everything in the audit's "Medium" and "Bigger redesign" categories — separate, larger pieces of work, each needing more design judgment than a quick win.
- Any change to `AlertBanner`'s underlying color values (still the app's existing amber/red) — this is an extraction, not a redesign of the alert treatment itself.
