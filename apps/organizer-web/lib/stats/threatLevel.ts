export type ThreatTier = {
  emoji: string;
  label: string;
  colorClass: string;
};

export function threatTierFor(winPercentage: number): ThreatTier {
  if (winPercentage >= 81) {
    return { emoji: '💀', label: 'DO NOT PLAY', colorClass: 'bg-purple-100 text-purple-800' };
  }
  if (winPercentage >= 61) {
    return { emoji: '🔴', label: 'HIGH THREAT', colorClass: 'bg-red-100 text-red-800' };
  }
  if (winPercentage >= 41) {
    return { emoji: '🟠', label: 'DANGEROUS', colorClass: 'bg-orange-100 text-orange-800' };
  }
  if (winPercentage >= 21) {
    return { emoji: '🟡', label: 'WATCH OUT', colorClass: 'bg-yellow-100 text-yellow-800' };
  }
  return { emoji: '🟢', label: 'LOW THREAT', colorClass: 'bg-green-100 text-green-800' };
}
