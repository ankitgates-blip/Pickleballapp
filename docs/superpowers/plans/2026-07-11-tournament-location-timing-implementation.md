# Tournament Location & Timing Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require every tournament to specify a location and timeslot at creation, show both on the dashboard, and replace the "Your Tournaments" list with a two-section dashboard (Upcoming Matches / Recently Completed) that always accounts for every tournament.

**Architecture:** Two additive DB changes (a new venue row, a new `tournaments.timeslot` column) plus a small pure lookup module (`lib/tournament/timeslots.ts`, mirroring the existing `formats.ts` pattern). The rest is plumbing: the create form gains two required selects, and four existing pages (dashboard, create form's action, public view, results view) get their queries and displays updated to read and show the new fields.

**Tech Stack:** Same as prior work — Next.js (App Router, TypeScript), Supabase JS client, Supabase CLI (`npx`, no Docker) for the migration.

## Global Constraints

- Only two locations exist and are selectable: "Pickle Turf" (existing, unchanged name) and "Picklers" (new). No UI to add/edit/remove venues.
- Only three timeslots exist and are selectable: Morning (7–10 AM), Afternoon (12–3 PM), Evening (6–9 PM). No free-form time entry.
- Both Location and Timeslot are required fields on tournament creation — no default preselected in the create form (the organizer must explicitly choose).
- Existing tournaments (pre-migration) get `timeslot = 'evening'` via a column default — no manual backfill needed.
- "Your Tournaments" is removed entirely. Every tournament must appear in exactly one of two sections: Upcoming Matches (`date >= today`) or Recently Completed (`date < today`) — Recently Completed is keyed on date, not on `completed_at`, so a past tournament with unscored matches still shows up somewhere.
- No change to team/bracket/match/scoring logic — this feature is metadata (location, timeslot) plus dashboard restructuring and read-only display.
- Design reference: [docs/superpowers/specs/2026-07-11-tournament-location-timing-design.md](../specs/2026-07-11-tournament-location-timing-design.md).

---

### Task 1: Database migration — Picklers venue + tournaments.timeslot column

**Files:**
- Create: `supabase/migrations/<timestamp>_add_venue_and_timeslot.sql`

**Interfaces:**
- Produces: a `venues` row named `'Picklers'`; `tournaments.timeslot` column (`text not null default 'evening'`) — consumed by every later task.

- [ ] **Step 1: Create the migration file**

```bash
cd "C:\Users\ANKS\pickleball project"
SUPABASE_ACCESS_TOKEN=<your token> npx supabase migration new add_venue_and_timeslot
```

- [ ] **Step 2: Fill in the migration**

```sql
-- supabase/migrations/<timestamp>_add_venue_and_timeslot.sql

insert into public.venues (name) values ('Picklers');

alter table public.tournaments add column timeslot text not null default 'evening'
  check (timeslot in ('morning', 'afternoon', 'evening'));
```

(`venues.id` already has a `gen_random_uuid()` column default, so no `id` value is needed on the insert.)

- [ ] **Step 3: Push the migration**

```bash
SUPABASE_ACCESS_TOKEN=<your token> npx supabase db push
```

Expected: confirms the migration applied, no errors.

- [ ] **Step 4: Verify in the Supabase dashboard**

Confirm `select name from venues;` returns both `Pickle Turf` and `Picklers`, and `select timeslot from tournaments limit 1;` returns `evening` for existing rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "Add Picklers venue and tournaments.timeslot column"
```

---

### Task 2: Timeslot lookup module

**Files:**
- Create: `apps/organizer-web/lib/tournament/timeslots.ts`

**Interfaces:**
- Produces: `TIME_SLOTS` (array of `{ value, label }`), `Timeslot` type, `timeslotLabel(timeslot: string): string` — consumed by the create form (Task 3) and every display page (Tasks 4–6).

- [ ] **Step 1: Create the module**

```typescript
// apps/organizer-web/lib/tournament/timeslots.ts
export const TIME_SLOTS = [
  { value: 'morning', label: 'Morning (7–10 AM)' },
  { value: 'afternoon', label: 'Afternoon (12–3 PM)' },
  { value: 'evening', label: 'Evening (6–9 PM)' },
] as const;

export type Timeslot = (typeof TIME_SLOTS)[number]['value'];

export function timeslotLabel(timeslot: string): string {
  return TIME_SLOTS.find((t) => t.value === timeslot)?.label ?? timeslot;
}
```

This mirrors the existing `lib/tournament/formats.ts` (same shape: a `const` array, a derived type, a label lookup). Note that `formats.ts`'s `formatLabel` has no dedicated test file in this codebase — `timeslotLabel` follows the same precedent and doesn't need one either; it's verified by the build step below and by every page that renders it in later tasks.

- [ ] **Step 2: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/organizer-web/lib/tournament/timeslots.ts
git commit -m "Add timeslot lookup module"
```

---

### Task 3: Tournament creation form — Location + Timeslot fields

**Files:**
- Modify: `apps/organizer-web/app/tournaments/new/page.tsx`
- Modify: `apps/organizer-web/app/tournaments/new/actions.ts`

**Interfaces:**
- Consumes: `TIME_SLOTS` from `@/lib/tournament/timeslots` (Task 2).
- Produces: no new exports — `createTournament` now requires `venueId` and `timeslot` in the submitted form.

- [ ] **Step 1: Replace the page**

Replace the full contents of `apps/organizer-web/app/tournaments/new/page.tsx` with:

```typescript jsx
// apps/organizer-web/app/tournaments/new/page.tsx
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass, inputClass, accentButtonClass } from '@/app/components/ui';
import { TOURNAMENT_FORMATS } from '@/lib/tournament/formats';
import { TIME_SLOTS } from '@/lib/tournament/timeslots';
import { createTournament } from './actions';

export default async function NewTournamentPage() {
  const { supabase, organizer } = await requireOrganizer();

  const { data: venues } = await supabase.from('venues').select('id, name').order('name');

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">New Tournament</h1>
      <div className={cardClass}>
        <form action={createTournament} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Tournament name
            </label>
            <input name="name" type="text" placeholder="e.g. Saturday Round Robin" required className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Date</label>
            <input name="date" type="date" required className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Format</label>
            <select name="format" required defaultValue="round_robin" className={inputClass}>
              {TOURNAMENT_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Location</label>
            <select name="venueId" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Select a location
              </option>
              {(venues ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Timeslot</label>
            <select name="timeslot" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Select a timeslot
              </option>
              {TIME_SLOTS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Target score
              </label>
              <input name="targetScore" type="number" defaultValue={11} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Win by</label>
              <input name="winBy" type="number" defaultValue={2} required className={inputClass} />
            </div>
          </div>
          <button type="submit" className={`${accentButtonClass} w-full`}>
            Create Tournament
          </button>
        </form>
      </div>
    </OrganizerShell>
  );
}
```

- [ ] **Step 2: Replace the actions file**

Replace the full contents of `apps/organizer-web/app/tournaments/new/actions.ts` with:

```typescript
// apps/organizer-web/app/tournaments/new/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';

export async function createTournament(formData: FormData) {
  const { supabase, organizer } = await requireOrganizer();

  const name = formData.get('name') as string;
  const date = formData.get('date') as string;
  const targetScore = Number(formData.get('targetScore'));
  const winBy = Number(formData.get('winBy'));
  const format = formData.get('format') as string;
  const venueId = formData.get('venueId') as string;
  const timeslot = formData.get('timeslot') as string;

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .insert({
      name,
      date,
      target_score: targetScore,
      win_by: winBy,
      format,
      organizer_id: organizer.id,
      venue_id: venueId,
      timeslot,
    })
    .select('id')
    .single();

  if (error || !tournament) {
    throw new Error(error?.message ?? 'Failed to create tournament');
  }

  redirect(`/tournaments/${tournament.id}/roster`);
}
```

- [ ] **Step 3: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Manual verification in browser**

Go to "+ New Tournament". Confirm Location and Timeslot dropdowns appear (each defaulting to a disabled placeholder, not a real option), between Format and Target score. Confirm submitting without picking either is blocked by the browser's required-field validation. Create a tournament choosing "Picklers" and "Afternoon (12–3 PM)" — confirm it's created successfully and redirects to its roster page as before.

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/tournaments/new"
git commit -m "Add Location and Timeslot fields to tournament creation"
```

---

### Task 4: Dashboard restructuring — remove "Your Tournaments", widen sections

**Files:**
- Modify: `apps/organizer-web/app/tournaments/page.tsx`

**Interfaces:**
- Consumes: `timeslotLabel` from `@/lib/tournament/timeslots` (Task 2).

- [ ] **Step 1: Replace the page**

Replace the full contents of `apps/organizer-web/app/tournaments/page.tsx` with:

```typescript jsx
// apps/organizer-web/app/tournaments/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass, vibrantCardClass, accentButtonClass } from '@/app/components/ui';
import { timeslotLabel } from '@/lib/tournament/timeslots';

export default async function TournamentsPage() {
  const { supabase, organizer } = await requireOrganizer();

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name, date, timeslot, completed_at, venues(name)')
    .eq('organizer_id', organizer.id)
    .order('date', { ascending: false });

  const tournamentIds = (tournaments ?? []).map((t) => t.id);

  const { data: players } = tournamentIds.length
    ? await supabase.from('players').select('tournament_id').in('tournament_id', tournamentIds)
    : { data: [] };

  const playerCountByTournament = new Map<string, number>();
  for (const p of players ?? []) {
    playerCountByTournament.set(
      p.tournament_id,
      (playerCountByTournament.get(p.tournament_id) ?? 0) + 1
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = (tournaments ?? [])
    .filter((t) => new Date(`${t.date}T00:00:00`) >= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const recentlyCompleted = (tournaments ?? [])
    .filter((t) => new Date(`${t.date}T00:00:00`) < today)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const venueNameFor = (t: { venues: unknown }) => {
    const venue = t.venues as { name: string } | { name: string }[] | null;
    if (!venue) return 'Pickle Turf';
    return Array.isArray(venue) ? (venue[0]?.name ?? 'Pickle Turf') : venue.name;
  };

  return (
    <OrganizerShell organizerName={organizer.name}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Tournaments</h1>
        <Link href="/tournaments/new" className={accentButtonClass}>
          + New Tournament
        </Link>
      </div>

      {(tournaments ?? []).length === 0 && (
        <div className={`${cardClass} text-center text-slate-500`}>
          No tournaments yet — create your first one.
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-extrabold text-slate-900 mb-3 flex items-center gap-2">
            <span>🔥</span> Upcoming Matches
          </h2>
          <ul className="space-y-3">
            {upcoming.map((t) => {
              const playerCount = playerCountByTournament.get(t.id) ?? 0;
              const daysAway = Math.round(
                (new Date(`${t.date}T00:00:00`).getTime() - today.getTime()) / 86400000
              );
              return (
                <li key={t.id}>
                  <Link
                    href={`/t/${t.id}`}
                    className={`${vibrantCardClass} block hover:-translate-y-0.5 transition-transform`}
                  >
                    <span className="absolute top-0 right-0 bg-orange-500 text-white text-[10px] font-extrabold px-3 py-1 rounded-bl-xl rounded-tr-2xl tracking-wide">
                      {daysAway === 0 ? 'TODAY' : `${daysAway} DAY${daysAway === 1 ? '' : 'S'}`}
                    </span>
                    <div className="font-extrabold text-base text-slate-900 mb-1.5">
                      🏆 {t.name}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
                      <span>📍 {venueNameFor(t)}</span>
                      <span>🕐 {timeslotLabel(t.timeslot)}</span>
                      <span>👥 {playerCount} player{playerCount === 1 ? '' : 's'}</span>
                      <span>📅 {t.date}</span>
                    </div>
                    <div className="text-xs font-bold text-teal-700 mt-2">
                      View who&apos;s playing →
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {recentlyCompleted.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-extrabold text-slate-900 mb-3 flex items-center gap-2">
            <span>✅</span> Recently Completed
          </h2>
          <ul className="space-y-3">
            {recentlyCompleted.map((t) => {
              const playerCount = playerCountByTournament.get(t.id) ?? 0;
              return (
                <li key={t.id}>
                  <Link
                    href={`/tournaments/${t.id}/results`}
                    className={`${cardClass} block hover:border-teal-400 transition-colors`}
                  >
                    <div className="font-extrabold text-base text-slate-900 mb-1.5">
                      🏆 {t.name}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
                      <span>📍 {venueNameFor(t)}</span>
                      <span>🕐 {timeslotLabel(t.timeslot)}</span>
                      <span>👥 {playerCount} player{playerCount === 1 ? '' : 's'}</span>
                      <span>📅 {t.date}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </OrganizerShell>
  );
}
```

Note what changed from the previous version: the "Your Tournaments" heading, its plain tournament list, and the `(tournaments ?? []).length === 0` message's old position are gone — that empty-state message now sits at the top (right after the header), so a brand-new organizer with zero tournaments still sees a clear message instead of a blank page. The "+ New Tournament" button moved into the page's top header row. Both card-rendering blocks gained a `🕐 {timeslotLabel(t.timeslot)}` span. The `in14Days`/`sevenDaysAgo` window variables are gone — `upcoming` is now just `date >= today` and `recentlyCompleted` is just `date < today`, so the two filters are exact complements and every tournament appears in exactly one section.

- [ ] **Step 2: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Manual verification in browser**

Go to `/tournaments`. Confirm there is no "Your Tournaments" heading or plain list anywhere on the page. Confirm every tournament you can find (check a few dates/venues you know exist) appears under either Upcoming Matches or Recently Completed, and that both cards show a 🕐 timeslot alongside the 📍 venue. If you have (or create) a tournament dated in the past that was never fully scored, confirm it now appears under Recently Completed instead of disappearing.

- [ ] **Step 4: Commit**

```bash
git add apps/organizer-web/app/tournaments/page.tsx
git commit -m "Remove Your Tournaments list; widen Upcoming/Completed to cover every tournament"
```

---

### Task 5: Public page — Location, Timeslot, and Players roster

**Files:**
- Modify: `apps/organizer-web/app/t/[id]/page.tsx`

**Interfaces:**
- Consumes: `timeslotLabel` from `@/lib/tournament/timeslots` (Task 2).

- [ ] **Step 1: Replace the page**

Replace the full contents of `apps/organizer-web/app/t/[id]/page.tsx` with:

```typescript jsx
// apps/organizer-web/app/t/[id]/page.tsx
import { createClient } from '@/lib/supabase/server';
import { computeStandings } from '@/lib/tournament/standings';
import { timeslotLabel } from '@/lib/tournament/timeslots';
import type { MatchResult } from '@/lib/types';
import { cardClass } from '@/app/components/ui';

const STAGE_LABELS: Record<string, string> = {
  league: 'League',
  semifinal: 'Semifinal',
  final: 'Final',
};

export default async function PublicTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, date, format, timeslot, venues(name)')
    .eq('id', id)
    .single();

  if (!tournament) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Tournament not found.</p>
      </main>
    );
  }

  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', id);

  const { data: players } = await supabase
    .from('players')
    .select('id, name')
    .eq('tournament_id', id)
    .order('created_at', { ascending: true });

  const { data: matches } = await supabase
    .from('matches')
    .select('round, stage, team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', id)
    .order('round', { ascending: true });

  const playerById = new Map((players ?? []).map((p) => [p.id, p.name]));
  const teamById = new Map(
    (teams ?? []).map((t) => [
      t.id,
      `${playerById.get(t.player_1_id)} / ${playerById.get(t.player_2_id)}`,
    ])
  );

  const venue = tournament.venues as { name: string } | { name: string }[] | null;
  const venueName = Array.isArray(venue) ? (venue[0]?.name ?? 'Pickle Turf') : (venue?.name ?? 'Pickle Turf');

  const isLeaguePlayoffs = tournament.format === 'league_playoffs';
  const leagueMatches = (matches ?? []).filter((m) => m.stage === 'league');

  const matchResults: MatchResult[] = leagueMatches.map((m) => ({
    teamAId: m.team_a_id!,
    teamBId: m.team_b_id,
    scoreA: m.score_a,
    scoreB: m.score_b,
    status: m.status as 'pending' | 'complete',
  }));

  const standings = computeStandings(matchResults);
  const stages: Array<'league' | 'semifinal' | 'final'> = ['league', 'semifinal', 'final'];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="relative overflow-hidden bg-gradient-to-br from-emerald-800 via-teal-600 to-cyan-600 text-white">
        <div
          aria-hidden
          className="ball-texture absolute -top-8 -right-6 h-32 w-32 rounded-full opacity-90"
          style={{ background: 'radial-gradient(circle at 35% 35%, #eaff00, #c9e800)' }}
        />
        <div className="relative max-w-2xl mx-auto px-4 py-6 text-center">
          <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-lime-300 text-xl shadow-md -rotate-6">
            🏓
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">{tournament.name}</h1>
          <p className="text-teal-50 text-sm mt-1 font-medium">
            {tournament.date} · 📍 {venueName} · 🕐 {timeslotLabel(tournament.timeslot)}
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">
            Players ({(players ?? []).length})
          </h2>
          <ul className="flex flex-wrap gap-2">
            {(players ?? []).map((p) => (
              <li
                key={p.id}
                className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800"
              >
                {p.name}
              </li>
            ))}
          </ul>
        </div>

        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">
            {isLeaguePlayoffs ? 'League Standings' : 'Standings'}
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="pb-2 font-semibold">Team</th>
                <th className="pb-2 font-semibold text-center">W</th>
                <th className="pb-2 font-semibold text-center">L</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => {
                const medal = ['🥇', '🥈', '🥉'][i];
                return (
                  <tr key={s.teamId} className="border-b border-slate-100 last:border-0">
                    <td className={`py-2 ${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`}>
                      {medal && <span className="mr-1.5">{medal}</span>}
                      {teamById.get(s.teamId)}
                    </td>
                    <td className="py-2 text-center text-teal-700 font-extrabold">{s.wins}</td>
                    <td className="py-2 text-center text-slate-400 font-semibold">{s.losses}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {stages.map((stage) => {
          const stageMatches = (matches ?? []).filter((m) => m.stage === stage);
          if (stageMatches.length === 0) return null;

          return (
            <div key={stage} className={cardClass}>
              <h2 className="text-lg font-bold text-slate-900 mb-3">
                {isLeaguePlayoffs ? STAGE_LABELS[stage] : 'Schedule'}
              </h2>
              <ul className="space-y-2 text-sm">
                {stageMatches.map((m, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span>
                      {stage === 'league' && (
                        <span className="text-slate-400 mr-2">R{m.round}</span>
                      )}
                      <span className="font-semibold">{teamById.get(m.team_a_id!)}</span>
                      <span className="text-slate-400 mx-1">vs</span>
                      <span className="font-semibold">
                        {m.team_b_id ? teamById.get(m.team_b_id) : 'BYE'}
                      </span>
                    </span>
                    {m.status === 'complete' && (
                      <span className="font-bold text-teal-700">
                        {m.score_a}-{m.score_b}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Manual verification in browser**

Open the public link (`/t/<id>`) for a tournament with players already added. Confirm the header now shows `{date} · 📍 {venue} · 🕐 {timeslot}`, and a new "Players" card lists every registered player by name — including for a tournament where teams haven't been paired yet (bracket not generated), confirming the roster doesn't depend on team-pairing state.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/t/[id]/page.tsx"
git commit -m "Add Location, Timeslot, and Players roster to public tournament view"
```

---

### Task 6: Results page — Location and Timeslot

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/results/page.tsx`

**Interfaces:**
- Consumes: `timeslotLabel` from `@/lib/tournament/timeslots` (Task 2).

- [ ] **Step 1: Update the tournament query and header**

In `apps/organizer-web/app/tournaments/[id]/results/page.tsx`, add the import:

```typescript
import { timeslotLabel } from '@/lib/tournament/timeslots';
```

Change the tournament query from:

```typescript
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, date, format, completed_at')
    .eq('id', id)
    .eq('organizer_id', organizer.id)
    .single();
```

to:

```typescript
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, date, format, timeslot, completed_at, venues(name)')
    .eq('id', id)
    .eq('organizer_id', organizer.id)
    .single();
```

Immediately after the `if (!tournament) { ... }` block (before the `teams` query), add:

```typescript
  const venue = tournament.venues as { name: string } | { name: string }[] | null;
  const venueName = Array.isArray(venue) ? (venue[0]?.name ?? 'Pickle Turf') : (venue?.name ?? 'Pickle Turf');
```

Change the header paragraph from:

```typescript jsx
      <p className="text-sm text-slate-500 mb-6">
        {tournament.date} · {formatLabel(tournament.format)}
        {tournament.completed_at && (
          <> · Completed {new Date(tournament.completed_at).toLocaleDateString()}</>
        )}
      </p>
```

to:

```typescript jsx
      <p className="text-sm text-slate-500 mb-6">
        {tournament.date} · 📍 {venueName} · 🕐 {timeslotLabel(tournament.timeslot)} · {formatLabel(tournament.format)}
        {tournament.completed_at && (
          <> · Completed {new Date(tournament.completed_at).toLocaleDateString()}</>
        )}
      </p>
```

No other changes to this file — the champion banner, standings table, and stage sections are all unaffected.

- [ ] **Step 2: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Manual verification in browser**

Open the Results page for a completed tournament. Confirm the header line now reads `{date} · 📍 {venue} · 🕐 {timeslot} · {format}` (plus " · Completed {date}" if applicable), with everything else on the page unchanged.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/results/page.tsx"
git commit -m "Add Location and Timeslot to the Results page header"
```

---

### Task 7: Push and verify CI

**Files:** none (repo-level)

- [ ] **Step 1: Push to GitHub**

```bash
cd "C:\Users\ANKS\pickleball project"
git push
```

- [ ] **Step 2: Confirm CI passes**

Check the Actions tab on GitHub (or poll `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`) and confirm the latest run's `conclusion` is `success`.

- [ ] **Step 3: Full manual regression check**

Create a brand-new tournament choosing "Pickle Turf" and "Morning (7–10 AM)"; confirm it appears correctly under Upcoming Matches with both shown, click through to its public page and confirm the Players list matches the roster you add, then run it to completion (bracket → scores → auto-complete) and confirm it moves to Recently Completed with Location/Timeslot intact on both the card and the Results page header. Separately confirm an already-existing tournament (created before this feature) still displays correctly with its backfilled "Evening" timeslot.
