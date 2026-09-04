import { threatTierFor } from '@/lib/stats/threatLevel';

export type ThreatBadgeProps = {
  winPercentage: number | null;
  // 'default' is the full number-over-gradient-bar meter (profile page header --
  // there's room for it there). 'compact' is a single-row version of the same
  // meter for dense inline use (roster rows, team pairings) where a name and this
  // badge share one line. Same colors, same gradient, just less vertical space.
  size?: 'default' | 'compact';
};

// Same fixed amber -> orange -> red scale as PlayerStatsCard's own heat-scale bar
// (regardless of tier) -- position along it is the signal, not its color, which
// only ever spans this one gradient. The number above/beside it is colored per
// tier (threatTierFor's accent) so a 90% and a 45% don't just differ by marker
// position -- they're differently-colored numbers too.
const HEAT_GRADIENT = 'linear-gradient(to right, #fbbf24, #f97316, #dc2626)';

export default function ThreatBadge({ winPercentage, size = 'compact' }: ThreatBadgeProps) {
  if (winPercentage === null) {
    return null;
  }

  const tier = threatTierFor(winPercentage);
  const markerPct = Math.max(0, Math.min(100, winPercentage));
  const accessibleLabel = `${winPercentage}% win rate — ${tier.label}`;

  if (size === 'default') {
    return (
      <div
        className="inline-flex flex-col items-center gap-1 rounded-lg border border-[#3f3f46] bg-[#1c1917] px-4 py-2"
        role="img"
        aria-label={accessibleLabel}
        title={accessibleLabel}
      >
        <span className="font-heading text-xl font-extrabold leading-none" style={{ color: tier.accent }}>
          {winPercentage}
        </span>
        <span className="font-heading text-[8px] font-semibold tracking-widest text-slate-400">
          THREAT LVL
        </span>
        <div className="relative h-1.5 w-[100px] rounded-full" style={{ background: HEAT_GRADIENT }}>
          <div
            className="absolute -top-0.5 h-2.5 w-[2.5px] rounded-sm bg-white"
            style={{ left: `calc(${markerPct}% - 1.25px)` }}
          />
        </div>
      </div>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-[#1c1917] px-2 py-1"
      role="img"
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      <span className="font-heading text-xs font-extrabold leading-none" style={{ color: tier.accent }}>
        {winPercentage}
      </span>
      <span className="relative h-1 w-10 rounded-full" style={{ background: HEAT_GRADIENT }}>
        <span
          className="absolute -top-[1.5px] h-2 w-[2px] rounded-sm bg-white"
          style={{ left: `calc(${markerPct}% - 1px)` }}
        />
      </span>
    </span>
  );
}
