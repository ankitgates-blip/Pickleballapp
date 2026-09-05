// The real on-screen leaderboard view -- shares its visual identity (navy ground,
// medal gradients, boxed "points" plate) with LocationLeaderboardShareCard and
// RaceLeaderboardShareCard, the SVGs those two now only use to generate a shareable
// PNG. See docs/superpowers/specs/2026-09-05-leaderboard-onscreen-view-design.md for
// why the SVG couldn't stay the on-screen view: at real phone widths it scaled down to
// an effective ~11.7px for names and ~4.3px for the smallest label.
import {
  medalStops,
  NAVY_DEEP,
  NAVY_DARKER,
  NAVY_RULE,
  PLATE,
  PLATE_STROKE,
  ON_NAVY_PRIMARY,
  ON_NAVY_SECOND,
  ON_NAVY_MUTED,
  ON_NAVY_FAINT,
  WIN_ON_NAVY,
  LOSS_ON_NAVY,
  LIVE_COLOR,
  GOLD_LIGHT,
} from './leaderboardPalette';
import { threatTierFor } from '@/lib/stats/threatLevel';
import ThreatShieldBadge from './ThreatShieldBadge';

export type LeaderboardTableRow = {
  rank: number;
  name: string;
  overallWinPercentage: number | null;
  matchWins: number;
  losses: number;
  totalPoints: number;
  // Covers tournamentWins (Locations) and leagueWins (Player of the Month) -- both
  // render as the identical "★ N" treatment the SVG cards already use, just with a
  // different source field name at each call site.
  secondaryWins: number;
};

export type LeaderboardTableProps = {
  title: string;
  kicker: string;
  isLive?: boolean;
  footerCaption: string;
  rows: LeaderboardTableRow[];
};

function GoldStar() {
  return (
    <span aria-hidden="true" style={{ fontSize: '14px' }}>
      ★
    </span>
  );
}

export default function LeaderboardTable({ title, kicker, isLive = false, footerCaption, rows }: LeaderboardTableProps) {
  const podiumRows = rows.filter((r) => r.rank <= 3);
  const bodyRows = rows.filter((r) => r.rank > 3);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: NAVY_DEEP, border: `1px solid ${PLATE_STROKE}` }}>
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          {isLive && (
            <span
              className="inline-block rounded-full px-3 py-1 text-xs font-extrabold text-white mb-2"
              style={{ background: LIVE_COLOR, letterSpacing: '1px' }}
            >
              LIVE
            </span>
          )}
          <h2 className="font-heading font-extrabold text-2xl" style={{ color: ON_NAVY_PRIMARY }}>
            {title}
          </h2>
        </div>
        <span className="font-heading font-bold text-sm" style={{ color: ON_NAVY_SECOND, letterSpacing: '1.5px' }}>
          {kicker}
        </span>
      </div>

      {podiumRows.map((row, i) => {
        const medal = medalStops(row.rank);
        const tier = row.overallWinPercentage !== null ? threatTierFor(row.overallWinPercentage) : null;
        return (
          <div
            key={i}
            className="flex items-center gap-4 px-5 py-4 border-t"
            style={{ borderColor: NAVY_RULE, borderLeft: medal ? `6px solid ${medal.core}` : undefined }}
          >
            <div
              className="flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center font-heading font-extrabold text-2xl"
              style={{
                background: medal ? `linear-gradient(135deg, ${medal.deep}, ${medal.light} 50%, ${medal.core})` : NAVY_DARKER,
                color: NAVY_DEEP,
                border: medal ? `2px solid ${medal.deep}` : undefined,
              }}
            >
              {row.rank}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-heading font-bold text-lg truncate" style={{ color: ON_NAVY_PRIMARY }}>
                {row.name}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="stat-num text-sm flex-shrink-0">
                  <span style={{ color: WIN_ON_NAVY, fontWeight: 700 }}>{row.matchWins}W</span>
                  <span style={{ color: ON_NAVY_SECOND }}> – </span>
                  <span style={{ color: LOSS_ON_NAVY, fontWeight: 700 }}>{row.losses}L</span>
                </span>
                {tier && <ThreatShieldBadge tier={tier} size={24} />}
                {row.secondaryWins > 0 && (
                  <span className="font-heading font-bold text-sm flex items-center gap-1 flex-shrink-0" style={{ color: GOLD_LIGHT }}>
                    <GoldStar /> {row.secondaryWins}
                  </span>
                )}
              </div>
            </div>
            <div
              className="flex-shrink-0 rounded-lg px-4 py-2 text-center"
              style={{ background: PLATE, border: `1px solid ${PLATE_STROKE}` }}
            >
              <div className="text-[10px] font-bold" style={{ color: ON_NAVY_MUTED, letterSpacing: '1.5px' }}>
                TOTAL POINTS
              </div>
              <div className="stat-num font-heading font-extrabold text-2xl" style={{ color: ON_NAVY_PRIMARY }}>
                {row.totalPoints}
              </div>
            </div>
          </div>
        );
      })}

      {bodyRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <caption className="sr-only">{`${title} leaderboard, ranks ${podiumRows.length + 1} and below`}</caption>
            <colgroup>
              <col style={{ width: '52px' }} />
              <col />
              <col style={{ width: '84px' }} />
            </colgroup>
            <thead>
              <tr style={{ background: NAVY_DARKER }}>
                <th scope="col" className="text-left px-5 py-2 text-[10.5px] font-bold" style={{ color: ON_NAVY_MUTED, letterSpacing: '2px' }}>
                  POS
                </th>
                <th scope="col" className="text-left px-2 py-2 text-[10.5px] font-bold" style={{ color: ON_NAVY_MUTED, letterSpacing: '2px' }}>
                  PLAYER
                </th>
                <th scope="col" className="text-right px-5 py-2 text-[10.5px] font-bold" style={{ color: ON_NAVY_MUTED, letterSpacing: '2px' }}>
                  PTS
                </th>
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, i) => {
                const tier = row.overallWinPercentage !== null ? threatTierFor(row.overallWinPercentage) : null;
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? NAVY_DEEP : NAVY_DARKER }}>
                    <td className="stat-num px-5 py-3 font-heading font-extrabold text-lg text-center" style={{ color: ON_NAVY_FAINT }}>
                      {row.rank}
                    </td>
                    <td className="px-2 py-3" style={{ maxWidth: 0 }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-heading font-bold truncate min-w-0 flex-1" style={{ color: ON_NAVY_PRIMARY }}>
                          {row.name}
                        </span>
                        {tier && <ThreatShieldBadge tier={tier} size={18} />}
                      </div>
                      <div className="stat-num text-xs">
                        <span style={{ color: WIN_ON_NAVY, fontWeight: 700 }}>{row.matchWins}W</span>
                        <span style={{ color: ON_NAVY_SECOND }}> – </span>
                        <span style={{ color: LOSS_ON_NAVY, fontWeight: 700 }}>{row.losses}L</span>
                      </div>
                    </td>
                    <td
                      className="stat-num px-5 py-3 text-right font-heading font-extrabold text-lg"
                      style={{ color: row.totalPoints > 0 ? ON_NAVY_PRIMARY : ON_NAVY_FAINT }}
                    >
                      {row.totalPoints}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-5 py-3 border-t text-center text-xs" style={{ borderColor: NAVY_RULE, color: ON_NAVY_SECOND }}>
        {footerCaption}
      </div>
    </div>
  );
}
