import PlayerStatsCard, { type PlayerStatsCardProps } from '@/app/components/PlayerStatsCard';

type PlayerOfTheMonthCardProps = Omit<PlayerStatsCardProps, 'celebrationLabel'> & {
  monthLabel: string; // e.g. "AUGUST 2026"
};

// Thin wrapper: the celebratory treatment lives inside PlayerStatsCard itself (see
// its optional celebrationLabel prop) so the exported/shared PNG is one single image
// with the banner baked in, not a card plus separate CSS decoration that wouldn't be
// captured by the share button's SVG-to-canvas export.
export default function PlayerOfTheMonthCard({ monthLabel, ...cardProps }: PlayerOfTheMonthCardProps) {
  return <PlayerStatsCard {...cardProps} celebrationLabel={`PLAYER OF THE MONTH — ${monthLabel}`} />;
}
