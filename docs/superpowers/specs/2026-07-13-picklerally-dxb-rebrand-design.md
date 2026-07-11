# PicklerAlly DXB Rebrand — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Replace the app's placeholder name "Pickle Turf Organizer" with the real
brand name "PICKLERALLY DXB", and replace the 🏓 emoji placeholder badge
with the actual PicklerAlly DXB logo image everywhere it appears.

## Scope decisions (resolved via brainstorming, 2026-07-13)

- **Logo asset**: cropped from a user-provided marketing image down to
  just the circular medallion, saved at
  `apps/organizer-web/public/logo.png` (480×495px, already done as part
  of this brainstorming session — not a new implementation step).
- **Text replacement**: exactly two locations currently show "Pickle Turf
  Organizer" as the app's brand name — the nav header
  (`apps/organizer-web/app/components/OrganizerShell.tsx`) and the login
  page hero (`apps/organizer-web/app/login/page.tsx`). Both become
  "PICKLERALLY DXB" (matching the logo's own all-caps styling).
  **Important distinction**: "Pickle Turf" alone (no "Organizer" suffix)
  is a real venue name stored in the `venues` table and displayed
  throughout the app (dashboard cards, results pages, etc. via
  `venueNameFor()`/`t.venues.name`) — this is unrelated data, not app
  branding, and must NOT be touched anywhere.
- **Logo integration**: the same visual pattern — a small badge containing
  the 🏓 emoji — appears in four places. All four get the real logo
  image instead, via Next.js's `<Image>` component:
  1. Nav header (`OrganizerShell.tsx`), small, `h-9 w-9`
  2. Login page hero (`login/page.tsx`), large, `h-16 w-16`
  3. Public player page header (`app/p/[id]/page.tsx`), `h-10 w-10`
  4. Public tournament page header (`app/t/[id]/page.tsx`), `h-10 w-10`

  In all four, the current markup wraps the emoji in a lime-colored
  square (`bg-lime-300`, rounded, `-rotate-6`) — that wrapper is dropped
  since the logo image already has its own circular border/background
  baked in. The image renders directly at the target size with
  `rounded-full` so any square corners left over from the crop are
  clipped to a circle.
- **Metadata**: `apps/organizer-web/app/layout.tsx`'s `title` becomes
  "PICKLERALLY DXB"; `description` becomes "Run pickleball tournaments in
  Dubai" (removing the stale single-venue reference).

## Out of scope

- The favicon (`apps/organizer-web/app/favicon.ico`) is left as Next.js's
  default — not requested, and would need a separate multi-size `.ico`
  export from the logo. Flagged as a possible follow-up, not built here.
- No change to the "Pickle Turf" / "Picklers" venue names themselves, or
  anywhere they're displayed as location data (dashboard cards, results
  pages, player location stats, the Locations leaderboard page).
- No change to the login page's tagline ("Run your tournaments, not a
  spreadsheet.") — not part of the brand name/logo change.

## Implementation

### 1. Nav header — `apps/organizer-web/app/components/OrganizerShell.tsx`

Add the import:

```typescript
import Image from 'next/image';
```

Replace:

```tsx
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime-300 text-lg shadow-md -rotate-6">
                🏓
              </span>
              <span className="font-heading font-extrabold text-lg tracking-tight leading-none">
                Pickle Turf Organizer
              </span>
```

with:

```tsx
              <Image src="/logo.png" alt="PicklerAlly DXB" width={36} height={36} className="rounded-full" />
              <span className="font-heading font-extrabold text-lg tracking-tight leading-none">
                PICKLERALLY DXB
              </span>
```

### 2. Login page hero — `apps/organizer-web/app/login/page.tsx`

Add the import:

```typescript
import Image from 'next/image';
```

Replace:

```tsx
          <div className="mx-auto mb-3 h-16 w-16 rounded-2xl bg-lime-300 flex items-center justify-center text-3xl shadow-lg -rotate-6">
            🏓
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Pickle Turf Organizer</h1>
```

with:

```tsx
          <Image src="/logo.png" alt="PicklerAlly DXB" width={64} height={64} className="mx-auto mb-3 rounded-full" />
          <h1 className="text-3xl font-extrabold tracking-tight">PICKLERALLY DXB</h1>
```

### 3. Public player page header — `apps/organizer-web/app/p/[id]/page.tsx`

Add the import:

```typescript
import Image from 'next/image';
```

Replace:

```tsx
          <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-lime-300 text-xl shadow-md -rotate-6">
            🏓
          </span>
```

with:

```tsx
          <Image src="/logo.png" alt="PicklerAlly DXB" width={40} height={40} className="mx-auto mb-2 rounded-full" />
```

### 4. Public tournament page header — `apps/organizer-web/app/t/[id]/page.tsx`

Add the import:

```typescript
import Image from 'next/image';
```

Replace:

```tsx
          <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-lime-300 text-xl shadow-md -rotate-6">
            🏓
          </span>
```

with:

```tsx
          <Image src="/logo.png" alt="PicklerAlly DXB" width={40} height={40} className="mx-auto mb-2 rounded-full" />
```

### 5. Metadata — `apps/organizer-web/app/layout.tsx`

Replace:

```typescript
export const metadata: Metadata = {
  title: "Pickleball Organizer",
  description: "Run pickleball tournaments at Pickle Turf",
};
```

with:

```typescript
export const metadata: Metadata = {
  title: "PICKLERALLY DXB",
  description: "Run pickleball tournaments in Dubai",
};
```
