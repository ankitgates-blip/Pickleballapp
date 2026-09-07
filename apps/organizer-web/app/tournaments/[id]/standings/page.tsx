import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import {
  computeStandings,
  computeIndividualStandings,
  computeClaimTheThroneStandings,
} from '@/lib/tournament/standings';
import { usesIndividualStandings, isLadderFormat as isLadderFormatCheck } from '@/lib/tournament/formats';
import type { ClaimTheThroneRoundResult, MatchResult, Team } from '@/lib/types';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import PersonAvatar from '@/app/components/PersonAvatar';
import { cardClass, headingClass } from '@/app/components/ui';
import StandingsTable from '@/app/components/StandingsTable';
import CopyLinkButton from './CopyLinkButton';

type LadderRoundResult = ClaimTheThroneRoundResult;

type PodiumEntry = {
  key: string;
  name: string;
  avatars: (string | null)[];
};

// Indexed by true placement (rank 0 = 1st, 1 = 2nd, 2 = 3rd) -- matches how `rank` is
// computed below (top3.indexOf), NOT the left-to-right render order (which is visually
// [2nd, 1st, 3rd] so 1st ends up centered). Heights/colors are data-driven so plain
// inline styles are used rather than Tailwind classes. 1st is dramatically taller than
// 2nd/3rd; 2nd is only slightly taller than 3rd, matching a real podium's proportions
// rather than an even step down.
// Colors reference the app's --color-gold-*/--color-silver-*/--color-bronze-* tokens
// (globals.css) via var(), not Tailwind classes, since these feed a data-driven
// linear-gradient. Referencing the tokens (rather than duplicating their hex here)
// keeps this podium in sync with globals.css by construction. This is a deliberately
// separate palette from leaderboardPalette.ts's GOLD_DEEP/SILVER_DEEP/BRONZE_DEEP
// (same core hues, different deep/light stops) -- that one is tuned for the on-navy
// LeaderboardTable card family, this one for a white card, and the two are not meant
// to converge. The previous silver/bronze values had bronze's highlight LIGHTER than
// silver's, so the podium read gold/bronze/silver in greyscale -- these are reordered
// so silver is genuinely brighter than bronze. Silver's lighter background also needs
// dark rank-number text instead of white (see textColor below), or the numeral
// disappears against it; gold needed the same fix for the same reason.
const PODIUM_BLOCK_STYLE = [
  { height: 108, background: 'linear-gradient(180deg,var(--color-gold-highlight),var(--color-gold-bright))', textColor: 'text-navy-deep' }, // 1st -- gold
  { height: 56, background: 'linear-gradient(180deg,var(--color-silver-light),var(--color-silver))', textColor: 'text-navy-deep' }, // 2nd -- silver
  { height: 50, background: 'linear-gradient(180deg,var(--color-bronze),var(--color-bronze-dark))', textColor: 'text-white' }, // 3rd -- bronze
];

function Podium({ top3 }: { top3: PodiumEntry[] }) {
  if (top3.length < 2) return null; // not worth a podium for a field of 1

  // Render order is [2nd, 1st, 3rd] so 1st ends up centered and tallest; ranks beyond
  // what's available (a field of exactly 2) are simply skipped.
  const order = [top3[1], top3[0], top3[2]].filter((e): e is PodiumEntry => Boolean(e));

  return (
    <div className="flex items-end justify-center gap-3 mb-2">
      {order.map((entry) => {
        const rank = top3.indexOf(entry);
        const style = PODIUM_BLOCK_STYLE[rank];
        const avatarSize = rank === 0 ? 62 : rank === 1 ? 42 : 38;
        return (
          <div key={entry.key} className="flex flex-col items-center">
            {rank === 0 && <div className="text-2xl mb-0.5">👑</div>}
            <div className="mb-1 flex -space-x-2">
              {entry.avatars.map((photoUrl, i) => (
                <PersonAvatar key={i} photoUrl={photoUrl} name={entry.name} size={avatarSize} />
              ))}
            </div>
            <div
              className={
                rank === 0
                  ? 'text-sm font-extrabold text-navy-deep mb-1 text-center max-w-[90px] truncate'
                  : 'text-xs font-bold text-slate-700 mb-1 text-center max-w-[80px] truncate'
              }
            >
              {entry.name}
            </div>
            <div
              className="w-20 rounded-t-lg flex items-start justify-center pt-1"
              style={{ height: style.height, background: style.background }}
            >
              <span className={`${style.textColor} font-black ${rank === 0 ? 'text-2xl' : 'text-lg'}`}>
                {rank + 1}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function StandingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organizer, role } = await requireOrganizer();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, date, format, venues(name)')
    .eq('id', id)
    .single();

  const isLadderFormat = isLadderFormatCheck(tournament?.format ?? '');
  const isIndividualFormat = usesIndividualStandings(tournament?.format ?? '');

  const venue = tournament?.venues as { name: string } | { name: string }[] | null;
  const venueName = Array.isArray(venue) ? (venue[0]?.name ?? 'Pickleturf') : (venue?.name ?? 'Pickleturf');

  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', id);

  const { data: players } = await supabase
    .from('players')
    .select('id, name, person_id')
    .eq('tournament_id', id);

  const { data: matches } = await supabase
    .from('matches')
    .select('team_a_id, team_b_id, score_a, score_b, status, court')
    .eq('tournament_id', id);

  const { data: allPeople } = await supabase
    .from('people')
    .select('id, photo_url')
    .eq('organizer_id', organizer.id);
  const photoUrlByPersonId = new Map((allPeople ?? []).map((p) => [p.id, p.photo_url as string | null]));
  const personIdByPlayerId = new Map((players ?? []).map((p) => [p.id, p.person_id as string | null]));
  const photoUrlForPlayerId = (playerId: string): string | null => {
    const personId = personIdByPlayerId.get(playerId);
    return personId ? (photoUrlByPersonId.get(personId) ?? null) : null;
  };

  const playerById = new Map((players ?? []).map((p) => [p.id, p.name]));
  const teamById = new Map(
    (teams ?? []).map((t) => [
      t.id,
      `${playerById.get(t.player_1_id)} / ${playerById.get(t.player_2_id)}`,
    ])
  );

  const matchResults: MatchResult[] = (matches ?? []).map((m) => ({
    teamAId: m.team_a_id!,
    teamBId: m.team_b_id,
    scoreA: m.score_a,
    scoreB: m.score_b,
    status: m.status as 'pending' | 'complete',
  }));

  const teamsForIndividual: Team[] = (teams ?? []).map((t) => ({
    id: t.id,
    tournamentId: id,
    player1Id: t.player_1_id,
    player2Id: t.player_2_id,
  }));

  const standings = computeStandings(matchResults);
  const individualStandings = isIndividualFormat && !isLadderFormat
    ? computeIndividualStandings(matchResults, teamsForIndividual)
    : [];

  const teamById2 = new Map((teams ?? []).map((t) => [t.id, t]));
  const ladderMatches: LadderRoundResult[] = isLadderFormat
    ? (matches ?? [])
        .filter(
          (m): m is typeof m & { team_a_id: string; team_b_id: string; court: number; score_a: number; score_b: number } =>
            m.status === 'complete' &&
            m.team_a_id !== null &&
            m.team_b_id !== null &&
            m.court !== null &&
            m.score_a !== null &&
            m.score_b !== null
        )
        .map((m) => {
          const teamA = teamById2.get(m.team_a_id)!;
          const teamB = teamById2.get(m.team_b_id)!;
          return {
            court: m.court,
            teamAPlayerIds: [teamA.player_1_id, teamA.player_2_id] as [string, string],
            teamBPlayerIds: [teamB.player_1_id, teamB.player_2_id] as [string, string],
            scoreA: m.score_a,
            scoreB: m.score_b,
          };
        })
    : [];
  const numCourts = ladderMatches.length > 0
    ? Math.max(...ladderMatches.map((m) => m.court))
    : 0;
  const ladderStandings = isLadderFormat
    ? computeClaimTheThroneStandings(ladderMatches, numCourts)
    : [];

  const podiumTop3: PodiumEntry[] = isLadderFormat
    ? ladderStandings.slice(0, 3).map((s) => ({
        key: s.playerId,
        name: playerById.get(s.playerId) ?? 'Unknown',
        avatars: [photoUrlForPlayerId(s.playerId)],
      }))
    : isIndividualFormat
      ? individualStandings.slice(0, 3).map((s) => ({
          key: s.playerId,
          name: playerById.get(s.playerId) ?? 'Unknown',
          avatars: [photoUrlForPlayerId(s.playerId)],
        }))
      : standings.slice(0, 3).map((s) => {
          const team = teamById2.get(s.teamId);
          return {
            key: s.teamId,
            name: teamById.get(s.teamId) ?? 'Unknown',
            avatars: team ? [photoUrlForPlayerId(team.player_1_id), photoUrlForPlayerId(team.player_2_id)] : [],
          };
        });

  const diffClass = (diff: number) =>
    diff > 0 ? 'text-win' : diff < 0 ? 'text-loss' : 'text-muted';
  // Glyph-first signal (▲/▼) so win/loss direction isn't carried by color alone.
  const diffPrefix = (diff: number) => (diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : '');

  return (
    <OrganizerShell
      organizerName={organizer.name}
      role={role}
      contextStrip={{ title: tournament?.name ?? '', dateLabel: tournament?.date ?? '', venueName }}
    >
      <TournamentNav tournamentId={id} current="standings" />
      <div className="flex items-center justify-between mb-6">
        <h1 className={`text-2xl ${headingClass}`}>Standings</h1>
        <CopyLinkButton tournamentId={id} />
      </div>

      {podiumTop3.length >= 2 && (
        <div className={`${cardClass} mb-4`}>
          <Podium top3={podiumTop3} />
        </div>
      )}

      <div className={`${cardClass} overflow-x-auto`}>
        <StandingsTable
          nameColumnHeader={isIndividualFormat ? 'Player' : 'Team'}
          winLossStyle="pill"
          highlightFirstRow
          columnsBeforeWL={
            isLadderFormat
              ? [
                  {
                    header: 'Ladder Pts',
                    cells: ladderStandings.map((s) => (
                      <span key={s.playerId} className="stat-num text-navy-mid font-extrabold">
                        {s.ladderPoints}
                      </span>
                    )),
                  },
                ]
              : []
          }
          columnsAfterWL={[
            {
              header: isLadderFormat ? 'Avg Diff' : 'Point Diff',
              cells: isLadderFormat
                ? ladderStandings.map((s) => {
                    const games = s.wins + s.losses;
                    const avgDiff = games > 0 ? (s.pointsFor - s.pointsAgainst) / games : 0;
                    return (
                      <span key={s.playerId} className={`stat-num font-bold ${diffClass(avgDiff)}`}>
                        {diffPrefix(avgDiff)}
                        {avgDiff > 0 ? '+' : ''}
                        {avgDiff.toFixed(1)}
                      </span>
                    );
                  })
                : isIndividualFormat
                  ? individualStandings.map((s) => {
                      const diff = s.pointsFor - s.pointsAgainst;
                      return (
                        <span key={s.playerId} className={`stat-num font-bold ${diffClass(diff)}`}>
                          {diffPrefix(diff)}
                          {diff > 0 ? '+' : ''}
                          {diff}
                        </span>
                      );
                    })
                  : standings.map((s) => {
                      const diff = s.pointsFor - s.pointsAgainst;
                      return (
                        <span key={s.teamId} className={`stat-num font-bold ${diffClass(diff)}`}>
                          {diffPrefix(diff)}
                          {diff > 0 ? '+' : ''}
                          {diff}
                        </span>
                      );
                    }),
            },
          ]}
          rows={
            isLadderFormat
              ? ladderStandings.map((s, i) => ({
                  key: s.playerId,
                  name: playerById.get(s.playerId) ?? 'Unknown',
                  wins: s.wins,
                  losses: s.losses,
                  medal: ['🥇', '🥈', '🥉'][i],
                  medalLabel: ['1st place', '2nd place', '3rd place'][i],
                  nameClassName: `${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`,
                }))
              : isIndividualFormat
                ? individualStandings.map((s, i) => ({
                    key: s.playerId,
                    name: playerById.get(s.playerId) ?? 'Unknown',
                    wins: s.wins,
                    losses: s.losses,
                    medal: ['🥇', '🥈', '🥉'][i],
                    medalLabel: ['1st place', '2nd place', '3rd place'][i],
                    nameClassName: `${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`,
                  }))
                : standings.map((s, i) => ({
                    key: s.teamId,
                    name: teamById.get(s.teamId) ?? 'Unknown',
                    wins: s.wins,
                    losses: s.losses,
                    medal: ['🥇', '🥈', '🥉'][i],
                    medalLabel: ['1st place', '2nd place', '3rd place'][i],
                    nameClassName: `${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`,
                  }))
          }
        />
      </div>
    </OrganizerShell>
  );
}
