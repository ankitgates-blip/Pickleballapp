export const TOURNAMENT_FORMATS = [
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'popcorn', label: 'Popcorn' },
  { value: 'gauntlet', label: 'Gauntlet' },
  { value: 'up_and_down_the_river', label: 'Up and Down the River' },
  { value: 'claim_the_throne', label: 'Claim the Throne' },
  { value: 'cream_of_the_crop', label: 'Cream of the Crop' },
  { value: 'double_header', label: 'Double Header' },
  { value: 'league_playoffs', label: 'League + Playoffs' },
  { value: 'custom', label: 'Custom League' },
] as const;

export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number]['value'];

export function formatLabel(format: string): string {
  return TOURNAMENT_FORMATS.find((f) => f.value === format)?.label ?? format;
}

const INDIVIDUAL_FORMATS: readonly string[] = [
  'popcorn',
  'gauntlet',
  'claim_the_throne',
  'up_and_down_the_river',
];

export function isIndividualFormat(format: string): boolean {
  return INDIVIDUAL_FORMATS.includes(format);
}

const LADDER_FORMATS: readonly string[] = ['claim_the_throne', 'up_and_down_the_river'];

export function isLadderFormat(format: string): boolean {
  return LADDER_FORMATS.includes(format);
}

// Custom League switches to player-level standings once dynamic (ad-hoc) pairing has
// ever occurred, since team identity there isn't stable across the tournament -- an
// ad-hoc team might play exactly one match. This is intentionally NOT the same as
// isIndividualFormat: that flag also drives the Teams page's auto-paired banner, which
// must stay off for Custom (fixed-team manual pairing still exists there). See
// docs/superpowers/specs/2026-08-25-custom-league-ad-hoc-teams-fix-design.md.
export function usesIndividualStandings(format: string): boolean {
  return isIndividualFormat(format) || format === 'custom';
}
