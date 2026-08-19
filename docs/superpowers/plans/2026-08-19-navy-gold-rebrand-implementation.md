# Navy & Gold Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the navy/gold/orange palette (sampled from the organizer's real logo), Space Grotesk headings, a bigger header logo, and refreshed nav icons to the app's shared design tokens, top-level shell, and Dashboard.

**Architecture:** New Tailwind v4 theme color tokens and a font swap in `globals.css`/`layout.tsx`, cascading through the shared `ui.ts` style constants and `OrganizerShell.tsx` (which every page already uses), plus a targeted font-size/color polish pass on the Dashboard (`tournaments/page.tsx`) matching what was validated live in the visual companion.

**Tech Stack:** Next.js App Router, Tailwind CSS v4, `next/font/google`.

## Global Constraints

- Colors are exact values sampled from the organizer's real `public/logo.png`: navy `#0c1830` (deep) / `#16294e` (mid) / `#1c3560` (light), antique gold `#a8874f`, vivid orange `#d2621c` (with `#b6462a` as a deeper hover/pressed variant). New Tailwind theme tokens are named `navy-deep`, `navy-mid`, `navy-light`, `gold`, `brand-orange`, `brand-orange-deep` (the `brand-` prefix on orange avoids colliding with Tailwind's built-in `orange-*` scale, which other pages still use for unrelated warnings).
- Only the heading font changes (`Poppins` → `Space Grotesk`, weights 500/600/700 — Space Grotesk has no 800 weight, unlike Poppins). Body text stays on the existing Geist Sans.
- The existing `public/header-bg.png` and `public/logo.png` assets are reused as-is — only colors drawn around them change, no new image assets.
- Destructive/danger actions (overdue badge, Cancel links) keep their existing red — only the non-destructive "days away" badge and brand accents move to the new palette.
- Out of scope: any page's inline `teal-*`/`lime-*`/`cyan-*` classes that don't route through `ui.ts` or `OrganizerShell` (format pills, per-page status colors), and any app-wide heading font-size sweep beyond the Dashboard.

---

### Task 1: New theme color tokens + font swap

**Files:**
- Modify: `apps/organizer-web/app/globals.css`
- Modify: `apps/organizer-web/app/layout.tsx`

**Interfaces:**
- Produces: Tailwind utilities `bg-navy-deep`/`text-navy-deep`/`border-navy-deep` (and the same for `navy-mid`, `navy-light`, `gold`, `brand-orange`, `brand-orange-deep`), and `--font-heading` now resolving to Space Grotesk — both consumed by Task 2 and Task 3.

- [ ] **Step 1: Add the new color tokens and repoint `--font-heading`**

In `apps/organizer-web/app/globals.css`, find:

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-poppins);
  --font-brand: var(--font-black-ops-one);
  --font-script: var(--font-dancing-script);
}
```

Replace with:

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-space-grotesk);
  --font-brand: var(--font-black-ops-one);
  --font-script: var(--font-dancing-script);
  --color-navy-deep: #0c1830;
  --color-navy-mid: #16294e;
  --color-navy-light: #1c3560;
  --color-gold: #a8874f;
  --color-brand-orange: #d2621c;
  --color-brand-orange-deep: #b6462a;
}
```

- [ ] **Step 2: Swap the Poppins font import for Space Grotesk**

In `apps/organizer-web/app/layout.tsx`, find:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins, Black_Ops_One, Dancing_Script } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});
```

Replace with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk, Black_Ops_One, Dancing_Script } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});
```

- [ ] **Step 3: Update the `<html>` className to use the renamed variable**

Find:

```tsx
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} ${blackOpsOne.variable} ${dancingScript.variable} h-full antialiased`}
    >
```

Replace with:

```tsx
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${blackOpsOne.variable} ${dancingScript.variable} h-full antialiased`}
    >
```

- [ ] **Step 4: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no errors (confirms `Space_Grotesk` is a valid `next/font/google` export and the weight array is valid for that font).

- [ ] **Step 5: Run the full test suite**

Run: `cd apps/organizer-web && npm test`
Expected: all tests still pass — this task touches no application logic.

- [ ] **Step 6: Commit**

```bash
git add apps/organizer-web/app/globals.css apps/organizer-web/app/layout.tsx
git commit -m "feat: add navy/gold theme tokens and swap heading font to Space Grotesk"
```

---

### Task 2: Restyle shared component classes

**Files:**
- Modify: `apps/organizer-web/app/components/ui.ts`

**Interfaces:**
- Consumes: the `navy-deep`/`navy-mid`/`navy-light`/`gold`/`brand-orange`/`brand-orange-deep` Tailwind utilities from Task 1.
- Produces: no new exports — `cardClass`, `vibrantCardClass`, `inputClass`, `primaryButtonClass`, `accentButtonClass`, `outlineButtonClass`, `linkClass`, `pillClass`, `headingClass` keep their exact existing names/signatures, only their string values change. Every page importing these picks up the new look automatically.

- [ ] **Step 1: Replace the whole file**

Find the current full content of `apps/organizer-web/app/components/ui.ts`:

```typescript
export const cardClass = 'bg-white rounded-2xl shadow-sm border border-slate-200 p-6';

export const vibrantCardClass =
  'bg-white rounded-2xl p-4 border border-teal-100 shadow-[0_10px_25px_rgba(13,148,136,0.15)] relative overflow-hidden';

export const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500';

export const primaryButtonClass =
  'inline-flex items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-bold px-5 py-2.5 text-sm shadow-[0_6px_16px_rgba(13,148,136,0.4)] transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0';

export const accentButtonClass =
  'inline-flex items-center justify-center rounded-full bg-gradient-to-br from-lime-300 to-lime-400 hover:from-lime-200 hover:to-lime-300 text-green-900 font-extrabold px-5 py-2.5 text-sm shadow-[0_6px_16px_rgba(163,230,53,0.5)] transition-all hover:-translate-y-0.5';

export const outlineButtonClass =
  'inline-flex items-center justify-center rounded-full bg-white hover:bg-teal-50 text-teal-700 font-bold px-5 py-2.5 text-sm border-2 border-teal-600 transition-colors';

export const linkClass = 'text-teal-700 font-semibold hover:text-teal-800 hover:underline';

export const pillClass =
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold';

export const headingClass = 'font-heading font-extrabold tracking-tight text-slate-900';
```

Replace with:

```typescript
export const cardClass = 'bg-white rounded-2xl shadow-sm border border-[#eee7db] p-6';

export const vibrantCardClass =
  'bg-white rounded-2xl p-4 border border-[#eee7db] shadow-[0_10px_25px_rgba(12,24,48,0.12)] relative overflow-hidden';

export const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-mid focus:border-navy-mid';

export const primaryButtonClass =
  'inline-flex items-center justify-center rounded-full bg-gradient-to-br from-brand-orange to-brand-orange-deep hover:from-[#e0752e] hover:to-[#c65530] text-white font-bold px-5 py-2.5 text-sm shadow-[0_6px_16px_rgba(210,98,28,0.4)] transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0';

export const accentButtonClass =
  'inline-flex items-center justify-center rounded-full bg-gradient-to-br from-[#c9a865] to-gold hover:from-[#d4b578] hover:to-[#b8965c] text-[#2a2110] font-extrabold px-5 py-2.5 text-sm shadow-[0_6px_16px_rgba(168,135,79,0.5)] transition-all hover:-translate-y-0.5';

export const outlineButtonClass =
  'inline-flex items-center justify-center rounded-full bg-white hover:bg-[#f4f1ea] text-navy-mid font-bold px-5 py-2.5 text-sm border-2 border-navy-mid transition-colors';

export const linkClass = 'text-navy-mid font-semibold hover:text-navy-deep hover:underline';

export const pillClass =
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold';

export const headingClass = 'font-heading font-extrabold tracking-tight text-navy-deep';
```

- [ ] **Step 2: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Run the full test suite**

Run: `cd apps/organizer-web && npm test`
Expected: all tests still pass — this file has no pure-function logic, only exported style-class strings.

- [ ] **Step 4: Commit**

```bash
git add apps/organizer-web/app/components/ui.ts
git commit -m "feat: restyle shared component classes to the navy/gold/orange palette"
```

---

### Task 3: Restyle `OrganizerShell` — header, bigger logo, nav, new icons

**Files:**
- Modify: `apps/organizer-web/app/components/OrganizerShell.tsx`

**Interfaces:**
- No new exports — `OrganizerShell`'s props/signature are unchanged, only its internal markup/styling and the two icon components change.

- [ ] **Step 1: Replace the icon components**

Find:

```tsx
function PersonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a7 7 0 0 1 14 0v1" />
    </svg>
  );
}

function BarChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M6 20V13" />
      <path d="M12 20V7" />
      <path d="M18 20V10" />
    </svg>
  );
}
```

Replace with:

```tsx
function PersonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" fill="currentColor" />
      <path d="M4 21v-1a7 7 0 0 1 14 0v1" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function LeaderboardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M6 20V13M12 20V7M18 20V10" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M12 1.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill="currentColor" />
    </svg>
  );
}
```

(`PersonIcon` now renders a filled head with a stroked shoulder arc, reading more like a badge/avatar. `BarChartIcon` is renamed `LeaderboardIcon` since it now shows ascending bars plus a small star — both still use `currentColor`, so they keep responding to the active/inactive text-color classes applied at each `<Link>`.)

- [ ] **Step 2: Restyle the header gradient and the ball-texture accent**

Find:

```tsx
        <header
          className="relative overflow-hidden text-white shadow-lg"
          style={{
            backgroundImage:
              "linear-gradient(120deg, rgba(6,95,70,0.88), rgba(13,148,136,0.75) 55%, rgba(8,145,178,0.7)), url('/header-bg.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div
            aria-hidden
            className="ball-texture absolute -top-6 -right-3 h-28 w-28 rounded-full opacity-90 shadow-lg"
            style={{ background: 'radial-gradient(circle at 35% 35%, #eaff00, #c9e800)' }}
          />
```

Replace with:

```tsx
        <header
          className="relative overflow-hidden text-white shadow-lg"
          style={{
            backgroundImage:
              "linear-gradient(120deg, rgba(12,24,48,0.92), rgba(22,41,78,0.82) 55%, rgba(12,24,48,0.78)), url('/header-bg.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div
            aria-hidden
            className="ball-texture absolute -top-6 -right-3 h-28 w-28 rounded-full opacity-90 shadow-lg"
            style={{ background: 'radial-gradient(circle at 35% 35%, #f2942e, #d2621c)' }}
          />
```

- [ ] **Step 3: Widen the header for the bigger logo, and restyle the wordmark/tagline/sign-out text**

Find:

```tsx
          {/* pl-[130px] clears the overlapping logo: left-[30px] + 100px width below */}
          <div className="relative max-w-3xl mx-auto px-4 pt-4 pb-2 pl-[130px] min-h-[110px] flex flex-col justify-center">
            <span
              className="font-brand text-lg tracking-wide leading-none"
              style={{ textShadow: '0 2px 6px rgba(0,0,0,0.4)' }}
            >
              PICKLERALLY DXB
            </span>
            <span
              className="font-script italic text-lg text-lime-200 mt-1"
              style={{ textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
            >
              Premier Dubai Pickle League App
            </span>
          </div>
          {organizerName && (
            <form action={signOut} className="absolute top-3 right-4 flex items-center gap-3">
              <span className="text-sm text-teal-50 hidden sm:inline">
                Hi, {organizerName}
              </span>
              <button
                type="submit"
                className="text-sm font-semibold bg-teal-800/60 hover:bg-teal-800 transition-colors px-3 py-1.5 rounded-full backdrop-blur-sm"
              >
                Sign out
              </button>
            </form>
          )}
        </header>
        <Link href="/tournaments" className="absolute z-10 left-[30px] top-[110px] -translate-y-1/2">
          <Image
            src="/logo.png"
            alt="PicklerAlly DXB"
            width={100}
            height={100}
            className="rounded-full border-4 border-white shadow-xl"
          />
        </Link>
```

Replace with:

```tsx
          {/* pl-[170px] clears the overlapping logo: left-[30px] + 140px width below */}
          <div className="relative max-w-3xl mx-auto px-4 pt-4 pb-2 pl-[170px] min-h-[150px] flex flex-col justify-center">
            <span
              className="font-brand text-lg tracking-wide leading-none"
              style={{ textShadow: '0 2px 6px rgba(0,0,0,0.4)' }}
            >
              PICKLERALLY DXB
            </span>
            <span
              className="font-script italic text-lg text-[#c9a865] mt-1"
              style={{ textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
            >
              Premier Dubai Pickle League App
            </span>
          </div>
          {organizerName && (
            <form action={signOut} className="absolute top-3 right-4 flex items-center gap-3">
              <span className="text-sm text-[#dbe4f5] hidden sm:inline">
                Hi, {organizerName}
              </span>
              <button
                type="submit"
                className="text-sm font-semibold bg-navy-mid/60 hover:bg-navy-mid transition-colors px-3 py-1.5 rounded-full backdrop-blur-sm"
              >
                Sign out
              </button>
            </form>
          )}
        </header>
        <Link href="/tournaments" className="absolute z-10 left-[30px] top-[150px] -translate-y-1/2">
          <Image
            src="/logo.png"
            alt="PicklerAlly DXB"
            width={140}
            height={140}
            className="rounded-full border-[5px] border-white shadow-xl"
          />
        </Link>
```

- [ ] **Step 4: Restyle the bottom nav gradient, active/inactive colors, and the FAB**

Find:

```tsx
      <nav
        className="fixed bottom-0 left-0 right-0 flex text-white shadow-[0_-4px_12px_rgba(0,0,0,0.15)] z-20"
        style={{
          backgroundImage: 'linear-gradient(120deg, #065f46, #0d9488 55%, #0891b2)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <Link
          href="/people"
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold ${
            isPlayerProfileActive ? 'text-lime-300' : 'text-teal-50'
          }`}
        >
          <PersonIcon />
          Player Profile
        </Link>
        <Link href="/tournaments/new" className="relative flex-1 flex flex-col items-center">
          <span className="absolute -top-[18px] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-cyan-400 border-[3px] border-white shadow-lg">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1e293b" strokeWidth={3} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span className="mt-9 text-[10px] font-extrabold text-white">Create Tournament</span>
        </Link>
        <Link
          href="/locations"
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold ${
            isLocationsActive ? 'text-lime-300' : 'text-teal-50'
          }`}
        >
          <BarChartIcon />
          Leaderboard
        </Link>
      </nav>
```

Replace with:

```tsx
      <nav
        className="fixed bottom-0 left-0 right-0 flex text-white shadow-[0_-4px_12px_rgba(0,0,0,0.15)] z-20"
        style={{
          backgroundImage: 'linear-gradient(120deg, #0c1830, #16294e 55%, #1c3560)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <Link
          href="/people"
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold ${
            isPlayerProfileActive ? 'text-gold' : 'text-[#b9c4dd]'
          }`}
        >
          <PersonIcon />
          Player Profile
        </Link>
        <Link href="/tournaments/new" className="relative flex-1 flex flex-col items-center">
          <span className="absolute -top-[18px] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-brand-orange border-[3px] border-white shadow-lg">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0c1830" strokeWidth={3} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span className="mt-9 text-[10px] font-extrabold text-white">Create Tournament</span>
        </Link>
        <Link
          href="/locations"
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold ${
            isLocationsActive ? 'text-gold' : 'text-[#b9c4dd]'
          }`}
        >
          <LeaderboardIcon />
          Leaderboard
        </Link>
      </nav>
```

- [ ] **Step 5: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript errors — this confirms `LeaderboardIcon` is correctly renamed at both its definition and its one call site (the old `BarChartIcon` name must not appear anywhere in the file anymore).

- [ ] **Step 6: Run the full test suite**

Run: `cd apps/organizer-web && npm test`
Expected: all tests still pass — this is a Client Component with no pure-function logic.

- [ ] **Step 7: Commit**

```bash
git add apps/organizer-web/app/components/OrganizerShell.tsx
git commit -m "feat: restyle OrganizerShell header/nav to navy/gold, enlarge logo, new nav icons"
```

---

### Task 4: Dashboard font-size and color polish

**Files:**
- Modify: `apps/organizer-web/app/tournaments/page.tsx`

**Interfaces:**
- No new exports — purely a styling pass on existing JSX.

- [ ] **Step 1: Bump the section header size/color (both "Upcoming Matches" and "Recently Completed")**

Find (this exact text appears twice — once for each section — apply this same find/replace to BOTH occurrences):

```tsx
          <h2 className="text-lg font-extrabold text-slate-900 mb-3 flex items-center gap-2">
            <span>🔥</span> Upcoming Matches
          </h2>
```

Replace with:

```tsx
          <h2 className="text-xl font-extrabold text-navy-deep mb-3 flex items-center gap-2">
            <span>🔥</span> Upcoming Matches
          </h2>
```

Find:

```tsx
          <h2 className="text-lg font-extrabold text-slate-900 mb-3 flex items-center gap-2">
            <span>✅</span> Recently Completed
          </h2>
```

Replace with:

```tsx
          <h2 className="text-xl font-extrabold text-navy-deep mb-3 flex items-center gap-2">
            <span>✅</span> Recently Completed
          </h2>
```

- [ ] **Step 2: Bump the card title size/color (both cards)**

Find (this exact text appears twice — once in the Upcoming Matches card, once in the Recently Completed card — apply to BOTH occurrences):

```tsx
                    <div className="font-extrabold text-base text-slate-900 mb-1.5">
                      🏆 {t.name}
                    </div>
```

Replace with:

```tsx
                    <div className="font-extrabold text-lg text-navy-deep mb-1.5">
                      🏆 {t.name}
                    </div>
```

- [ ] **Step 3: Recolor the "days away" badge**

Find:

```tsx
                    <span
                      className={`absolute top-0 right-0 ${
                        isOverdue ? 'bg-red-600' : 'bg-orange-500'
                      } text-white text-[10px] font-extrabold px-3 py-1 rounded-bl-xl rounded-tr-2xl tracking-wide`}
                    >
```

Replace with:

```tsx
                    <span
                      className={`absolute top-0 right-0 ${
                        isOverdue ? 'bg-red-600' : 'bg-brand-orange'
                      } text-white text-[10px] font-extrabold px-3 py-1 rounded-bl-xl rounded-tr-2xl tracking-wide`}
                    >
```

- [ ] **Step 4: Recolor the "Manage tournament →" link**

Find:

```tsx
                      <Link
                        href={`/tournaments/${t.id}/roster`}
                        className="text-xs font-bold text-teal-700 hover:underline"
                      >
                        Manage tournament →
                      </Link>
```

Replace with:

```tsx
                      <Link
                        href={`/tournaments/${t.id}/roster`}
                        className="text-xs font-bold text-navy-mid hover:underline"
                      >
                        Manage tournament →
                      </Link>
```

- [ ] **Step 5: Recolor the "View results →" link and the champion name line**

Find:

```tsx
                    {championName && (
                      <div className="text-xs font-bold text-amber-700 mt-1.5">
                        🏆 {championName}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <Link
                        href={`/tournaments/${t.id}/results`}
                        className="text-xs font-bold text-teal-700 hover:underline"
                      >
                        View results →
                      </Link>
```

Replace with:

```tsx
                    {championName && (
                      <div className="text-xs font-bold text-gold mt-1.5">
                        🏆 {championName}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <Link
                        href={`/tournaments/${t.id}/results`}
                        className="text-xs font-bold text-navy-mid hover:underline"
                      >
                        View results →
                      </Link>
```

- [ ] **Step 6: Run the build**

Run: `cd apps/organizer-web && npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 7: Run the full test suite**

Run: `cd apps/organizer-web && npm test`
Expected: all tests still pass — this task is a pure styling pass with no logic changes.

- [ ] **Step 8: Commit**

```bash
git add "apps/organizer-web/app/tournaments/page.tsx"
git commit -m "feat: polish Dashboard font sizes and colors for the new palette"
```

---

### Task 5: Push and verify CI + manual regression

**Files:** none (verification-only task).

- [ ] **Step 1: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 2: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 3: Manual regression**

No database migration is needed for this feature — it's a pure front-end styling change. On any page of the app:

- Confirm the header now shows a navy-toned gradient over the existing court photo (not green/teal), with the logo noticeably bigger (140px) and the wordmark still fully readable next to it.
- Confirm the bottom nav is navy-gradient, the "+" Create Tournament button is now orange (not cyan), and the Player Profile / Leaderboard icons look like the new badge/star-bars designs — and confirm the ACTIVE tab (when you're actually on `/people` or `/locations`) turns gold, while the inactive tab stays a light blue-white.
- Confirm all `<h1>`/`<h2>`/`<h3>` headings across a few different pages now render in the new heading font (Space Grotesk — noticeably different letterforms from the previous Poppins) — spot-check the Dashboard, a Tournament's Bracket page, and the Player Detail page.
- On the Dashboard specifically: confirm the "Upcoming Matches"/"Recently Completed" section headers and card titles are visibly larger than before, the non-overdue "days away" badge is the new orange, "Manage tournament →"/"View results →" links are navy (not teal), and a completed tournament's champion name shows in gold (not amber).
- Confirm buttons elsewhere in the app (e.g. "Save" on a score-entry form, "Shuffle Remaining Players" on the Teams page) now show the new orange/gold gradients instead of teal/lime.
- Confirm nothing crashed or looks broken on a few other pages not directly touched by this plan (Roster, Standings, Results) — they should pick up the new fonts/shared button styles automatically with no other visible regressions.

This is a good candidate for you to actually open the live app yourself and click through, since it's a purely visual change best judged by eye — let me know what still needs adjusting.
