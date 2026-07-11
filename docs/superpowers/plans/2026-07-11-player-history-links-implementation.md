# Player History Links & Vertical Roster Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the horizontal player-name pill lists on the public tournament page and the organizer's Results page into vertical lists where each linked player's name opens a new public player-history page, publicly reachable by anyone with the link.

**Architecture:** One additive RLS policy change opens `people` rows to public SELECT (mirroring the existing public-read model already used by `tournaments`/`players`/`teams`/`matches`). A new public route `/p/[id]` mirrors the existing organizer-only `/people/[id]` page's exact data pipeline and content, just using the unauthenticated Supabase client. Two existing pages (`/t/[id]` and the Results page) get their `players` query widened to include `person_id` and their pill lists replaced with vertical, conditionally-linked lists.

**Tech Stack:** Same as prior work — Next.js (App Router, TypeScript), Supabase JS client, Supabase CLI (`npx`, no Docker) for the migration.

## Global Constraints

- The new public route is reachable by anyone with a person's direct link (unguessable UUID) — same trust model as the existing `/t/[id]` tournament links. It is not listable/browsable; the organizer-only `/people` list page is unaffected.
- The public player-history view shows the same content as the existing organizer `/people/[id]` page: This Month, Head-to-Head (toughest opponent / best partner), and full Match History — no reduced version.
- A player row is a link only when that player's `person_id` is set; when `null`, it renders as plain, non-clickable text in the same list.
- No change to the organizer's existing `/people` list or `/people/[id]` detail pages, and no change to team-pairing names inside standings/match tables on any page.
- Design reference: [docs/superpowers/specs/2026-07-11-player-history-links-design.md](../specs/2026-07-11-player-history-links-design.md).

---

### Task 1: Database migration — public SELECT policy on `people`

**Files:**
- Create: `supabase/migrations/<timestamp>_add_people_select_all_policy.sql`

**Interfaces:**
- Produces: public SELECT access to the `people` table (matching the existing `tournaments_select_all`-style policy naming convention) — consumed by Task 2's public page.

- [ ] **Step 1: Create the migration file**

```bash
cd "C:\Users\ANKS\pickleball project"
SUPABASE_ACCESS_TOKEN=<your token> npx supabase migration new add_people_select_all_policy
```

- [ ] **Step 2: Fill in the migration**

```sql
-- supabase/migrations/<timestamp>_add_people_select_all_policy.sql

create policy people_select_all on public.people for select using (true);
```

This is additive: it coexists with the existing `people_select_own` policy (Postgres OR's multiple SELECT policies together), so the organizer's own `/people` pages — which already scope with `.eq('organizer_id', organizer.id)` at the app layer — are completely unaffected. This mirrors the exact naming and shape of the pre-existing `tournaments_select_all` policy.

- [ ] **Step 3: Push the migration**

```bash
SUPABASE_ACCESS_TOKEN=<your token> npx supabase db push
```

Expected: confirms the migration applied, no errors.

- [ ] **Step 4: Verify in the Supabase dashboard**

Confirm `select polname from pg_policy where polrelid = 'public.people'::regclass;` now returns three policies: `people_insert_own`, `people_select_own`, `people_update_own`, and the new `people_select_all`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "Add public SELECT policy on people table"
```

---

### Task 2: Public player history page (`/p/[id]`)

**Files:**
- Create: `apps/organizer-web/app/p/[id]/page.tsx`

**Interfaces:**
- Consumes: `buildPersonMatchRecords(personId, matches, teams)` from `@/lib/stats/buildPersonMatchRecords`, `computePersonStats(matches, tournamentsWon)` from `@/lib/stats/personStats`, `computeStandings(matches)` from `@/lib/tournament/standings`, `RawMatch`/`RawTeam`/`TournamentWon` types from `@/lib/stats/types`, `MatchResult` from `@/lib/types` — all existing, unchanged.
- Produces: a public route at `/p/{personId}` — consumed by Task 3 and Task 4's link targets.

- [ ] **Step 1: Create the page**

```typescript jsx
// apps/organizer-web/app/p/[id]/page.tsx
import { createClient } from '@/lib/supabase/server';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { computePersonStats } from '@/lib/stats/personStats';
import { computeStandings } from '@/lib/tournament/standings';
import type { RawMatch, RawTeam, TournamentWon } from '@/lib/stats/types';
import type { MatchResult } from '@/lib/types';
import { cardClass } from '@/app/components/ui';

export default async function PublicPersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: person } = await supabase
    .from('people')
    .select('id, name, organizer_id')
    .eq('id', id)
    .single();

  if (!person) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Player not found.</p>
      </main>
    );
  }

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name, date')
    .eq('organizer_id', person.organizer_id);

  const tournamentIds = (tournaments ?? []).map((t) => t.id);
  const tournamentDateById = new Map((tournaments ?? []).map((t) => [t.id, t.date]));

  const { data: players } = tournamentIds.length
    ? await supabase
        .from('players')
        .select('id, tournament_id, person_id')
        .in('tournament_id', tournamentIds)
    : { data: [] };

  const { data: teamsRaw } = tournamentIds.length
    ? await supabase
        .from('teams')
        .select('id, tournament_id, player_1_id, player_2_id')
        .in('tournament_id', tournamentIds)
    : { data: [] };

  const { data: matchesRaw } = tournamentIds.length
    ? await supabase
        .from('matches')
        .select('tournament_id, team_a_id, team_b_id, score_a, score_b, status')
        .in('tournament_id', tournamentIds)
    : { data: [] };

  const personIdByPlayerId = new Map(
    (players ?? []).map((p) => [p.id, p.person_id as string | null])
  );
  const personNameById = new Map<string, string>();
  const { data: allPeople } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', person.organizer_id);
  for (const p of allPeople ?? []) {
    personNameById.set(p.id, p.name);
  }

  const teams: RawTeam[] = (teamsRaw ?? [])
    .map((t) => ({
      id: t.id,
      tournamentId: t.tournament_id,
      player1PersonId: personIdByPlayerId.get(t.player_1_id) ?? '',
      player2PersonId: personIdByPlayerId.get(t.player_2_id) ?? '',
    }))
    .filter((t) => t.player1PersonId && t.player2PersonId);

  const completeMatches: RawMatch[] = (matchesRaw ?? [])
    .filter((m) => m.team_b_id !== null && m.status === 'complete')
    .map((m) => ({
      tournamentId: m.tournament_id,
      tournamentDate: tournamentDateById.get(m.tournament_id) ?? '',
      teamAId: m.team_a_id!,
      teamBId: m.team_b_id!,
      scoreA: m.score_a ?? 0,
      scoreB: m.score_b ?? 0,
      status: 'complete' as const,
    }));

  const records = buildPersonMatchRecords(person.id, completeMatches, teams);

  const tournamentsWon: TournamentWon[] = [];
  for (const tournamentId of tournamentIds) {
    const tournamentTeams = teams.filter((t) => t.tournamentId === tournamentId);
    const myTeam = tournamentTeams.find(
      (t) => t.player1PersonId === person.id || t.player2PersonId === person.id
    );
    if (!myTeam) continue;

    const tournamentMatches: MatchResult[] = (matchesRaw ?? [])
      .filter((m) => m.tournament_id === tournamentId)
      .map((m) => ({
        teamAId: m.team_a_id!,
        teamBId: m.team_b_id,
        scoreA: m.score_a,
        scoreB: m.score_b,
        status: m.status as 'pending' | 'complete',
      }));

    const standings = computeStandings(tournamentMatches);
    if (standings.length > 0 && standings[0].teamId === myTeam.id) {
      tournamentsWon.push({
        tournamentId,
        date: tournamentDateById.get(tournamentId) ?? '',
      });
    }
  }

  const stats = computePersonStats(records, tournamentsWon);
  const nameFor = (personId: string) => personNameById.get(personId) ?? 'Unknown';

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const thisMonth = stats.monthly.find((m) => m.period === currentMonthKey) ?? {
    gamesWon: 0,
    gamesLost: 0,
    tournamentsWon: 0,
  };

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
          <h1 className="text-2xl font-extrabold tracking-tight">{person.name}</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">This Month</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-extrabold text-teal-700">{thisMonth.gamesWon}</div>
              <div className="text-xs text-slate-500">Games won</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-slate-500">{thisMonth.gamesLost}</div>
              <div className="text-xs text-slate-500">Games lost</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-amber-500">
                {thisMonth.tournamentsWon}
              </div>
              <div className="text-xs text-slate-500">Tournaments won</div>
            </div>
          </div>
        </div>

        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">Head-to-Head</h2>
          <p className="text-sm text-slate-700">
            <span className="font-semibold">Toughest opponent:</span>{' '}
            {stats.toughestOpponent
              ? `${nameFor(stats.toughestOpponent.personId)} (${stats.toughestOpponent.wins}-${stats.toughestOpponent.losses})`
              : 'Not enough matches yet'}
          </p>
          <p className="text-sm text-slate-700 mt-1">
            <span className="font-semibold">Best partner:</span>{' '}
            {stats.bestPartner
              ? `${nameFor(stats.bestPartner.personId)} (${stats.bestPartner.wins}-${stats.bestPartner.losses})`
              : 'Not enough matches yet'}
          </p>
        </div>

        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">
            Match History ({stats.matchHistory.length})
          </h2>
          <ul className="space-y-2 text-sm">
            {stats.matchHistory.map((m, i) => (
              <li
                key={i}
                className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0"
              >
                <span>
                  <span className="text-slate-400 mr-2">{m.tournamentDate}</span>
                  with <span className="font-semibold">{nameFor(m.partnerId)}</span> vs{' '}
                  <span className="font-semibold">
                    {nameFor(m.opponentIds[0])} / {nameFor(m.opponentIds[1])}
                  </span>
                </span>
                <span className={m.won ? 'font-bold text-teal-700' : 'font-bold text-slate-400'}>
                  {m.scoreFor}-{m.scoreAgainst}
                </span>
              </li>
            ))}
            {stats.matchHistory.length === 0 && (
              <li className="text-slate-400">No completed matches yet.</li>
            )}
          </ul>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no errors, and a new `/p/[id]` route appears in the build output.

- [ ] **Step 3: Manual verification via direct URL**

Find a `people` row's `id` for a person with completed match history (e.g. via the organizer's `/people` list, or a direct database query), then open `/p/{that-id}` in a fresh **incognito/private browser window** (no organizer session). Confirm the page loads without redirecting to `/login`, and shows the same This Month / Head-to-Head / Match History content the organizer sees on `/people/{id}`.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/p/[id]/page.tsx"
git commit -m "Add public player history page"
```

---

### Task 3: Public tournament page — vertical, linked roster

**Files:**
- Modify: `apps/organizer-web/app/t/[id]/page.tsx`

**Interfaces:**
- Consumes: the `/p/[id]` route from Task 2.

- [ ] **Step 1: Replace the page**

Replace the full contents of `apps/organizer-web/app/t/[id]/page.tsx` with:

```typescript jsx
// apps/organizer-web/app/t/[id]/page.tsx
import Link from 'next/link';
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
    .select('id, name, person_id')
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
          <ul className="space-y-2">
            {(players ?? []).map((p) =>
              p.person_id ? (
                <li key={p.id}>
                  <Link
                    href={`/p/${p.person_id}`}
                    className="block rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-100 transition-colors"
                  >
                    {p.name}
                  </Link>
                </li>
              ) : (
                <li
                  key={p.id}
                  className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600"
                >
                  {p.name}
                </li>
              )
            )}
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

Open the public link (`/t/<id>`) for a tournament with players already added, some linked to a person record and (if possible) one that isn't. Confirm the Players card now shows a vertical list instead of wrapped pills, that linked names are clickable and navigate to `/p/{person_id}` showing that player's history, and that an unlinked name (if any exists) renders as plain non-clickable text in the same list.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/t/[id]/page.tsx"
git commit -m "Make public tournament roster a vertical, linked player list"
```

---

### Task 4: Results page — Players card

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/results/page.tsx`

**Interfaces:**
- Consumes: the `/p/[id]` route from Task 2.

- [ ] **Step 1: Add the Link import and widen the players query**

In `apps/organizer-web/app/tournaments/[id]/results/page.tsx`, add the import:

```typescript
import Link from 'next/link';
```

Change the players query from:

```typescript
  const { data: players } = await supabase
    .from('players')
    .select('id, name')
    .eq('tournament_id', id);
```

to:

```typescript
  const { data: players } = await supabase
    .from('players')
    .select('id, name, person_id')
    .eq('tournament_id', id);
```

- [ ] **Step 2: Add the Players card**

Immediately after the champion-banner block (the `{championTeamId && (...)}` section) and before the standings-table card (`<div className={\`${cardClass} mb-6 overflow-x-auto\`}>`), add:

```typescript jsx
      <div className={`${cardClass} mb-6`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">
          Players ({(players ?? []).length})
        </h2>
        <ul className="space-y-2">
          {(players ?? []).map((p) =>
            p.person_id ? (
              <li key={p.id}>
                <Link
                  href={`/p/${p.person_id}`}
                  className="block rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-100 transition-colors"
                >
                  {p.name}
                </Link>
              </li>
            ) : (
              <li
                key={p.id}
                className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600"
              >
                {p.name}
              </li>
            )
          )}
        </ul>
      </div>
```

No other changes to this file — the champion banner, standings table, and per-stage match sections (which show team pairings, not this new list) are all unaffected.

- [ ] **Step 3: Verify the build compiles**

```bash
cd apps/organizer-web && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Manual verification in browser**

Open the Results page for a completed tournament. Confirm a new "Players" card appears (vertical list, same linking behavior as Task 3), and that the champion banner, standings table, and match sections below are all unchanged.

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/results/page.tsx"
git commit -m "Add linked Players list to the Results page"
```

---

### Task 5: Push and verify CI

**Files:** none (repo-level)

- [ ] **Step 1: Push to GitHub**

```bash
cd "C:\Users\ANKS\pickleball project"
git push
```

- [ ] **Step 2: Confirm CI passes**

Check the Actions tab on GitHub (or poll `https://api.github.com/repos/ankitgates-blip/Pickleballapp/actions/runs?per_page=1`) and confirm the latest run's `conclusion` is `success`.

- [ ] **Step 3: Full manual regression check**

In a private/incognito browser window (no organizer session), open a tournament's public link, click through to a linked player's history page, and confirm it loads with real stats and no login prompt. Separately, as the signed-in organizer, confirm the existing `/people` list and `/people/[id]` pages still work exactly as before, and that a completed tournament's Results page shows the new Players list alongside its existing champion banner and standings.
