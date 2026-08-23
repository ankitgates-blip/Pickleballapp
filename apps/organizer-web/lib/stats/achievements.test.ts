import { describe, it, expect } from 'vitest';
import { computeAchievements } from './achievements';

describe('computeAchievements', () => {
  it('marks nothing earned when every stat is below its threshold', () => {
    const result = computeAchievements({
      longestWinStreak: 2,
      winsVsHigherRated: 1,
      totalMatches: 5,
      careerLeaguesWon: 0,
    });
    expect(result.every((a) => !a.earned)).toBe(true);
    expect(result.find((a) => a.key === 'hot-streak')?.description).toBe('2/5 wins in a row');
  });

  it('marks hot-streak earned once the streak reaches the threshold', () => {
    const result = computeAchievements({
      longestWinStreak: 5,
      winsVsHigherRated: 0,
      totalMatches: 0,
      careerLeaguesWon: 0,
    });
    expect(result.find((a) => a.key === 'hot-streak')?.earned).toBe(true);
  });

  it('caps the progress description at the threshold once it is exceeded', () => {
    const result = computeAchievements({
      longestWinStreak: 12,
      winsVsHigherRated: 0,
      totalMatches: 0,
      careerLeaguesWon: 0,
    });
    expect(result.find((a) => a.key === 'hot-streak')?.description).toBe('5/5 wins in a row');
  });

  it('marks champion earned and pluralizes once careerLeaguesWon is at least 1', () => {
    const one = computeAchievements({
      longestWinStreak: 0,
      winsVsHigherRated: 0,
      totalMatches: 0,
      careerLeaguesWon: 1,
    });
    expect(one.find((a) => a.key === 'champion')).toEqual({
      key: 'champion',
      emoji: '🏆',
      label: 'Champion',
      description: '1 league won',
      earned: true,
    });

    const two = computeAchievements({
      longestWinStreak: 0,
      winsVsHigherRated: 0,
      totalMatches: 0,
      careerLeaguesWon: 2,
    });
    expect(two.find((a) => a.key === 'champion')?.description).toBe('2 leagues won');
  });

  it('marks giant-slayer and iron-player earned at their thresholds', () => {
    const result = computeAchievements({
      longestWinStreak: 0,
      winsVsHigherRated: 3,
      totalMatches: 20,
      careerLeaguesWon: 0,
    });
    expect(result.find((a) => a.key === 'giant-slayer')?.earned).toBe(true);
    expect(result.find((a) => a.key === 'iron-player')?.earned).toBe(true);
  });
});
