import { describe, it, expect } from 'vitest';
import { renderTrend, trendColorClass } from './trend';

describe('renderTrend', () => {
  it('renders an up arrow with a positive points change', () => {
    expect(renderTrend('up', 25)).toBe('▲ +25pp');
  });

  it('renders a down arrow with a negative points change', () => {
    expect(renderTrend('down', -50)).toBe('▼ -50pp');
  });

  it('renders a flat dash with zero points change', () => {
    expect(renderTrend('flat', 0)).toBe('— 0pp');
  });

  it('renders nothing when there is no prior period to compare against', () => {
    expect(renderTrend(null, null)).toBe('');
  });
});

describe('trendColorClass', () => {
  it('returns a teal class for up', () => {
    expect(trendColorClass('up')).toBe('text-teal-700');
  });

  it('returns a red class for down', () => {
    expect(trendColorClass('down')).toBe('text-red-600');
  });

  it('returns a slate class for flat', () => {
    expect(trendColorClass('flat')).toBe('text-slate-400');
  });

  it('returns a slate class for null', () => {
    expect(trendColorClass(null)).toBe('text-slate-400');
  });
});
