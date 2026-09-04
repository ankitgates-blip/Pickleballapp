import { threatTierFor } from '@/lib/stats/threatLevel';
import ThreatShieldBadge from './ThreatShieldBadge';

// One representative win% per band, just to pull that tier's real label/accent/range
// out of threatTierFor -- keeps the legend's numbers sourced from the same single
// function every other Threat Level surface uses, instead of a second hardcoded copy
// of the band cutoffs that could drift out of sync with it.
const TIER_ROWS: { sample: number; range: string }[] = [
  { sample: 10, range: 'SCORE 0-20' },
  { sample: 30, range: 'SCORE 21-45' },
  { sample: 55, range: 'SCORE 46-70' },
  { sample: 80, range: 'SCORE 71-90' },
  { sample: 95, range: 'SCORE 91+' },
];

// Reference legend explaining the 5 Threat Tiers -- addresses the gap flagged
// earlier: the tier meter appears in several places with no explanation anywhere
// of what it means or how the bands are set.
export default function ThreatTiersLegend() {
  return (
    <div className="rounded-xl border border-[#2c4a7d] bg-[#0c1830] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-heading text-sm font-bold tracking-wide text-white">THREAT TIERS</h3>
        <span className="text-[10px] font-bold tracking-widest text-slate-400">BADGE</span>
      </div>
      <div className="flex flex-col gap-2">
        {TIER_ROWS.map(({ sample, range }) => {
          const tier = threatTierFor(sample);
          return (
            <div
              key={tier.label}
              className="flex items-center justify-between rounded-lg px-3 py-2"
              style={{ background: `${tier.accent}1a`, border: `1px solid ${tier.accent}66` }}
            >
              <div>
                <div className="font-heading text-sm font-extrabold text-white">{tier.label}</div>
                <div className="text-[11px] font-semibold text-slate-400">{range}</div>
              </div>
              <ThreatShieldBadge tier={tier} size={36} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
