# Header & Background Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enlarge "PICKLERALLY DXB", fix the subtitle text, and add a
subtle matching dot texture to the header and the page background —
the "Richer Navy" direction approved via mockup.

**Architecture:** Two files change: a new `.header-dots` CSS class and
a body-level dot `background-image` in `globals.css`, and JSX/className
edits in `OrganizerShell.tsx` for the bigger title, the gold underline
rule, the fixed subtitle text, and the new dot-pattern overlay div.

**Tech Stack:** Tailwind CSS v4 (`@theme inline` custom properties),
plain CSS `radial-gradient` (same technique the existing `.ball-texture`
class already uses) — no new dependency, no new image asset.

## Global Constraints

- Title size: responsive (`text-2xl` on narrow viewports, `text-4xl`
  from the `sm:` breakpoint up) rather than one fixed size. This app's
  header uses a fixed `pl-[170px]` offset to clear the overlapping
  logo circle, and the logo's position is explicitly out of scope for
  this change — a single large fixed size risks the title overflowing
  or wrapping awkwardly on narrow phones. Responsive sizing keeps the
  "noticeably bigger" jump on wider screens safe on mobile too; on the
  very narrowest phones the title may wrap to two lines, which is an
  acceptable, non-broken fallback (the title's container already wraps
  normally — nothing forces it onto one line today).
- Subtitle text becomes exactly "Premier Dubai Pickleball League App".
- Logo position/size, sign-out button, and bottom nav bar: untouched.
- No new npm dependency, no new image asset.
- Dot texture opacity must stay subtle in both places — visible on
  close inspection, not a distraction, and never reducing text
  contrast/readability.

---

### Task 1: Header enlargement, subtitle fix, and dot texture

**Files:**
- Modify: `apps/organizer-web/app/components/OrganizerShell.tsx`
- Modify: `apps/organizer-web/app/globals.css`

**Interfaces:** None — this task has no functions or types other tasks
depend on; it's the only code task in this plan.

This is a purely presentational (CSS/JSX) change with no dedicated test
file, per this project's established convention for visual-only
components (e.g. `ThreatBadge.tsx` shipped without one). Correctness is
verified by the build passing and by manual regression in Task 2.

- [ ] **Step 1: Add the `.header-dots` class and the body dot texture**

In `apps/organizer-web/app/globals.css`, find:

```css
.ball-texture {
  background-image: radial-gradient(circle, rgba(0, 0, 0, 0.15) 2px, transparent 2px);
  background-size: 14px 14px;
}
```

Replace with:

```css
.ball-texture {
  background-image: radial-gradient(circle, rgba(0, 0, 0, 0.15) 2px, transparent 2px);
  background-size: 14px 14px;
}

.header-dots {
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.14) 1.5px, transparent 1.5px);
  background-size: 20px 20px;
}
```

Then find:

```css
body {
  background: var(--background);
  color: var(--foreground);
}
```

Replace with:

```css
body {
  background-color: var(--background);
  background-image: radial-gradient(circle, rgba(15, 23, 42, 0.05) 1px, transparent 1px);
  background-size: 18px 18px;
  color: var(--foreground);
}
```

- [ ] **Step 2: Add the dot-pattern overlay behind the header title**

In `apps/organizer-web/app/components/OrganizerShell.tsx`, find:

```tsx
          <div
            aria-hidden
            className="ball-texture absolute -top-6 -right-3 h-28 w-28 rounded-full opacity-90 shadow-lg"
            style={{ background: 'radial-gradient(circle at 35% 35%, #f2942e, #d2621c)' }}
          />
          {/* pl-[170px] clears the overlapping logo: left-[30px] + 140px width below */}
```

Replace with:

```tsx
          <div
            aria-hidden
            className="ball-texture absolute -top-6 -right-3 h-28 w-28 rounded-full opacity-90 shadow-lg"
            style={{ background: 'radial-gradient(circle at 35% 35%, #f2942e, #d2621c)' }}
          />
          <div aria-hidden className="header-dots absolute inset-0" />
          {/* pl-[170px] clears the overlapping logo: left-[30px] + 140px width below */}
```

- [ ] **Step 3: Enlarge the title, add the gold rule, fix the subtitle**

In the same file, find:

```tsx
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
```

Replace with:

```tsx
            <span
              className="font-brand text-2xl sm:text-4xl tracking-wide leading-tight"
              style={{ textShadow: '0 2px 8px rgba(0,0,0,0.45)' }}
            >
              PICKLERALLY DXB
            </span>
            <div className="w-12 h-[3px] bg-gold rounded-full mt-2 mb-2" />
            <span
              className="font-script italic text-lg text-[#c9a865]"
              style={{ textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
            >
              Premier Dubai Pickleball League App
            </span>
```

- [ ] **Step 4: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all 195 tests pass
(this task adds no new tests and touches no test-covered logic).

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/app/components/OrganizerShell.tsx apps/organizer-web/app/globals.css
git commit -m "feat: enlarge header title, fix subtitle text, add dot texture to header and page background"
```

---

### Task 2: Push, verify CI, manual regression

**Files:** none (verification-only task). No database migration is
needed — this task touches no schema.

- [ ] **Step 1: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 2: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 3: Manual regression**

- Open any page. Confirm "PICKLERALLY DXB" reads noticeably bigger
  than before, with a thin gold rule beneath it, and the subtitle now
  reads "Premier Dubai Pickleball League App".
- Confirm a faint dot texture is visible in the header behind the
  title, and a similarly faint dot texture on the page background
  behind the main content — subtle, not distracting.
- Check on a narrow phone-width viewport: confirm the bigger title
  doesn't overflow horizontally or get clipped — it should either fit
  on one line or wrap cleanly to two.
- Confirm the logo circle, sign-out button, and bottom nav bar all
  still look and behave exactly as before.
- Confirm normal page content (cards, text, buttons) is still fully
  readable — the new background texture shouldn't reduce contrast
  anywhere.

Clean up any disposable test data used for this check afterward.
