// apps/organizer-web/app/p/[id]/page.tsx
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { computePersonStats } from '@/lib/stats/personStats';
import { starRating, renderStars } from '@/lib/stats/starRating';
import { renderTrend, trendColorClass } from '@/lib/stats/trend';
import { winPercentageFromRecords } from '@/lib/stats/winRate';
import { buildMatchImpacts } from '@/lib/stats/matchImpact';
import { longestWinStreak } from '@/lib/stats/winStreak';
import { winsVsHigherRated } from '@/lib/stats/winsVsHigherRated';
import { computeAchievements } from '@/lib/stats/achievements';
import { computeTournamentChampionPersonIds } from '@/lib/tournament/champion';
import type { RawMatch, RawTeam, TournamentWon } from '@/lib/stats/types';
import { cardClass, pillClass } from '@/app/components/ui';
import PersonAvatar from '@/app/components/PersonAvatar';

export default async function PublicPersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: person } = await supabase
    .from('people')
    .select('id, name, nickname, organizer_id, photo_url')
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
    .select('id, name, date, format, completed_at, venues(name)')
    .eq('organizer_id', person.organizer_id);

  const tournamentIds = (tournaments ?? []).map((t) => t.id);
  const tournamentDateById = new Map((tournaments ?? []).map((t) => [t.id, t.date]));
  const tournamentById = new Map((tournaments ?? []).map((t) => [t.id, t]));
  const venueNameByTournamentId = new Map(
    (tournaments ?? []).map((t) => {
      const venue = t.venues as { name: string } | { name: string }[] | null;
      const name = Array.isArray(venue)
        ? (venue[0]?.name ?? 'Pickleturf')
        : (venue?.name ?? 'Pickleturf');
      return [t.id, name];
    })
  );

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
        .select('tournament_id, stage, round, court, team_a_id, team_b_id, score_a, score_b, status')
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
      venueName: venueNameByTournamentId.get(m.tournament_id) ?? '',
      teamAId: m.team_a_id!,
      teamBId: m.team_b_id!,
      scoreA: m.score_a ?? 0,
      scoreB: m.score_b ?? 0,
      status: 'complete' as const,
    }));

  const records = buildPersonMatchRecords(person.id, completeMatches, teams);

  // Overall win rate for every person this organizer has ever seen -- needed for the
  // match-impact badges below (upset win / tough loss vs a higher-rated opponent),
  // same convention as winsVsHigherRated elsewhere.
  const winPercentageByPersonId = new Map(
    (allPeople ?? []).map((p) => [
      p.id,
      winPercentageFromRecords(buildPersonMatchRecords(p.id, completeMatches, teams)),
    ])
  );

  // Uses the same champion-detection rules as the tournaments list and locations
  // leaderboard (final-match winner when a final exists, individual/ladder standings
  // for individual-pairing formats, only once completed) — see
  // computeTournamentChampionPersonIds. The previous logic here skipped individual
  // formats (Popcorn, Gauntlet, Claim the Throne, Up and Down the River) entirely,
  // so a player who actually won one of those got 0 credit toward "Leagues won."
  const tournamentsWon: TournamentWon[] = [];
  for (const tournamentId of tournamentIds) {
    const tournament = tournamentById.get(tournamentId);
    if (!tournament) continue;

    const tournamentTeams = teams
      .filter((t) => t.tournamentId === tournamentId)
      .map((t) => ({ id: t.id, person1Id: t.player1PersonId, person2Id: t.player2PersonId }));
    const tournamentMatches = (matchesRaw ?? []).filter((m) => m.tournament_id === tournamentId);

    const championPersonIds = computeTournamentChampionPersonIds({
      format: tournament.format,
      completedAt: tournament.completed_at,
      matches: tournamentMatches,
      teams: tournamentTeams,
    });

    if (championPersonIds?.includes(person.id)) {
      tournamentsWon.push({
        tournamentId,
        date: tournamentDateById.get(tournamentId) ?? '',
      });
    }
  }

  const stats = computePersonStats(records, tournamentsWon);
  const nameFor = (personId: string) => personNameById.get(personId) ?? 'Unknown';
  const matchImpacts = buildMatchImpacts(stats.matchHistory, stats.winPercentage ?? 0, winPercentageByPersonId);
  const achievements = computeAchievements({
    longestWinStreak: longestWinStreak(stats.matchHistory),
    winsVsHigherRated: winsVsHigherRated(stats.matchHistory, stats.winPercentage ?? 0, winPercentageByPersonId),
    totalMatches: stats.matchHistory.length,
    careerLeaguesWon: tournamentsWon.length,
  });

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const thisMonthFull = stats.monthly.find((m) => m.period === currentMonthKey) ?? null;
  const thisMonth = thisMonthFull ?? {
    gamesWon: 0,
    gamesLost: 0,
    tournamentsWon: 0,
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="relative overflow-hidden bg-gradient-to-br from-navy-deep via-navy-mid to-navy-light text-white">
        <div
          aria-hidden
          className="ball-texture absolute -top-8 -right-6 h-32 w-32 rounded-full opacity-90"
          style={{ background: 'radial-gradient(circle at 35% 35%, #f2942e, #d2621c)' }}
        />
        <div className="relative max-w-2xl mx-auto px-4 py-6 text-center">
          <Image src="/logo.png" alt="PicklerAlly DXB" width={40} height={40} className="mx-auto mb-2 rounded-full object-cover" />
          {person.photo_url && (
            <div className="flex justify-center mb-2">
              <PersonAvatar photoUrl={person.photo_url} name={person.name} size={64} />
            </div>
          )}
          <h1 className="text-2xl font-bold tracking-tight">
            {person.nickname ? `${person.name} (${person.nickname})` : person.name}
          </h1>
          <p className="text-[#dbe4f5] text-sm mt-1 font-medium">
            {stats.lastPlayedDate ? `Last played: ${stats.lastPlayedDate}` : 'No matches played yet'}
          </p>
          <p className="text-[#dbe4f5] text-sm font-medium">
            {stats.winPercentage !== null ? (
              <>
                Win rate: {stats.winPercentage}%{' '}
                <span className="text-gold-highlight">
                  {renderStars(starRating(stats.winPercentage))}
                </span>
              </>
            ) : (
              'No matches played yet'
            )}
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">This Month</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 rounded-2xl bg-gradient-to-br from-navy-deep to-navy-mid text-white p-4 flex flex-col justify-between">
              <span className="text-xs font-semibold text-white/60 uppercase tracking-wide">
                Win rate
              </span>
              <div>
                <div className="text-4xl font-black">
                  {thisMonthFull?.winPercentage != null ? `${thisMonthFull.winPercentage}%` : '—'}
                </div>
                <div className="text-xs text-white/70 mt-1">
                  {thisMonth.gamesWon}W – {thisMonth.gamesLost}L
                  {thisMonthFull?.trend && thisMonthFull.trendPointsChange !== null && (
                    <span className={`ml-2 ${trendColorClass(thisMonthFull.trend)}`}>
                      {renderTrend(thisMonthFull.trend, thisMonthFull.trendPointsChange)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex-1 rounded-2xl bg-slate-50 p-3 flex flex-col items-center justify-center text-center">
                <div className="text-xl font-extrabold text-navy-mid">{thisMonth.gamesWon}</div>
                <div className="text-[11px] text-slate-500">Games won</div>
              </div>
              <div className="flex-1 rounded-2xl bg-gradient-to-br from-[#fdf6e8] to-white border-2 border-gold/50 p-3 flex flex-col items-center justify-center text-center">
                <div className="text-xl font-extrabold text-amber-600">
                  {thisMonth.tournamentsWon}
                </div>
                <div className="text-[11px] text-slate-500">Leagues won</div>
              </div>
            </div>
          </div>
        </div>

        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">Achievements</h2>
          <div className="grid grid-cols-4 gap-2 text-center">
            {achievements.map((a) => (
              <div
                key={a.key}
                className={
                  a.earned
                    ? 'rounded-xl bg-gradient-to-br from-[#fdf6e8] to-white border-2 border-gold/50 p-2'
                    : 'rounded-xl bg-slate-50 border-2 border-slate-200 p-2 opacity-50'
                }
              >
                <div className="text-xl mb-0.5">{a.emoji}</div>
                <div className={`text-[10px] font-bold leading-tight ${a.earned ? 'text-navy-deep' : 'text-slate-500'}`}>
                  {a.label}
                </div>
                <div className="text-[9px] text-muted leading-tight">{a.description}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">By Location</h2>
          {stats.matchesByLocation.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {stats.matchesByLocation.map((l) => {
                const locationWinPercentage = Math.round((l.wins / l.count) * 100);
                return (
                  <li
                    key={l.location}
                    className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0"
                  >
                    <span className="font-semibold text-slate-900">{l.location}</span>
                    <span className="text-right">
                      <span className="font-bold text-navy-mid">
                        {l.count} match{l.count === 1 ? '' : 'es'}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {locationWinPercentage}%{' '}
                        <span className="text-amber-400">
                          {renderStars(starRating(locationWinPercentage))}
                        </span>
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted text-sm">No matches played yet.</p>
          )}
        </div>

        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">Win Rate Trend</h2>

          <h3 className="text-sm font-bold text-slate-700 mb-2">Weekly</h3>
          {stats.weekly.length > 0 ? (
            <ul className="space-y-1 text-sm mb-4">
              {stats.weekly.slice(0, 4).map((p) => (
                <li key={p.period} className="flex items-center justify-between">
                  <span className="text-slate-600">{p.period}</span>
                  <span>
                    <span className="font-semibold text-slate-900">
                      {p.winPercentage !== null ? `${p.winPercentage}%` : 'No matches'}
                    </span>{' '}
                    <span className={`text-xs font-semibold ${trendColorClass(p.trend)}`}>
                      {renderTrend(p.trend, p.trendPointsChange)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted text-sm mb-4">No matches played yet.</p>
          )}

          <h3 className="text-sm font-bold text-slate-700 mb-2">Monthly</h3>
          {stats.monthly.length > 0 ? (
            <ul className="space-y-1 text-sm mb-4">
              {stats.monthly.slice(0, 6).map((p) => (
                <li key={p.period} className="flex items-center justify-between">
                  <span className="text-slate-600">{p.period}</span>
                  <span>
                    <span className="font-semibold text-slate-900">
                      {p.winPercentage !== null ? `${p.winPercentage}%` : 'No matches'}
                    </span>{' '}
                    <span className={`text-xs font-semibold ${trendColorClass(p.trend)}`}>
                      {renderTrend(p.trend, p.trendPointsChange)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted text-sm mb-4">No matches played yet.</p>
          )}

          <h3 className="text-sm font-bold text-slate-700 mb-2">Yearly</h3>
          {stats.yearly.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {stats.yearly.map((p) => (
                <li key={p.period} className="flex items-center justify-between">
                  <span className="text-slate-600">{p.period}</span>
                  <span>
                    <span className="font-semibold text-slate-900">
                      {p.winPercentage !== null ? `${p.winPercentage}%` : 'No matches'}
                    </span>{' '}
                    <span className={`text-xs font-semibold ${trendColorClass(p.trend)}`}>
                      {renderTrend(p.trend, p.trendPointsChange)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted text-sm">No matches played yet.</p>
          )}
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
            {stats.matchHistory.map((m, i) => {
              const impact = matchImpacts[i];
              return (
                <li
                  key={i}
                  className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0"
                >
                  <span>
                    <span className="text-muted mr-2">{m.tournamentDate}</span>
                    with <span className="font-semibold">{nameFor(m.partnerId)}</span> vs{' '}
                    <span className="font-semibold">
                      {nameFor(m.opponentIds[0])} / {nameFor(m.opponentIds[1])}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="flex items-center gap-2">
                      <span className={`${pillClass} ${m.won ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {m.won ? 'W' : 'L'}
                      </span>
                      <span className={m.won ? 'font-bold text-navy-mid' : 'font-bold text-muted'}>
                        {m.scoreFor}-{m.scoreAgainst}
                      </span>
                    </span>
                    {impact?.kind === 'streak' && (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 whitespace-nowrap">
                        🔥 Streak → {impact.length}
                      </span>
                    )}
                    {impact?.kind === 'upset' && (
                      <span className="text-[11px] font-bold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5 whitespace-nowrap">
                        ⚔️ Upset win
                      </span>
                    )}
                    {impact?.kind === 'tough-loss' && (
                      <span className="text-[11px] font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 whitespace-nowrap">
                        Tough loss
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
            {stats.matchHistory.length === 0 && (
              <li className="text-muted">No completed matches yet.</li>
            )}
          </ul>
        </div>
      </main>
    </div>
  );
}
