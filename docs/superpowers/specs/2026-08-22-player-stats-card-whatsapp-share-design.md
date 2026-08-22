# Player Stats Card — Share via WhatsApp

Status: Approved.

## Goal

Let the Player Stats Card be shared directly to WhatsApp (or any other
installed app) via the device's native share sheet, instead of only
ever forcing a download. The shared file stays a PNG image — this does
not change the card into a PDF.

## Mechanism

This app already has a proven "share-or-download" pattern, used by 4
existing Share buttons (Roster, Results, Schedule, Player Stats PDF):
try `navigator.share()` with the generated file first (opens the OS's
native share sheet — WhatsApp, Messages, email, etc., whatever's
installed), and fall back to a plain forced download if the browser or
device doesn't support file sharing (mostly desktop browsers).

That logic currently lives in `shareOrDownloadPdf()`
(`lib/pdf/pdfShare.ts`), hardcoded to build a `File` with
`type: 'application/pdf'`. It generalizes to a `shareOrDownloadFile()`
that takes the MIME type as a parameter; `shareOrDownloadPdf()` becomes
a thin wrapper around it (`mimeType: 'application/pdf'`) so none of the
4 existing PDF Share buttons need to change.

`PlayerStatsCard.tsx`'s `handleDownload` (already producing a PNG
`Blob` via `canvas.toBlob(..., 'image/png')`) swaps its current
"always force a download" ending for a call to
`shareOrDownloadFile(blob, fileName, playerName, 'image/png')`.

## UI

No new button — the card itself is already the single clickable
element. Only its click behavior changes: share-first instead of
download-only. The caption below the card updates from "Click the card
to download it as an image" to "Click the card to share or download it
as an image."

## Out of scope

- No change to the 4 existing PDF Share buttons' behavior or file
  format.
- No change to what the card looks like or what data it shows.
- No new dependency — `navigator.share`/`navigator.canShare` are
  standard Web APIs already used elsewhere in this codebase.
