export const TOURNAMENT_FORMATS = [
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'popcorn', label: 'Popcorn' },
  { value: 'gauntlet', label: 'Gauntlet' },
  { value: 'up_and_down_the_river', label: 'Up and Down the River' },
  { value: 'claim_the_throne', label: 'Claim the Throne' },
  { value: 'cream_of_the_crop', label: 'Cream of the Crop' },
  { value: 'double_header', label: 'Double Header' },
  { value: 'league_playoffs', label: 'League + Playoffs' },
] as const;

export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number]['value'];

export function formatLabel(format: string): string {
  return TOURNAMENT_FORMATS.find((f) => f.value === format)?.label ?? format;
}
