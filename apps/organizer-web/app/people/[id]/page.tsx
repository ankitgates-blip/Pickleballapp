// apps/organizer-web/app/people/[id]/page.tsx
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass, pillClass, inputClass, primaryButtonClass, headingClass } from '@/app/components/ui';
import { HANDEDNESS_OPTIONS, PLAYING_STYLE_OPTIONS, STRENGTH_OPTIONS, PADDLE_BRAND_OPTIONS, SIGNATURE_SHOT_OPTIONS } from '@/lib/people/profileOptions';
import { updatePersonProfile, uploadPersonPhoto, removePersonPhoto, deletePerson } from './actions';
import DeletePersonButton from './DeletePersonButton';
import PersonAvatar from '@/app/components/PersonAvatar';
import SaveButton from '@/app/components/SaveButton';
import ThreatBadge from '@/app/components/ThreatBadge';
import PlayerStatsCard from '@/app/components/PlayerStatsCard';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { winPercentageFromRecords } from '@/lib/stats/winRate';
import { longestWinStreak } from '@/lib/stats/winStreak';
import { buildMatchImpacts } from '@/lib/stats/matchImpact';
import { computeAchievements, type AchievementInputs } from '@/lib/stats/achievements';
import { computePointsLeaderboard, type PointsTournament } from '@/lib/stats/points';
import { monthDateRange } from '@/lib/stats/monthRange';
import AchievementsGrid from '@/app/components/AchievementsGrid';
import { winsInLastN } from '@/lib/stats/winsInLastN';
import { winsVsHigherRated } from '@/lib/stats/winsVsHigherRated';
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
import { computeTournamentChampionPersonIds } from '@/lib/tournament/champion';
import { renderTrend, trendColorClass } from '@/lib/stats/trend';
import type { RawMatch, RawTeam, TournamentWon } from '@/lib/stats/types';

const MENTOR_GAP = 15; // percentage points a partner's overall win% must trail yours by to count as "carrying" them

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organizer } = await requireOrganizer();

  const { data: person } = await supabase
    .from('people')
    .select('id, name, nickname, handedness, age, playing_style, paddle_brand, signature_shot, photo_url, strengths, player_number')
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
    .select('id, name, date, format, timeslot, completed_at, venues(name)')
    .eq('organizer_id', organizer.id);

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

  // Overall win rate for every person this organizer has ever seen, computed once from the
  // already-fetched teams/completeMatches — needed for the Wins vs Higher-Rated stat on the
  // Player Stats Card below (separate from this specific player's own winPercentage).
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

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const thisMonthFull = stats.monthly.find((m) => m.period === currentMonthKey) ?? null;
  const thisMonth = thisMonthFull ?? {
    gamesWon: 0,
    gamesLost: 0,
    tournamentsWon: 0,
  };

  const locationRows = buildLocationRows(stats.matchesByLocation);
  const weeklyRows = buildPeriodRows(stats.weekly.slice(0, 4));
  const monthlyRows = buildPeriodRows(stats.monthly.slice(0, 6));
  const yearlyRows = buildPeriodRows(stats.yearly);
  const matchHistoryRows = buildMatchHistoryRows(stats.matchHistory, personNameById);
  const matchImpacts = buildMatchImpacts(stats.matchHistory, stats.winPercentage ?? 0, winPercentageByPersonId);
  const toughestOpponentLabel = formatHeadToHead(stats.toughestOpponent, personNameById);
  const bestPartnerLabel = formatHeadToHead(stats.bestPartner, personNameById);
  const starLabel = starRatingLabel(stats.winPercentage);

  const thisMonthWinPercentage = thisMonthFull?.winPercentage ?? null;
  const cardRating =
    stats.winPercentage !== null ? Math.round((stats.winPercentage / 100) * 5 * 100) / 100 : 0;
  const cardStarCount = starRating(stats.winPercentage ?? 0);
  const cardFormPercentage = thisMonthWinPercentage ?? stats.winPercentage ?? 0;
  const cardThreatPercentage = stats.winPercentage ?? 0;
  const cardWins = stats.matchHistory.filter((m) => m.won).length;
  const cardLosses = stats.matchHistory.length - cardWins;
  const cardWinStreak = longestWinStreak(stats.matchHistory);
  const cardWinsInLast10 = winsInLastN(stats.matchHistory, 10);
  const cardTrendPoints = stats.weekly[0]?.trendPointsChange ?? null;
  const cardWinsVsHigherRated = winsVsHigherRated(
    stats.matchHistory,
    stats.winPercentage ?? 0,
    winPercentageByPersonId
  );
  const cardTotalMatches = stats.matchHistory.length;

  // --- Achievement inputs that need data beyond this person's own match/tournament
  // rows (every tournament's format/venue/timeslot, the organizer's full people list,
  // every past month's points leaderboard, the real Player of the Month record) ---

  const myTeamIds = new Set(
    teams.filter((t) => t.player1PersonId === person.id || t.player2PersonId === person.id).map((t) => t.id)
  );
  const reachedFinalCount = (matchesRaw ?? []).filter(
    (m) =>
      m.status === 'complete' &&
      m.stage === 'final' &&
      (myTeamIds.has(m.team_a_id ?? '') || myTeamIds.has(m.team_b_id ?? ''))
  ).length;

  const wonFormats = new Set(
    tournamentsWon
      .map((t) => tournamentById.get(t.tournamentId)?.format)
      .filter((f): f is string => Boolean(f))
  );
  const playedFormats = new Set(
    Array.from(new Set(records.map((r) => r.tournamentId)))
      .map((tid) => tournamentById.get(tid)?.format)
      .filter((f): f is string => Boolean(f))
  );
  const wonVenues = new Set(
    tournamentsWon
      .map((t) => venueNameByTournamentId.get(t.tournamentId))
      .filter((v): v is string => Boolean(v))
  );
  const eveningMatches = records.filter((r) => tournamentById.get(r.tournamentId)?.timeslot === 'evening').length;
  const morningMatches = records.filter((r) => tournamentById.get(r.tournamentId)?.timeslot === 'morning').length;

  const wonWithLowerRatedPartner = records.some((r) => {
    if (!r.won || stats.winPercentage === null) return false;
    const partnerPercentage = winPercentageByPersonId.get(r.partnerId);
    return partnerPercentage !== null && partnerPercentage !== undefined && partnerPercentage < stats.winPercentage - MENTOR_GAP;
  });

  const { data: allPeopleOrdered } = await supabase
    .from('people')
    .select('id')
    .eq('organizer_id', organizer.id)
    .order('created_at', { ascending: true });
  const signupRankIndex = (allPeopleOrdered ?? []).findIndex((p) => p.id === person.id);
  const signupRank = signupRankIndex === -1 ? null : signupRankIndex + 1;

  const { data: potmRows } = await supabase
    .from('player_of_the_month')
    .select('id')
    .eq('person_id', person.id)
    .limit(1);
  const wasEverPlayerOfTheMonth = (potmRows ?? []).length > 0;

  // Total Points (lib/stats/points.ts) is scoped to Custom League/League + Playoffs and
  // dated from 2026-09-01 -- computePointsLeaderboard already enforces both, so this
  // reuses the exact same eligibility rules the Locations leaderboard shows, not a
  // parallel reimplementation.
  const pointsTournaments: PointsTournament[] = tournamentIds.map((tid) => {
    const t = tournamentById.get(tid)!;
    return {
      id: tid,
      date: t.date,
      format: t.format,
      completedAt: t.completed_at,
      matches: (matchesRaw ?? []).filter((m) => m.tournament_id === tid),
      teams: teams
        .filter((tm) => tm.tournamentId === tid)
        .map((tm) => ({ id: tm.id, person1Id: tm.player1PersonId, person2Id: tm.player2PersonId })),
    };
  });
  const lifetimePoints = computePointsLeaderboard({
    matches: completeMatches,
    teams,
    tournaments: pointsTournaments,
    range: { start: '2026-01-01', endExclusive: '9999-01-01' },
  });
  const totalPoints = lifetimePoints.find((e) => e.personId === person.id)?.totalPoints ?? 0;

  let wasEverMonthlyPointsLeader = false;
  for (const period of stats.monthly.map((m) => m.period)) {
    const [y, mo] = period.split('-').map(Number);
    const monthEntries = computePointsLeaderboard({
      matches: completeMatches,
      teams,
      tournaments: pointsTournaments,
      range: monthDateRange(y, mo),
    });
    if (monthEntries[0]?.personId === person.id) {
      wasEverMonthlyPointsLeader = true;
      break;
    }
  }

  const achievementInputs: AchievementInputs = {
    matchHistory: stats.matchHistory,
    weekly: stats.weekly,
    monthly: stats.monthly,
    yearly: stats.yearly,
    tournamentsWon,
    matchesByLocation: stats.matchesByLocation,
    toughestOpponent: stats.toughestOpponent,
    bestPartner: stats.bestPartner,
    winPercentage: stats.winPercentage,
    winsVsHigherRated: cardWinsVsHigherRated,
    longestWinStreak: cardWinStreak,
    totalPoints,
    wonFormats,
    playedFormats,
    wonVenues,
    reachedFinalCount,
    eveningMatches,
    morningMatches,
    signupRank,
    wasEverPlayerOfTheMonth,
    wasEverMonthlyPointsLeader,
    wonWithLowerRatedPartner,
  };
  const achievements = computeAchievements(achievementInputs);

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
  const ageHandednessParts = [
    person.age ? `Age ${person.age}` : null,
    handednessLabel,
  ].filter((part): part is string => Boolean(part));
  const ageHandednessLabel =
    ageHandednessParts.length > 0 ? ageHandednessParts.join(' · ') : null;
  const cardSignatureShots = signatureShotBadges.map((b) => ({
    emoji: b.emoji,
    skillName: b.skillName,
  }));
  const profileSummaryParts = [
    handednessLabel,
    person.age ? `Age ${person.age}` : null,
    playingStyleLabel,
    paddleBrandLabel,
    strengthLabels.length > 0 ? strengthLabels.join(', ') : null,
  ].filter((part): part is string => Boolean(part));
  const profileSummary = profileSummaryParts.length > 0 ? profileSummaryParts.join(' · ') : null;

  const updatePersonProfileWithId = updatePersonProfile.bind(null, person.id);
  const deletePersonWithId = deletePerson.bind(null, person.id);
  const uploadPersonPhotoWithId = uploadPersonPhoto.bind(null, person.id);
  const removePersonPhotoWithId = removePersonPhoto.bind(null, person.id);
  const displayName = person.nickname ? `${person.name} (${person.nickname})` : person.name;

  return (
    <OrganizerShell organizerName={organizer.name}>
      <div className="flex items-center gap-4 mb-1">
        <PersonAvatar photoUrl={person.photo_url} name={person.name} size={80} />
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className={`text-2xl ${headingClass}`}>{displayName}</h1>
          <ThreatBadge winPercentage={stats.winPercentage} size="default" />
        </div>
      </div>
      <p className="text-sm text-slate-500">
        {stats.lastPlayedDate ? `Last played: ${stats.lastPlayedDate}` : 'No matches played yet'}
      </p>
      <p className="text-sm text-slate-500">
        {stats.winPercentage !== null ? (
          <>
            Win rate: {stats.winPercentage}%{' '}
            <span className="text-gold-bright">
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
        <h2 className="text-sm font-bold text-slate-700 mb-2">Player Stats Card</h2>
        <PlayerStatsCard
          name={displayName}
          photoUrl={person.photo_url}
          playerNumber={person.player_number}
          ageHandednessLabel={ageHandednessLabel}
          signatureShots={cardSignatureShots}
          rating={cardRating}
          starCount={cardStarCount}
          formPercentage={cardFormPercentage}
          threatPercentage={cardThreatPercentage}
          wins={cardWins}
          losses={cardLosses}
          winStreak={cardWinStreak}
          trendPoints={cardTrendPoints}
          winsVsHigherRated={cardWinsVsHigherRated}
          totalMatches={cardTotalMatches}
          winsInLast10={cardWinsInLast10}
        />
      </div>

      <div className="mb-6">
        <details>
          <summary className="cursor-pointer text-sm font-bold text-navy-mid hover:text-navy-deep list-none mb-3">
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
              <SaveButton className={primaryButtonClass} pendingLabel="Uploading…">
                Upload
              </SaveButton>
            </form>
            {person.photo_url && (
              <form action={removePersonPhotoWithId}>
                <SaveButton
                  className="text-xs font-semibold text-red-600 hover:underline"
                  pendingLabel="Removing…"
                >
                  Remove photo
                </SaveButton>
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
              Player No.
              <input
                type="text"
                name="playerNumber"
                defaultValue={person.player_number ?? ''}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="e.g. 7"
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Nickname
              <input
                type="text"
                name="nickname"
                defaultValue={person.nickname ?? ''}
                placeholder="e.g. Rocket"
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
                      className="accent-navy-mid"
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
                      className="accent-navy-mid"
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <SaveButton className={primaryButtonClass} pendingLabel="Saving…">
              Save Profile
            </SaveButton>
          </form>
        </details>
      </div>

      <div className={`${cardClass} border-red-200 bg-red-50 mb-6 max-w-md`}>
        <h2 className="text-sm font-bold text-red-800 mb-1">Danger Zone</h2>
        <p className="text-xs text-red-700 mb-3">
          Permanently deletes this player from the database — not just this profile, but
          every tournament roster, team, and match they're part of. Use this to remove a
          wrongly-created or misspelled player, not to undo a real result.
        </p>
        <DeletePersonButton personName={person.name} deleteAction={deletePersonWithId} />
      </div>

      <div className="mb-6">
        <SharePlayerStatsButton
          personName={person.name}
          nickname={person.nickname}
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
        <p className="text-xs text-muted mt-1.5">
          Opens your share sheet on mobile — downloads the file on desktop.
        </p>
      </div>

      <div className={`${cardClass} mb-6`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">This Month</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 rounded-2xl bg-gradient-to-br from-navy-deep to-navy-mid text-white p-4 flex flex-col justify-between">
            <span className="text-xs font-semibold text-white/60 uppercase tracking-wide">
              Win rate
            </span>
            <div>
              <div className="stat-num text-4xl font-black">
                {thisMonthFull?.winPercentage != null ? `${thisMonthFull.winPercentage}%` : '—'}
              </div>
              <div className="stat-num text-xs text-white/70 mt-1">
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

      <div className={`${cardClass} mb-6`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">Achievements</h2>
        <AchievementsGrid achievements={achievements} />
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
                    <span className="font-bold text-navy-mid">
                      {l.count} match{l.count === 1 ? '' : 'es'}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {locationWinPercentage}%{' '}
                      <span className="text-gold-bright">
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
          {stats.matchHistory.map((m, i) => {
            const impact = matchImpacts[i];
            return (
              <li key={i} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                <span>
                  <span className="text-muted mr-2">{m.tournamentDate}</span>
                  with <span className="font-semibold">{nameFor(m.partnerId)}</span> vs{' '}
                  <span className="font-semibold">
                    {nameFor(m.opponentIds[0])} / {nameFor(m.opponentIds[1])}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="flex items-center gap-2">
                    <span className={`${pillClass} ${m.won ? 'bg-win/10 text-win' : 'bg-loss/10 text-loss'}`}>
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
    </OrganizerShell>
  );
}
