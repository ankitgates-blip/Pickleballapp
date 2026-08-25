// apps/organizer-web/app/t/[id]/page.tsx
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import { computeStandings } from '@/lib/tournament/standings';
import { timeslotLabel } from '@/lib/tournament/timeslots';
import { isRosterFull, slotsRemaining } from '@/lib/tournament/capacity';
import { isLadderFormat } from '@/lib/tournament/formats';
import { courtLabel } from '@/lib/tournament/courts';
import JoinLeagueForm from './JoinLeagueForm';
import LeagueRsvpList from './LeagueRsvpList';
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
    .select('name, date, format, timeslot, max_players, completed_at, organizer_id, venues(name)')
    .eq('id', id)
    .single();

  if (!tournament) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">League not found.</p>
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
    .select('round, stage, team_a_id, team_b_id, score_a, score_b, status, court')
    .eq('tournament_id', id)
    .order('round', { ascending: true })
    .order('created_at', { ascending: true });

  const playerById = new Map((players ?? []).map((p) => [p.id, p.name]));
  const teamById = new Map(
    (teams ?? []).map((t) => [
      t.id,
      `${playerById.get(t.player_1_id)} / ${playerById.get(t.player_2_id)}`,
    ])
  );

  const venue = tournament.venues as { name: string } | { name: string }[] | null;
  const venueName = Array.isArray(venue) ? (venue[0]?.name ?? 'Pickleturf') : (venue?.name ?? 'Pickleturf');

  const isLeaguePlayoffs = tournament.format === 'league_playoffs';
  const isLadder = isLadderFormat(tournament.format);
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

  const playerCount = (players ?? []).length;
  const rosterFull = isRosterFull(tournament.max_players, playerCount);
  const remaining = slotsRemaining(tournament.max_players, playerCount);

  const confirmedPersonIds = new Set(
    (players ?? [])
      .filter((p): p is typeof p & { person_id: string } => p.person_id !== null)
      .map((p) => p.person_id)
  );
  const isRsvpLocked = isLeaguePlayoffs && new Date(`${tournament.date}T17:00:00+04:00`) <= new Date();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="relative overflow-hidden bg-gradient-to-br from-emerald-800 via-teal-600 to-cyan-600 text-white">
        <div
          aria-hidden
          className="ball-texture absolute -top-8 -right-6 h-32 w-32 rounded-full opacity-90"
          style={{ background: 'radial-gradient(circle at 35% 35%, #eaff00, #c9e800)' }}
        />
        <div className="relative max-w-2xl mx-auto px-4 py-6 text-center">
          <Image src="/logo.png" alt="PicklerAlly DXB" width={40} height={40} className="mx-auto mb-2 rounded-full" />
          <h1 className="text-2xl font-bold tracking-tight">{tournament.name}</h1>
          <p className="text-teal-50 text-sm mt-1 font-medium">
            {tournament.date} · 📍 {venueName} · 🕐 {timeslotLabel(tournament.timeslot)}
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {!tournament.completed_at && (
          <div className={cardClass}>
            {isLeaguePlayoffs ? (
              <>
                <h2 className="text-lg font-bold text-slate-900 mb-2">Who&apos;s Playing</h2>
                <p className="text-sm text-slate-500 mb-3">
                  {tournament.max_players != null
                    ? `${playerCount}/${tournament.max_players} confirmed`
                    : `${playerCount} confirmed`}
                  {isRsvpLocked && ' · RSVP closed'}
                </p>
                <LeagueRsvpList
                  tournamentId={id}
                  organizerId={tournament.organizer_id}
                  isLocked={isRsvpLocked}
                  confirmedPersonIds={confirmedPersonIds}
                />
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-slate-900 mb-2">Join This League</h2>
                <p className="text-sm text-slate-500 mb-3">
                  {tournament.max_players != null
                    ? `${playerCount}/${tournament.max_players} signed up — ${remaining} spot${remaining === 1 ? '' : 's'} left`
                    : `${playerCount} signed up so far`}
                </p>
                {rosterFull ? (
                  <p className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 font-semibold">
                    This league is full ({playerCount}/{tournament.max_players}).
                  </p>
                ) : (
                  <JoinLeagueForm tournamentId={id} />
                )}
              </>
            )}
          </div>
        )}

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
                    className="block rounded-lg bg-navy-tint px-3 py-2 text-sm font-semibold text-navy-deep hover:bg-navy-mid/10 transition-colors"
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
                    <td className="py-2 text-center text-navy-mid font-extrabold">{s.wins}</td>
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
                {stageMatches.map((m, i) => {
                  if (!m.team_b_id && isLeaguePlayoffs) {
                    return (
                      <li key={i} className="flex items-center justify-between">
                        <span>
                          {stage === 'league' && (
                            <span className="text-slate-400 mr-2">R{m.round}</span>
                          )}
                          <span className="text-slate-400">Sitting out:</span>{' '}
                          <span className="font-semibold">{teamById.get(m.team_a_id!)}</span>
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={i} className="flex items-center justify-between">
                      <span>
                        {stage === 'league' && (
                          <span className="text-slate-400 mr-2">R{m.round}</span>
                        )}
                        {!isLadder && m.court !== null && (
                          <span className="text-slate-400 mr-2">{courtLabel(m.court)}</span>
                        )}
                        <span className="font-semibold">{teamById.get(m.team_a_id!)}</span>
                        <span className="text-slate-400 mx-1">vs</span>
                        <span className="font-semibold">
                          {m.team_b_id ? teamById.get(m.team_b_id) : 'BYE'}
                        </span>
                      </span>
                      {m.status === 'complete' && (
                        <span className="font-bold text-navy-mid">
                          {m.score_a}-{m.score_b}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </main>
    </div>
  );
}
