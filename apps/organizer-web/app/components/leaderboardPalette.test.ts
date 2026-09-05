import { describe, it, expect } from 'vitest';
import { medalStops, GOLD_CORE, SILVER_CORE, BRONZE_CORE } from './leaderboardPalette';

describe('medalStops', () => {
  it('returns the gold stops for rank 1', () => {
    expect(medalStops(1)).toEqual({ deep: '#a8874f', core: GOLD_CORE, light: '#f7e6a8' });
  });

  it('returns the silver stops for rank 2', () => {
    expect(medalStops(2)).toEqual({ deep: '#7e8288', core: SILVER_CORE, light: '#e8eaed' });
  });

  it('returns the bronze stops for rank 3', () => {
    expect(medalStops(3)).toEqual({ deep: '#7a4b23', core: BRONZE_CORE, light: '#e0aa72' });
  });

  it('returns null for rank 4 and beyond', () => {
    expect(medalStops(4)).toBeNull();
    expect(medalStops(10)).toBeNull();
  });
});
