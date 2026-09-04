export type ThreatTier = {
  emoji: string;
  label: string;
  colorClass: string;
  // Hex color for the tier's number/marker in the heat-scale meter (ThreatBadge,
  // PlayerStatsCard's THREAT LVL box) -- same 5 colors PlayerStatsCard's own
  // THREAT_PALETTE has always used, now shared here so ThreatBadge can match it
  // instead of drifting to its own palette.
  accent: string;
};

export function threatTierFor(winPercentage: number): ThreatTier {
  if (winPercentage >= 81) {
    return { emoji: '💀', label: 'DO NOT PLAY', colorClass: 'bg-purple-100 text-purple-800', accent: '#c026d3' };
  }
  if (winPercentage >= 61) {
    return { emoji: '🔴', label: 'HIGH THREAT', colorClass: 'bg-red-100 text-red-800', accent: '#dc2626' };
  }
  if (winPercentage >= 41) {
    return { emoji: '🟠', label: 'DANGEROUS', colorClass: 'bg-orange-100 text-orange-800', accent: '#ea580c' };
  }
  if (winPercentage >= 21) {
    return { emoji: '🟡', label: 'WATCH OUT', colorClass: 'bg-yellow-100 text-yellow-800', accent: '#ca8a04' };
  }
  return { emoji: '🟢', label: 'LOW THREAT', colorClass: 'bg-green-100 text-green-800', accent: '#16a34a' };
}
