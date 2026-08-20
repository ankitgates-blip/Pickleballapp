# Global Loading Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blank screen shown during route navigation and slow Server Action re-renders with a branded, full-screen loading state.

**Architecture:** One new file, `apps/organizer-web/app/loading.tsx`, using Next.js App Router's native `loading.tsx` convention — placing it at the app root automatically wraps every route in a Suspense boundary with no other code changes required.

**Tech Stack:** Next.js App Router, Tailwind CSS.

## Global Constraints

- Single file, no new dependencies, no client-side JavaScript state.
- Applies app-wide (every organizer page and every public share page) since all routes sit under this one root boundary.
- Background: the same navy gradient tokens (`navy-deep`/`navy-mid`/`navy-light`) already defined in `globals.css` and used elsewhere in the app (e.g. `OrganizerShell`'s header).
- Logo: the app's existing `/logo.png`, centered, pulsing via Tailwind's built-in `animate-pulse` utility — no custom CSS animation.
- Uses `next/image` for the logo (the local-asset convention already established elsewhere in this codebase, e.g. `apps/organizer-web/app/p/[id]/page.tsx`), not a plain `<img>` (that's reserved for external URLs like Supabase Storage photos, per `PersonAvatar`'s established pattern).

---

### Task 1: Create the loading state

**Files:**
- Create: `apps/organizer-web/app/loading.tsx`

- [ ] **Step 1: Create the file**

Create `apps/organizer-web/app/loading.tsx`:

```tsx
import Image from 'next/image';

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy-deep via-navy-mid to-navy-light">
      <Image
        src="/logo.png"
        alt="PicklerAlly DXB"
        width={100}
        height={100}
        className="rounded-full animate-pulse"
        priority
      />
    </div>
  );
}
```

`priority` is set because `next/image` lazy-loads by default — for a
loading-state image that must appear immediately (not after its own
delay), `priority` skips that lazy-load behavior.

- [ ] **Step 2: Run the build and full test suite**

Run: `cd apps/organizer-web && npm run build && npm test`
Expected: build succeeds with no TypeScript or ESLint errors; all 156
tests still pass (this task adds no pure-function logic to test).

- [ ] **Step 3: Commit**

```bash
git add apps/organizer-web/app/loading.tsx
git commit -m "feat: add global loading indicator"
```

---

### Task 2: Push, verify CI, verify in the browser

**Files:** none (verification-only task). No database migration is
needed — this task touches no schema.

- [ ] **Step 1: Push to `origin/main`**

```bash
git push origin main
```

- [ ] **Step 2: Poll GitHub Actions until the run for the pushed commit completes**

Check: `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`
Expected: `"conclusion": "success"` for the pushed commit.

- [ ] **Step 3: Verify directly**

Unlike most other features this session, this one is directly verifiable
without needing the organizer to check manually behind Google OAuth — the
public share pages (`/p/[id]`, `/t/[id]`) require no login and sit under
the same root `loading.tsx` boundary as every organizer page. Using a
real `/p/[id]` URL for an existing player (or `/t/[id]` for an existing
tournament) in a browser:

- Throttle the network (e.g. browser devtools "Slow 3G") and navigate to
  the page fresh — confirm the pulsing-logo-on-navy-gradient loading
  state appears before the real content renders, instead of a blank
  screen.
- Confirm the loading state's background/logo render correctly (no
  broken image, no layout shift once real content swaps in).

If a live regression environment isn't reachable for this check, confirm
at minimum that the built output includes the new route's loading
boundary (`npm run build`'s route listing, or manual code inspection),
and note that the throttled-network check should be done by the user at
their convenience since it requires no authentication.
