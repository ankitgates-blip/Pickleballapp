export const HANDEDNESS_OPTIONS = [
  { value: 'left', label: 'Left-handed' },
  { value: 'right', label: 'Right-handed' },
] as const;

export const PLAYING_STYLE_OPTIONS = [
  { value: 'aggressive', label: 'Aggressive' },
  { value: 'defensive', label: 'Defensive' },
  { value: 'all_court', label: 'All-Court' },
  { value: 'power', label: 'Power' },
  { value: 'finesse', label: 'Finesse' },
] as const;

export const STRENGTH_OPTIONS = [
  { value: 'power', label: 'Power' },
  { value: 'consistency', label: 'Consistency' },
  { value: 'net_play', label: 'Net Play' },
  { value: 'serve', label: 'Serve' },
  { value: 'footwork', label: 'Footwork' },
  { value: 'strategy', label: 'Strategy' },
] as const;
