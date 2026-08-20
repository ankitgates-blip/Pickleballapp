import { threatTierFor } from '@/lib/stats/threatLevel';
import { pillClass } from './ui';

export default function ThreatBadge({ winPercentage }: { winPercentage: number | null }) {
  if (winPercentage === null) {
    return null;
  }

  const tier = threatTierFor(winPercentage);

  return (
    <span className={`${pillClass} ${tier.colorClass}`}>
      {tier.emoji} {tier.label}
    </span>
  );
}
