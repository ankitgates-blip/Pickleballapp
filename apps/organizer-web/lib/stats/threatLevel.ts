export type ThreatTier = {
  emoji: string;
  label: string;
  colorClass: string;
  // Hex color for the tier's number/marker in the heat-scale meter (ThreatBadge,
  // PlayerStatsCard's THREAT LVL box) and its shield badge -- one accent per tier,
  // shared everywhere so nothing invents its own palette.
  accent: string;
};

// Tier names, score bands, and colors match the organizer-approved reference
// ("Pickleball Player Threat Level System"): Rookie (slate) -> Contender (cobalt)
// -> Enforcer (emerald) -> Apex Threat (crimson) -> Court Dominator (purple/gold).
// Deliberately NOT a green->red hue ramp -- see the tier-design research this
// replaced -- but this specific 5-color set was the organizer's own explicit pick,
// not a colorblind-optimized ramp, so it's implemented as given rather than revised.
export function threatTierFor(winPercentage: number): ThreatTier {
  if (winPercentage >= 91) {
    return { emoji: '🟣', label: 'COURT DOMINATOR', colorClass: 'bg-purple-100 text-purple-800', accent: '#a855f7' };
  }
  if (winPercentage >= 71) {
    return { emoji: '🔴', label: 'APEX THREAT', colorClass: 'bg-red-100 text-red-800', accent: '#dc2626' };
  }
  if (winPercentage >= 46) {
    return { emoji: '🟢', label: 'ENFORCER', colorClass: 'bg-emerald-100 text-emerald-800', accent: '#10b981' };
  }
  if (winPercentage >= 21) {
    return { emoji: '🔵', label: 'CONTENDER', colorClass: 'bg-blue-100 text-blue-800', accent: '#2563eb' };
  }
  return { emoji: '⚪', label: 'ROOKIE', colorClass: 'bg-slate-100 text-slate-700', accent: '#64748b' };
}
