# Threat Level Badge — Design

Status: Approved.

## Goal

Show a compact "Threat Level" badge next to a player's name — derived
from their overall win rate — on the Player Detail page, the Leaderboard
(`/locations`) page, and the Roster and Teams pages of a tournament.

## Tiers

New pure module `apps/organizer-web/lib/stats/threatLevel.ts`, mirroring
the existing `starRating.ts` boundary-check pattern:

| Win % | Emoji | Label | Color |
|---|---|---|---|
| 0–20 | 🟢 | LOW THREAT | green |
| 21–40 | 🟡 | WATCH OUT | yellow |
| 41–60 | 🟠 | DANGEROUS | orange |
| 61–80 | 🔴 | HIGH THREAT | red |
| 81–100 | 💀 | DO NOT PLAY | purple |

`threatTierFor(winPercentage: number): { emoji, label, colorClass }`.
Boundaries checked top-down (`>= 81`, `>= 61`, `>= 41`, `>= 21`, else),
matching the table exactly.

## Win rate source

Overall win rate — the same number already computed for star ratings —
everywhere the badge appears, per the organizer's explicit choice (not
scoped per-page, e.g. not per-venue on the Leaderboard page).

New pure module `apps/organizer-web/lib/stats/winRate.ts`:

```typescript
export function winPercentageFromRecords(records: PersonMatchRecord[]): number | null {
  if (records.length === 0) return null;
  const wins = records.filter((r) => r.won).length;
  return Math.round((wins / records.length) * 100);
}
```

This is the exact formula already inlined in `personStats.ts`'s overall
`winPercentage` field — extracting it lets Roster/Teams (which don't
currently compute any win rate) reuse it via the existing
`buildPersonMatchRecords(personId, matches, teams)` without pulling in
the heavier `computePersonStats` (weekly/monthly trends, head-to-head,
etc. — none of which the badge needs).

## Shared badge component

New `apps/organizer-web/app/components/ThreatBadge.tsx`:

```tsx
type ThreatBadgeProps = { winPercentage: number | null };
```

Renders nothing (`null`) when `winPercentage` is `null` — a player with
no completed matches shows no badge, exactly matching how star ratings
are already omitted for such players. Otherwise renders a pill (reusing
the existing `pillClass` base style) showing `{emoji} {label}`, colored
per `threatTierFor`'s `colorClass`.

## Per-page wiring

**Player Detail page** (`people/[id]/page.tsx`): zero new queries — reuses
the already-computed `stats.winPercentage`. Badge placed next to the
name heading.

**Leaderboard** (`locations/page.tsx`): this page's existing
`entry.winPercentage` is venue-scoped (computed only from that venue's
matches), not the overall rate the badge needs. A new pass, computed once
before the JSX return (not per-venue), builds a
`Map<personId, number | null>` of every displayed person's *overall*
win rate from the page's already-fetched organizer-wide `matchesRaw` and
`teams` (reusing `buildPersonMatchRecords` + `winPercentageFromRecords`
per distinct person, the same building blocks as everywhere else — no
new Supabase queries, just an additional computation over data already
in memory). Badge placed next to each ranked player's name; the existing
venue-scoped `winPercentage` display text is untouched.

**Roster page** (`roster/page.tsx`): currently fetches only this
tournament's players/teams — no organizer-wide data. Adds: a query for
all of this organizer's tournament IDs, then their teams and complete
matches across all of them (the same query shape already used on the
Player Detail and Leaderboard pages), from which each roster player's
(via their `person_id`, already selected) overall win rate is computed.
Badge placed next to each name in the "Players (N)" list.

**Teams page** (`teams/page.tsx`): same new organizer-wide query pattern
as Roster. Additionally widens the existing `players` query to include
`person_id` (currently only selects `id, name`). The paired-teams list
currently renders `"{name} / {name}"` as one concatenated string — this
becomes two separate `<span>` elements, each with its own name + badge,
joined by a `/` separator. The unpaired-players list (already one pill
per player) gains a badge next to each name inside its existing pill.

## Out of scope

- The elaborate shield/skull "Threat Level" graphic from the reference
  image — that's reserved for a separate, later design pass covering the
  PDF export specifically.
- Any change to how win percentage itself is calculated — reuses the
  exact existing formula, just extracted into a reusable function.
