# Tournament Creation Form Conditional Rounds Field — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Fix the tournament creation form so it shows only the "Number of
rounds" field for the format currently selected in the dropdown,
instead of showing all four round-count fields (Popcorn, Gauntlet,
Claim the Throne, Up and Down the River) at once regardless of which
format is selected.

## Scope

Applies only to `apps/organizer-web/app/tournaments/new/page.tsx`. No
other page's round-count field is affected — League + Playoffs'
round-count field already lives on the Bracket page (added in the
"League + Playoffs Configurable Round Count" feature) and is already
gated on that format being selected there; this spec doesn't touch it.

## Approach

Extract the Format `<select>` and the four round-count `<input>`
blocks out of the server-rendered form into a new Client Component,
`apps/organizer-web/app/tournaments/new/FormatFields.tsx`
(`'use client'`), rendered in the same position inside the existing
`<form action={createTournament}>` in `new/page.tsx`. Everything else
on the page — the venues fetch, the name/date/venue/timeslot/target
score/win by fields, and the submit button — stays exactly as it is
today, in the server component.

`FormatFields` holds a `useState<string>` for the selected format,
initialized to `'round_robin'` (matching today's `<select>`'s
`defaultValue`) and updated on the select's `onChange`. Below the
select, it conditionally renders exactly one round-count input based
on the current state:

- `format === 'popcorn'` → the `popcornRounds` input
- `format === 'gauntlet'` → the `gauntletRounds` input
- `format === 'claim_the_throne'` → the `claimTheThroneRounds` input
- `format === 'up_and_down_the_river'` → the `upAndDownRiverRounds`
  input
- Any other format (`round_robin`, `league_playoffs`, `double_header`,
  `cream_of_the_crop`) → nothing rendered in that space at all, not
  even a placeholder message

The `<select>`'s `name="format"` and each input's own `name` attribute
are preserved exactly as they are today, so the browser's native form
submission collects them into `FormData` identically regardless of
which component rendered them — a Client Component nested inside a
Server Component's `<form>` works this way natively, no extra wiring
needed.

## What doesn't change

- `createTournament` (`apps/organizer-web/app/tournaments/new/actions.ts`)
  needs zero changes. It already reads only the one round-count field
  matching the submitted `format` value and discards the rest
  (`format === 'popcorn' ? Number(formData.get('popcornRounds')) : null`,
  and the same pattern for the other three). Removing the other three
  inputs from the DOM entirely — rather than hiding them with CSS while
  leaving them in the DOM — means their values are never submitted in
  the first place, which is strictly simpler than hiding-but-still-
  submitting and behaves identically from the server action's point of
  view.
- `TOURNAMENT_FORMATS` (`lib/tournament/formats.ts`) — the dropdown's
  option list — is untouched.
- The League + Playoffs round-count field on the Bracket page is
  untouched (out of scope, already format-gated).

## Out of scope

- Any other field or page.
- Client-side validation beyond what the four inputs already have
  (`min={1}`, `type="number"`).
