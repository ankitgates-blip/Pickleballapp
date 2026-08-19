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

export const PADDLE_BRAND_OPTIONS = [
  { value: 'selkirk_boomstick', label: 'Selkirk Boomstick' },
  { value: 'selkirk_omni', label: 'Selkirk Omni' },
  { value: 'joola_perseus_4_5', label: 'Joola Perseus 4/5' },
  { value: 'joola_agassi', label: 'Joola Agassi' },
  { value: 'bread_and_butter', label: 'Bread and Butter' },
  { value: 'rpm', label: 'RPM' },
] as const;
