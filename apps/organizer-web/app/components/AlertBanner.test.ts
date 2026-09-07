import { describe, it, expect } from 'vitest';
import { alertToneClass } from './AlertBanner';

describe('alertToneClass', () => {
  it('returns the amber warning classes', () => {
    expect(alertToneClass('warning')).toBe('bg-amber-50 border-amber-200 text-amber-800 font-semibold');
  });

  it('returns the red error classes', () => {
    expect(alertToneClass('error')).toBe('bg-red-50 border-red-200 text-red-700 font-semibold');
  });

  it('returns the navy info classes', () => {
    expect(alertToneClass('info')).toBe('bg-navy-tint border-navy-mid/25 text-navy-deep');
  });
});
