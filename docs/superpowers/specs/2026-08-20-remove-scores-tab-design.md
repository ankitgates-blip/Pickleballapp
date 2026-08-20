# Remove Scores Tab — Design

Status: Approved.

## Goal

Remove the "Scores" tab/page since scores are already entered directly
from the Bracket tab's per-match inline forms — the separate page is
redundant.

## Changes

**Remove:**
- The `{ key: 'matches', label: 'Scores' }` entry from
  `apps/organizer-web/app/components/TournamentNav.tsx`'s `steps` array.
- `apps/organizer-web/app/tournaments/[id]/matches/page.tsx` (the page
  itself).
- The "Enter scores →" link on the Bracket page
  (`apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`), which
  pointed at the page being removed.

**Keep:**
- `apps/organizer-web/app/tournaments/[id]/matches/actions.ts` — the
  `enterScore` server action lives here and is shared: the Bracket
  page's own per-match score forms already call it directly
  (`import { enterScore } from '../matches/actions';`). Only the page
  disappears, not the action module. A folder containing only an
  `actions.ts` with no sibling `page.tsx` is a normal, unremarkable
  pattern in this codebase's App Router structure.

**Cleanup:**
- The two `revalidatePath(`/tournaments/${tournamentId}/matches`)` calls
  (one in `enterScore` itself, two more in
  `unlockTournamentResults`/`lockTournamentResults` in
  `bracket/actions.ts`) are removed, since that route will no longer
  exist. `revalidatePath` on a nonexistent route isn't an error in
  Next.js, but leaving it is pointless dead code now that the route is
  intentionally gone.

## Out of scope

- Any change to score-entry itself (`enterScore`, the Bracket page's
  score forms) — unaffected, still fully functional.
- Any change to the round-by-round navigation work that's still pending
  from an earlier request — unrelated to this change.
