# PDF Profile Labeled Rows — Design

Status: Approved.

## Goal

Reformat the player profile section of the PDF stats export ("Share
Stats") from a single joined summary line into labeled rows — one field
per line, `Label: Value`.

## Scope

PDF export only. The on-page profile summary line on `/people/[id]`
(`{profileSummary && <p>...}`) is unaffected — it stays a single joined
"Left-handed · Age 41 · ..." line exactly as it is today.

## PDF layout

The player's name stays as the existing bold heading line (no duplicate
"Name:" row). Directly below the "Last played / star rating" line, the
current single joined summary line is replaced with labeled rows, in this
order:

```
Handedness: <label>
Age: <number>
Playing Style: <label>
Paddle Brand: <label>
Signature Shot: <text>
Strengths: <label, label, ...>
```

Any field not set for that player is omitted entirely (no "Not set"
placeholder) — same omit-if-empty behavior as the current joined line.
Signature Shot was never wired into the PDF when it originally shipped;
this change adds it.

## Data flow

`SharePlayerStatsButtonProps` drops `profileSummary: string | null` (used
only for this component's own PDF rendering — removing it doesn't affect
the separate on-page JSX in `page.tsx`) and gains the individual
already-computed values instead:

- `handedness: string | null` — the resolved label (e.g. "Left-handed"),
  not the raw DB code
- `age: number | null`
- `playingStyle: string | null` — resolved label
- `paddleBrand: string | null` — resolved label
- `signatureShot: string | null`
- `strengths: string[]` — resolved labels

`page.tsx` already computes each of these label lookups as part of
building `profileSummaryParts` — this change extracts them into named
variables and passes them individually instead of (or alongside) the
joined string.

Inside `SharePlayerStatsButton`, the six values are filtered to only the
ones that are set, each printed as `${label}: ${value}` on its own line
(6mm line height), with no `ensureSpace()` check needed — the same as the
existing header block, since even all 6 rows plus the header comfortably
fit within the first page's top margin.

## Out of scope

- Changing the on-page profile summary display.
- Any other PDF section.
