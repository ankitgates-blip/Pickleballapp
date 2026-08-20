# Global Loading Indicator — Design

Status: Approved.

## Goal

Replace the blank screen the app currently shows during route
navigation and slow Server Action re-renders with a branded loading
state.

## Approach

A single new file: `apps/organizer-web/app/loading.tsx`. This is
Next.js's native App Router mechanism — a `loading.tsx` at the app root
automatically wraps every route in a React Suspense boundary, so it
displays during any route navigation and during Server Action-triggered
re-renders that take a noticeable moment (both go through the same RSC
streaming/Suspense pipeline). No new dependencies, no JavaScript state
management, no changes to any other file.

## Content

Full-screen navy gradient background, matching the existing header
gradient already used in `OrganizerShell` (the `navy-deep`/`navy-mid`/
`navy-light` tokens already defined in `globals.css`), with the app's own
`/logo.png` centered and gently pulsing via Tailwind's built-in
`animate-pulse` utility — no custom CSS animation needed.

## Scope

One file, applies app-wide — every organizer page and every public share
page (`/p/[id]`, `/t/[id]`), since all routes sit under this one root
boundary.

## Out of scope

- Per-page tailored skeleton loaders (a shape that mimics each specific
  page's layout instead of a generic full-screen loader). A real polish
  upgrade, but meaningfully more work than this one-file fix — can be
  revisited later if the generic version feels lacking.
