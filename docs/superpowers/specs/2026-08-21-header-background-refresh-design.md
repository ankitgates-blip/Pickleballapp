# Header & Background Refresh — Design

Status: Approved.

## Goal

Enlarge the "PICKLERALLY DXB" title, fix the subtitle text, and give
the app's header and page background a richer, more cohesive visual
treatment — chosen from three mocked-up directions ("Richer Navy").

## Header (`apps/organizer-web/app/components/OrganizerShell.tsx`)

Keeps the existing navy gradient background family
(`navy-deep`/`navy-mid`/`navy-light`), the `header-bg.png` image
overlay, and the orange `.ball-texture` decorative circle — no
structural rework, no new image assets. Changes:

- **Title**: "PICKLERALLY DXB" renders noticeably bigger and bolder
  than today (current: `text-lg`, ~18px). A clear step up so it reads
  as the header's dominant element.
- **Subtitle text fix**: "Premier Dubai Pickle League App" →
  "Premier Dubai Pickleball League App" (the word "ball" was missing).
- **New: faint pickleball-dot pattern** behind the title/subtitle text
  block — a low-opacity scatter of small white dots, matching the
  approved mockup, adding texture without competing with the text for
  attention.
- **New: thin gold underline rule** between the title and subtitle,
  using the existing `--color-gold` token.
- Logo circle position, size, and border are unchanged. Sign-out
  button and bottom nav bar are unchanged.

## Page background (`apps/organizer-web/app/globals.css`)

The flat `#f8fafc` body background gets the same low-opacity dot
texture used in the header, applied globally via `body`'s
`background-image` — so the header no longer reads as a separate
banner glued onto a plain page. Texture must stay subtle: barely
perceptible at normal viewing distance, never competing with page
content or reducing text contrast/readability anywhere in the app.

## Out of scope

- No changes to the header's layout structure (logo position, sign-out
  button, bottom nav).
- No new image assets or npm dependencies — the dot pattern is a CSS
  `radial-gradient`, matching the existing `.ball-texture` technique
  already used in this codebase.
- No changes to any other page's own background styling (cards,
  panels, etc.) — this only touches the shared `body` background and
  the header component.
