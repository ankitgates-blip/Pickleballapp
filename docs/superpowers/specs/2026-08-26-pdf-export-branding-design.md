# PDF Export Branding — Design

**Date:** 2026-08-26
**Status:** Approved for planning

## Problem

The app has three PDF-export buttons — "Share Roster", "Share Results", "Share Schedule" — each independently building a `jsPDF` document with an identical, bare-bones pattern: plain black `doc.text('PicklerAlly DXB', ...)` as the only branding, no logo image, no color, and a default black-and-white `jspdf-autotable` table. The organizer wants these to look like real branded documents, matching the app's own navy/gold visual identity, and the current three-way copy-pasted boilerplate is also worth consolidating while doing this.

## Scope decisions (resolved during brainstorming)

- **Which PDFs:** all three — Roster, Results, Schedule — get the same redesign.
- **Logo:** the real logo image (`public/logo.png`), embedded as an actual picture in the header, not styled text.
- **Skyline photo:** not used in the PDFs. The header is logo + navy gradient band + a per-document accent color line — no photograph.
- **Template consistency:** one shared structure (header, footer, table styling) across all three documents, but each gets its own accent color so the three document types are visually distinguishable: **Roster → gold** (`#a8874f`, the app's primary brand color), **Schedule → brand orange** (`#bf5919`, matches the app's "Create League" action color), **Results → teal** (`#0f766e`, echoes the public results page's own emerald/teal header treatment — appropriate since Results is the document most likely to be shared publicly).
- **Footer:** page numbers ("Page X of Y") plus the brand tagline ("Premier Dubai Pickleball League App") in gold, on every page.
- **Results gets one extra touch:** the champion's name renders in a highlighted colored box instead of plain text, since that's the one standout moment in that document.
- **`shareOrDownloadPdf`/`sanitizeFileNamePart`** (`lib/pdf/pdfShare.ts`) are unchanged — this feature only changes what gets drawn into the `jsPDF` document before it's handed to that existing share mechanism.

## Architecture

### New shared module: `lib/pdf/pdfBranding.ts`

A pure-drawing helper module, framework-agnostic beyond `jsPDF`'s API, consumed by all three button components:

```ts
export type PdfAccent = 'roster' | 'schedule' | 'results';

export const PDF_ACCENT_COLORS: Record<PdfAccent, string> = {
  roster: '#a8874f',
  schedule: '#bf5919',
  results: '#0f766e',
};

export function drawPdfHeader(
  doc: jsPDF,
  params: {
    accent: PdfAccent;
    title: string;
    subtitle: string;
    metaLine: string;
    logoDataUrl: string;
  }
): number; // returns the Y position to continue drawing content from

export function drawPdfFooter(doc: jsPDF): void; // stamps every existing page

export function pdfTableTheme(accent: PdfAccent): {
  headStyles: { fillColor: [number, number, number]; textColor: [number, number, number] };
  alternateRowStyles: { fillColor: [number, number, number] };
};
```

- `drawPdfHeader` draws: a navy gradient band (`#0c1830` → `#16294e`, matching the app header's own two navy tones — `jsPDF` doesn't support CSS gradients directly, so this is approximated as 2–3 stacked filled rectangles blending between the two navy tones) across the full page width; the logo image (via `doc.addImage`, circular-cropped look isn't achievable in a simple rect, so it's placed as a small square/rounded image in the band's left side); the title and subtitle text in white; the meta line (date · venue · timeslot · format) in a lighter gray-blue; and a 2mm-tall accent-colored bar as the band's bottom edge, using the color from `PDF_ACCENT_COLORS[accent]`. Returns the Y coordinate immediately below the band so callers know where to start their own content (tables, etc.).
- `drawPdfFooter` loops `doc.getNumberOfPages()`, and on each page prints "Page {i} of {n}" (bottom-right) and the tagline (bottom-left) in small gold text. Called once, after all page content has been added (page count must be final first).
- `pdfTableTheme(accent)` returns the accent color converted to an RGB triple for `headStyles.fillColor`/`textColor`, plus a very light tint of the same accent (mixed ~92% toward white) for `alternateRowStyles.fillColor`, so `autoTable`'s zebra striping reads as "on brand" instead of the default gray.

### Logo image loading

New helper, colocated in the same module:

```ts
export async function loadImageAsDataUrl(url: string): Promise<string>;
```

Implementation: `fetch(url)` → `blob()` → `FileReader.readAsDataURL`. Called once per button click (not cached across calls — logo.png is a small, browser-cached static asset, so repeat fetches are cheap and this avoids any module-level mutable state). Each button's `handleClick` awaits this before calling `drawPdfHeader`, alongside its existing dynamic `import('jspdf')`/`import('jspdf-autotable')` calls.

### Button changes

All three buttons (`ShareRosterButton.tsx`, `ShareResultsButton.tsx`, `ShareScheduleButton.tsx`) get the same shape of change: replace their current ~10 lines of manual `doc.text(...)` header-building with one `loadImageAsDataUrl('/logo.png')` call feeding into one `drawPdfHeader(...)` call, replace their bare `autoTable(doc, { startY, head, body })` calls with the same call plus `...pdfTableTheme('roster' | 'schedule' | 'results')` spread into the options object, and add one `drawPdfFooter(doc)` call immediately before `doc.output('blob')`. The rest of each button (data shaping, `shareOrDownloadPdf` call, button UI/status states) is unchanged.

Results additionally wraps its existing `Champion: {name}` line in a small filled rounded rectangle (teal-tinted background, white bold text) instead of plain `doc.text`.

## Testing

- `pdfBranding.ts`'s color/theme helpers (`PDF_ACCENT_COLORS`, `pdfTableTheme`) are pure functions and get real Vitest coverage — but `drawPdfHeader`/`drawPdfFooter`/`loadImageAsDataUrl` take a live `jsPDF` instance or call `fetch`/`FileReader`, which aren't meaningfully unit-testable without a browser environment; per this codebase's existing precedent (`lib/tournament/pdfSmoke.test.ts` already exists as a "does this run without throwing" smoke test, not a pixel-level check), a smoke test that constructs a real `jsPDF` doc, calls each drawing function, and asserts no exception is thrown plus a few sanity checks (returned Y is a positive number greater than the input, `doc.getNumberOfPages()` unchanged by the footer call) is the right level of coverage here.
- The three button components remain untested directly, per this codebase's established convention for client components — verified via `npm run build` + `npm test` (regression) + manual check: click each of the three Share buttons in the running app, open the resulting PDF, confirm the navy header band, real logo image, correct accent color per document, styled table, footer page numbers/tagline, and (for Results) the highlighted champion box.

## Out of scope

- The skyline photo does not appear in any PDF.
- No new npm dependencies — `jsPDF`'s built-in `addImage`/rect-drawing API and the already-installed `jspdf-autotable` cover everything here.
- No change to `shareOrDownloadPdf`, `sanitizeFileNamePart`, or how/where the generated PDF is shared — this is purely about what gets drawn into the document.
- No admin/settings UI to customize colors or branding — the three accent colors are fixed constants.
