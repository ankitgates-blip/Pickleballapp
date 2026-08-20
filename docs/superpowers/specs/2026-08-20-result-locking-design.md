# Result Locking — Design

Status: Approved.

## Goal

While a tournament is in progress, scores should stay freely editable but
team reassignment should be unavailable (a roster change belongs in
Regenerate All Rounds, not ad-hoc match-by-match edits). Once a
tournament is fully complete, everything should lock by default, with an
explicit "Unlock Editing" option for post-completion corrections.

## Scope

Applies to every tournament format — there's already a shared
`isTournamentComplete()` helper (`lib/tournament/completion.ts`) that
works across all 8 formats, and today's team-reassignment ("Save Teams")
UI already shows on every match regardless of format, so this keeps
behavior consistent app-wide.

## Data model

New nullable `tournaments.results_unlocked_at timestamptz` column,
alongside the existing `tournaments.completed_at` (already set
automatically by `enterScore` once a tournament becomes complete — see
`apps/organizer-web/app/tournaments/[id]/matches/actions.ts:81-91`).

```sql
alter table public.tournaments add column results_unlocked_at timestamptz;
```

## Pure helpers

New functions in `apps/organizer-web/lib/tournament/completion.ts`,
alongside the existing `isTournamentComplete`:

```typescript
export function canEditScore(
  completedAt: string | null,
  resultsUnlockedAt: string | null
): boolean {
  return completedAt === null || resultsUnlockedAt !== null;
}

export function canEditTeams(
  completedAt: string | null,
  resultsUnlockedAt: string | null
): boolean {
  return completedAt !== null && resultsUnlockedAt !== null;
}
```

`canEditScore`: editable while the tournament isn't complete yet, OR it's
complete but has been explicitly unlocked. `canEditTeams`: only editable
once complete AND unlocked — team reassignment is never available while
a tournament is still in progress, regardless of unlock state (there's
nothing to unlock pre-completion).

## Server actions

`apps/organizer-web/app/tournaments/[id]/matches/actions.ts`'s
`enterScore` and `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`'s
`updateMatchTeams` both query the tournament's `completed_at` and
`results_unlocked_at` before making any change, and throw a clear error
(`'Scores are locked — unlock editing first to make a change.'` /
`'Team changes are only allowed once the tournament is complete and
editing is unlocked.'`) if the corresponding helper returns `false`. This
is the authoritative check — the UI additionally hides these controls
(see below), but the action itself never trusts the UI alone.

Two new actions in `bracket/actions.ts`:

```typescript
export async function unlockTournamentResults(tournamentId: string) {
  // Guard: throws if tournaments.completed_at is null (nothing to unlock
  // before the tournament is complete). Otherwise sets
  // results_unlocked_at = now().
}

export async function lockTournamentResults(tournamentId: string) {
  // Sets results_unlocked_at = null.
}
```

## UI — Bracket page and Matches page

Both pages widen their tournament query to include `completed_at` and
`results_unlocked_at`, and compute `canEditScore`/`canEditTeams` via the
new helpers.

- **Score entry:** when `canEditScore` is true, the existing editable
  form renders unchanged. When false, it's replaced with plain read-only
  text: `Final: {score_a}-{score_b}`.
- **Team reassignment:** the "Save Teams" sub-form (currently always
  rendered inside each match's `<details>` on the Bracket page) is only
  rendered when `canEditTeams` is true; otherwise omitted entirely — not
  shown, not disabled, just absent.
- **Unlock/Lock toggle:** a new button on the Bracket page, shown only
  when `tournament.completed_at` is set. Reads "🔓 Unlock Editing" when
  `results_unlocked_at` is null (calls `unlockTournamentResults`), or
  "🔒 Lock Editing" when it's set (calls `lockTournamentResults`).

## Out of scope

- Any change to `Regenerate All Rounds` — it already refuses once
  Semifinal/Final matches exist, which happens well before a League +
  Playoffs tournament could ever be marked complete, so it's already
  unreachable in the locked state without any new guard.
- Any change to how/when `tournaments.completed_at` itself gets set —
  untouched, still automatic via `enterScore`'s existing
  `isTournamentComplete()` check.
