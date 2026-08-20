// apps/organizer-web/app/people/[id]/page.tsx
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass, pillClass, inputClass, primaryButtonClass } from '@/app/components/ui';
import { HANDEDNESS_OPTIONS, PLAYING_STYLE_OPTIONS, STRENGTH_OPTIONS, PADDLE_BRAND_OPTIONS, SIGNATURE_SHOT_OPTIONS } from '@/lib/people/profileOptions';
import { updatePersonProfile, uploadPersonPhoto, removePersonPhoto } from './actions';
import PersonAvatar from '@/app/components/PersonAvatar';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { computePersonStats } from '@/lib/stats/personStats';
import { starRating, renderStars } from '@/lib/stats/starRating';
import {
  buildLocationRows,
  buildPeriodRows,
  buildMatchHistoryRows,
  formatHeadToHead,
  starRatingLabel,
} from '@/lib/stats/personStatsExport';
import SharePlayerStatsButton from './SharePlayerStatsButton';
import { computeStandings } from '@/lib/tournament/standings';
import { isIndividualFormat } from '@/lib/tournament/formats';
import { renderTrend, trendColorClass } from '@/lib/stats/trend';
import type { RawMatch, RawTeam, TournamentWon } from '@/lib/stats/types';
import type { MatchResult } from '@/lib/types';

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organizer } = await requireOrganizer();

  const { data: person } = await supabase
    .from('people')
    .select('id, name, handedness, age, playing_style, paddle_brand, signature_shot, photo_url, strengths')
    .eq('id', id)
    .eq('organizer_id', organizer.id)
    .single();

  if (!person) {
    return (
      <OrganizerShell organizerName={organizer.name}>
        <p className="text-slate-500">Person not found.</p>
      </OrganizerShell>
    );
  }

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name, date, format, venues(name)')
    .eq('organizer_id', organizer.id);

  const tournamentIds = (tournaments ?? []).map((t) => t.id);
  const tournamentDateById = new Map((tournaments ?? []).map((t) => [t.id, t.date]));
  const tournamentFormatById = new Map((tournaments ?? []).map((t) => [t.id, t.format]));
  const venueNameByTournamentId = new Map(
    (tournaments ?? []).map((t) => {
      const venue = t.venues as { name: string } | { name: string }[] | null;
      const name = Array.isArray(venue)
        ? (venue[0]?.name ?? 'Pickle Turf')
        : (venue?.name ?? 'Pickle Turf');
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
        .select('tournament_id, team_a_id, team_b_id, score_a, score_b, status')
        .in('tournament_id', tournamentIds)
    : { data: [] };

  const personIdByPlayerId = new Map(
    (players ?? []).map((p) => [p.id, p.person_id as string | null])
  );
  const personNameById = new Map<string, string>();
  // Only need names for people who appear as opponents/partners; fetch once for this organizer.
  const { data: allPeople } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', organizer.id);
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

  // Determine which tournaments this person's team won, reusing Increment 1.1's
  // tested computeStandings per tournament rather than re-deriving ranking logic here.
  const tournamentsWon: TournamentWon[] = [];
  for (const tournamentId of tournamentIds) {
    const format = tournamentFormatById.get(tournamentId);
    if (format && isIndividualFormat(format)) continue;

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

  const locationRows = buildLocationRows(stats.matchesByLocation);
  const weeklyRows = buildPeriodRows(stats.weekly.slice(0, 4));
  const monthlyRows = buildPeriodRows(stats.monthly.slice(0, 6));
  const yearlyRows = buildPeriodRows(stats.yearly);
  const matchHistoryRows = buildMatchHistoryRows(stats.matchHistory, personNameById);
  const toughestOpponentLabel = formatHeadToHead(stats.toughestOpponent, personNameById);
  const bestPartnerLabel = formatHeadToHead(stats.bestPartner, personNameById);
  const starLabel = starRatingLabel(stats.winPercentage);

  const strengthLabels = (person.strengths ?? []).map(
    (s: string) => STRENGTH_OPTIONS.find((o) => o.value === s)?.label ?? s
  );
  const handednessLabel = person.handedness
    ? (HANDEDNESS_OPTIONS.find((h) => h.value === person.handedness)?.label ?? null)
    : null;
  const playingStyleLabel = person.playing_style
    ? (PLAYING_STYLE_OPTIONS.find((s) => s.value === person.playing_style)?.label ?? null)
    : null;
  const paddleBrandLabel = person.paddle_brand
    ? (PADDLE_BRAND_OPTIONS.find((p) => p.value === person.paddle_brand)?.label ?? null)
    : null;
  const signatureShotValues = (person.signature_shot as string[] | null) ?? [];
  const signatureShotBadges = signatureShotValues
    .map((v) => SIGNATURE_SHOT_OPTIONS.find((o) => o.value === v))
    .filter((b): b is (typeof SIGNATURE_SHOT_OPTIONS)[number] => Boolean(b));
  // The PDF export uses jsPDF's standard WinAnsi-encoded font with no custom font registered
  // (matching the existing ASCII-only convention in lib/stats/personStatsExport.ts) -- an emoji
  // in a doc.text() call corrupts the entire string into mojibake, so the PDF gets a plain-text
  // label without the emoji while the on-page pills keep it.
  const signatureShotPdfLabels = signatureShotBadges.map((b) => `${b.skillName} — ${b.funnyName}`);
  const profileSummaryParts = [
    handednessLabel,
    person.age ? `Age ${person.age}` : null,
    playingStyleLabel,
    paddleBrandLabel,
    strengthLabels.length > 0 ? strengthLabels.join(', ') : null,
  ].filter((part): part is string => Boolean(part));
  const profileSummary = profileSummaryParts.length > 0 ? profileSummaryParts.join(' · ') : null;

  const updatePersonProfileWithId = updatePersonProfile.bind(null, person.id);
  const uploadPersonPhotoWithId = uploadPersonPhoto.bind(null, person.id);
  const removePersonPhotoWithId = removePersonPhoto.bind(null, person.id);

  return (
    <OrganizerShell organizerName={organizer.name}>
      <div className="flex items-center gap-4 mb-1">
        <PersonAvatar photoUrl={person.photo_url} name={person.name} size={80} />
        <h1 className="text-2xl font-bold text-slate-900">{person.name}</h1>
      </div>
      <p className="text-sm text-slate-500">
        {stats.lastPlayedDate ? `Last played: ${stats.lastPlayedDate}` : 'No matches played yet'}
      </p>
      <p className="text-sm text-slate-500">
        {stats.winPercentage !== null ? (
          <>
            Win rate: {stats.winPercentage}%{' '}
            <span className="text-green-600">
              {renderStars(starRating(stats.winPercentage))}
            </span>
          </>
        ) : (
          'No matches played yet'
        )}
      </p>
      {profileSummary && <p className="text-sm text-slate-500">{profileSummary}</p>}
      {signatureShotBadges.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {signatureShotBadges.map((b) => (
            <span key={b.value} className={`${pillClass} bg-amber-50 text-amber-900`}>
              {b.emoji} {b.skillName} — {b.funnyName}
            </span>
          ))}
        </div>
      )}
      {signatureShotBadges.length === 0 && profileSummary && <div className="mb-6" />}

      <div className="mb-6">
        <details>
          <summary className="cursor-pointer text-sm font-bold text-teal-700 hover:text-teal-800 list-none mb-3">
            ✏️ Edit Profile
          </summary>
          <div className={`${cardClass} flex flex-col gap-3 max-w-md mb-3`}>
            <form action={uploadPersonPhotoWithId} className="flex items-center gap-2">
              <label className="text-sm font-semibold text-slate-700 flex-1">
                Photo
                <input
                  type="file"
                  name="photo"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  className="text-sm block w-full mt-1"
                />
              </label>
              <button type="submit" className={primaryButtonClass}>
                Upload
              </button>
            </form>
            {person.photo_url && (
              <form action={removePersonPhotoWithId}>
                <button type="submit" className="text-xs font-semibold text-red-600 hover:underline">
                  Remove photo
                </button>
              </form>
            )}
          </div>
          <form action={updatePersonProfileWithId} className={`${cardClass} flex flex-col gap-3 max-w-md`}>
            <label className="text-sm font-semibold text-slate-700">
              Name
              <input
                type="text"
                name="name"
                defaultValue={person.name}
                required
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Handedness
              <select name="handedness" defaultValue={person.handedness ?? ''} className={`${inputClass} mt-1`}>
                <option value="">Not set</option>
                {HANDEDNESS_OPTIONS.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Age
              <input
                type="number"
                name="age"
                defaultValue={person.age ?? ''}
                min={1}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Playing Style
              <select name="playingStyle" defaultValue={person.playing_style ?? ''} className={`${inputClass} mt-1`}>
                <option value="">Not set</option>
                {PLAYING_STYLE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Paddle Brand
              <select name="paddleBrand" defaultValue={person.paddle_brand ?? ''} className={`${inputClass} mt-1`}>
                <option value="">Not set</option>
                {PADDLE_BRAND_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend className="text-sm font-semibold text-slate-700 mb-1">
                Signature Shot Badges (up to 4)
              </legend>
              <div className="flex flex-wrap gap-3">
                {SIGNATURE_SHOT_OPTIONS.map((b) => (
                  <label key={b.value} className="flex items-center gap-1.5 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      name="signatureShot"
                      value={b.value}
                      defaultChecked={signatureShotValues.includes(b.value)}
                      className="accent-teal-600"
                    />
                    {b.emoji} {b.skillName} — {b.funnyName}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-semibold text-slate-700 mb-1">Strengths</legend>
              <div className="flex flex-wrap gap-3">
                {STRENGTH_OPTIONS.map((s) => (
                  <label key={s.value} className="flex items-center gap-1.5 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      name="strengths"
                      value={s.value}
                      defaultChecked={(person.strengths ?? []).includes(s.value)}
                      className="accent-teal-600"
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <button type="submit" className={primaryButtonClass}>
              Save Profile
            </button>
          </form>
        </details>
      </div>

      <div className="mb-6">
        <SharePlayerStatsButton
          personName={person.name}
          photoUrl={person.photo_url}
          lastPlayedDate={stats.lastPlayedDate}
          starLabel={starLabel}
          handedness={handednessLabel}
          age={person.age}
          playingStyle={playingStyleLabel}
          paddleBrand={paddleBrandLabel}
          signatureShot={signatureShotPdfLabels}
          strengths={strengthLabels}
          thisMonthGamesWon={thisMonth.gamesWon}
          thisMonthGamesLost={thisMonth.gamesLost}
          thisMonthTournamentsWon={thisMonth.tournamentsWon}
          locationRows={locationRows}
          weeklyRows={weeklyRows}
          monthlyRows={monthlyRows}
          yearlyRows={yearlyRows}
          toughestOpponentLabel={toughestOpponentLabel}
          bestPartnerLabel={bestPartnerLabel}
          matchHistoryRows={matchHistoryRows}
        />
        <p className="text-xs text-slate-400 mt-1.5">
          Opens your share sheet on mobile — downloads the file on desktop.
        </p>
      </div>

      <div className={`${cardClass} mb-6`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">This Month</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-extrabold text-teal-700">
              {thisMonth.gamesWon}
            </div>
            <div className="text-xs text-slate-500">Games won</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-500">
              {thisMonth.gamesLost}
            </div>
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

      <div className={`${cardClass} mb-6`}>
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
                    <span className="font-bold text-teal-700">
                      {l.count} match{l.count === 1 ? '' : 'es'}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {locationWinPercentage}%{' '}
                      <span className="text-green-600">
                        {renderStars(starRating(locationWinPercentage))}
                      </span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-slate-400 text-sm">No matches played yet.</p>
        )}
      </div>

      <div className={`${cardClass} mb-6`}>
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
          <p className="text-slate-400 text-sm mb-4">No matches played yet.</p>
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
          <p className="text-slate-400 text-sm mb-4">No matches played yet.</p>
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
          <p className="text-slate-400 text-sm">No matches played yet.</p>
        )}
      </div>

      <div className={`${cardClass} mb-6`}>
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
            <li key={i} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
              <span>
                <span className="text-slate-400 mr-2">{m.tournamentDate}</span>
                with <span className="font-semibold">{nameFor(m.partnerId)}</span> vs{' '}
                <span className="font-semibold">
                  {nameFor(m.opponentIds[0])} / {nameFor(m.opponentIds[1])}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className={`${pillClass} ${m.won ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {m.won ? 'W' : 'L'}
                </span>
                <span className={m.won ? 'font-bold text-teal-700' : 'font-bold text-slate-400'}>
                  {m.scoreFor}-{m.scoreAgainst}
                </span>
              </span>
            </li>
          ))}
          {stats.matchHistory.length === 0 && (
            <li className="text-slate-400">No completed matches yet.</li>
          )}
        </ul>
      </div>
    </OrganizerShell>
  );
}
