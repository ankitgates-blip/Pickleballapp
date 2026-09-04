// apps/organizer-web/app/tournaments/TournamentCard.tsx
//
// Dark "broadcast dashboard" card for the Tournaments list -- scoped to this
// page only (brackets, roster, and score entry stay on the app's normal light
// surfaces, which read better under courtside sun and for dense forms). One
// calm navy card ground throughout; color carries exactly one signal, the
// tournament's status, on a 4px rail + a small label -- never a different
// tint per card. Format is a plain chip, not a hue: this app has 9 formats,
// well past where categorical color stays distinguishable.
import Link from 'next/link';
import PlayerCountBadge from './PlayerCountBadge';
import CancelTournamentButton from './CancelTournamentButton';

export type TournamentCardStatus = 'overdue' | 'today' | 'upcoming' | 'completed';

const STATUS_META: Record<TournamentCardStatus, { rail: string; text: string; label: string; glyph: string }> = {
  overdue: { rail: '#9f1239', text: '#f87171', label: 'OVERDUE', glyph: '●' },
  today: { rail: '#bf5919', text: '#fdba74', label: 'TODAY', glyph: '●' },
  upcoming: { rail: '#4a6ba8', text: '#8fa9d6', label: 'UPCOMING', glyph: '○' },
  completed: { rail: '#a8874f', text: '#d6af36', label: 'COMPLETED', glyph: '✓' },
};

export type TournamentCardProps = {
  tournamentId: string;
  status: TournamentCardStatus;
  dateLabel: string;
  format: string;
  title: string;
  champion?: string;
  runnerUp?: string;
  venue: string;
  playerCount: number;
  matchesCount?: number;
  ctaHref: string;
  ctaLabel: string;
  cancelAction: () => Promise<void>;
  isCompleted?: boolean;
};

export default function TournamentCard({
  tournamentId,
  status,
  dateLabel,
  format,
  title,
  champion,
  runnerUp,
  venue,
  playerCount,
  matchesCount,
  ctaHref,
  ctaLabel,
  cancelAction,
  isCompleted = false,
}: TournamentCardProps) {
  const meta = STATUS_META[status];
  return (
    <div className="flex rounded-2xl border overflow-hidden" style={{ background: '#16294e', borderColor: '#4a6ba8', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
      <div className="w-1 flex-shrink-0" style={{ background: meta.rail }} />
      <div className="flex-1 min-w-0 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
          <span className="text-[11px] font-bold tracking-wide font-heading whitespace-nowrap" style={{ color: meta.text }}>
            {meta.glyph} {meta.label} · {dateLabel}
          </span>
          <span
            className="text-[10px] font-bold tracking-wide rounded-full px-2.5 py-1 whitespace-nowrap"
            style={{ color: '#cbd5e1', background: '#1c3560', border: '1px solid #4a6ba8' }}
          >
            {format}
          </span>
        </div>

        <div className="font-heading font-bold text-lg text-white mb-2.5">{title}</div>

        {champion && (
          <>
            <div className="h-px w-10 mb-2.5" style={{ background: 'linear-gradient(to right, #a8874f, transparent)' }} />
            <div className="text-sm font-bold mb-0.5" style={{ color: '#fde68a' }} aria-label="Champion">
              🥇 {champion}
            </div>
            {runnerUp && (
              <div className="text-sm mb-2.5" style={{ color: '#cbd5e1' }} aria-label="Runner-up">
                🥈 {runnerUp}
              </div>
            )}
          </>
        )}

        <div className="flex flex-wrap gap-x-6 gap-y-1.5 my-3">
          <div>
            <div className="text-[9px] font-bold tracking-wide" style={{ color: '#94a3b8' }}>VENUE</div>
            <div className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{venue}</div>
          </div>
          <div>
            <div className="text-[9px] font-bold tracking-wide" style={{ color: '#94a3b8' }}>PLAYERS</div>
            <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#e2e8f0' }}>
              {playerCount}
              <PlayerCountBadge tournamentId={tournamentId} playerCount={playerCount} hideCount />
            </div>
          </div>
          {matchesCount !== undefined && (
            <div>
              <div className="text-[9px] font-bold tracking-wide" style={{ color: '#94a3b8' }}>MATCHES</div>
              <div className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{matchesCount}</div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-1">
          <Link href={ctaHref} className="text-sm font-bold hover:underline" style={{ color: '#d6af36' }}>
            {ctaLabel} →
          </Link>
          <CancelTournamentButton tournamentName={title} cancelAction={cancelAction} isCompleted={isCompleted} />
        </div>
      </div>
    </div>
  );
}
