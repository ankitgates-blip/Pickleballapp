import { describe, it, expect } from 'vitest';
import { starRating, renderStars } from './starRating';

describe('starRating', () => {
  it('returns 5 stars at and above 75%', () => {
    expect(starRating(100)).toBe(5);
    expect(starRating(75)).toBe(5);
  });

  it('returns 4 stars from 60% to just under 75%', () => {
    expect(starRating(74)).toBe(4);
    expect(starRating(60)).toBe(4);
  });

  it('returns 3 stars from 50% to just under 60%', () => {
    expect(starRating(59)).toBe(3);
    expect(starRating(50)).toBe(3);
  });

  it('returns 2 stars from 25% to just under 50%', () => {
    expect(starRating(49)).toBe(2);
    expect(starRating(25)).toBe(2);
  });

  it('returns 1 star below 25%', () => {
    expect(starRating(24)).toBe(1);
    expect(starRating(0)).toBe(1);
  });
});

describe('renderStars', () => {
  it('renders the correct number of filled and empty stars', () => {
    expect(renderStars(5)).toBe('★★★★★');
    expect(renderStars(4)).toBe('★★★★☆');
    expect(renderStars(3)).toBe('★★★☆☆');
    expect(renderStars(2)).toBe('★★☆☆☆');
    expect(renderStars(1)).toBe('★☆☆☆☆');
  });
});
