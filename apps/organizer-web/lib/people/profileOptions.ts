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

export const SIGNATURE_SHOT_OPTIONS = [
  { value: 'power_serve', emoji: '🚀', skillName: 'Power Serve', funnyName: 'Rocket Launcher' },
  { value: 'spin_serve', emoji: '🌀', skillName: 'Spin Serve', funnyName: 'Spin Doctor' },
  { value: 'nasty_backhand', emoji: '☠️', skillName: 'Nasty Backhand', funnyName: 'Backhand Bandit' },
  { value: 'forehand_drive', emoji: '💥', skillName: 'Forehand Drive', funnyName: 'Drive By' },
  { value: 'backhand_flick', emoji: '🪄', skillName: 'Backhand Flick', funnyName: 'Flick Wizard' },
  { value: 'forehand_flick', emoji: '🎯', skillName: 'Forehand Flick', funnyName: 'Flick & Furious' },
  { value: 'smash', emoji: '💣', skillName: 'Smash', funnyName: 'Smashmouth' },
  { value: 'dink', emoji: '🥷', skillName: 'Dink', funnyName: 'Dink & Disappear' },
  { value: 'soft_dink', emoji: '🧈', skillName: 'Soft Dink', funnyName: 'Butter Hands' },
  { value: 'speed_up', emoji: '⚡', skillName: 'Speed Up', funnyName: 'Speed Demon' },
  { value: 'drop_shot', emoji: '🎯', skillName: 'Drop Shot', funnyName: 'Drop Dead' },
  { value: 'lob', emoji: '✈️', skillName: 'Lob', funnyName: 'Lob Star' },
  { value: 'volley', emoji: '🔫', skillName: 'Volley', funnyName: 'Quick Draw' },
  { value: 'block', emoji: '🛡️', skillName: 'Block', funnyName: 'Nope Button' },
  { value: 'reset', emoji: '🧊', skillName: 'Reset', funnyName: 'Cool Operator' },
  { value: 'erne', emoji: '🦅', skillName: 'Erne', funnyName: 'Erne Airlines' },
  { value: 'atp', emoji: '🚪', skillName: 'ATP', funnyName: 'Wrong Side!' },
  { value: 'around_the_post', emoji: '🐍', skillName: 'Around-the-Post', funnyName: 'Sneaky Snake' },
  { value: 'kitchen_battle', emoji: '⚔️', skillName: 'Kitchen Battle', funnyName: 'Kitchen Warrior' },
  { value: 'third_shot_drop', emoji: '🎩', skillName: 'Third Shot Drop', funnyName: 'Drop Magician' },
  { value: 'third_shot_drive', emoji: '💥', skillName: 'Third Shot Drive', funnyName: 'Third Shot Thunder' },
  { value: 'fifth_shot', emoji: '🧙', skillName: 'Fifth Shot', funnyName: 'Reset Wizard' },
  { value: 'counter_attack', emoji: '🔄', skillName: 'Counter Attack', funnyName: 'Return to Sender' },
  { value: 'reaction_speed', emoji: '⚡', skillName: 'Reaction Speed', funnyName: 'Lightning Hands' },
  { value: 'hand_battle', emoji: '👊', skillName: 'Hand Battle', funnyName: 'Hand War Hero' },
  { value: 'placement', emoji: '🎯', skillName: 'Placement', funnyName: 'Pinpoint Pest' },
  { value: 'spin', emoji: '🌀', skillName: 'Spin', funnyName: 'Spin Cycle' },
  { value: 'fake_disguise', emoji: '🃏', skillName: 'Fake / Disguise', funnyName: 'Pickle Poker' },
  { value: 'shot_variety', emoji: '🎨', skillName: 'Shot Variety', funnyName: 'Shot Shapeshifter' },
  { value: 'net_play', emoji: '🕸️', skillName: 'Net Play', funnyName: 'Net Monster' },
] as const;
