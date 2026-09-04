import { describe, it, expect } from 'vitest';
import { threatTierFor } from './threatLevel';

describe('threatTierFor', () => {
  it('returns DO NOT PLAY at and above 81%', () => {
    expect(threatTierFor(100)).toEqual({
      emoji: '💀',
      label: 'DO NOT PLAY',
      colorClass: 'bg-purple-100 text-purple-800',
      accent: '#c026d3',
    });
    expect(threatTierFor(81)).toEqual({
      emoji: '💀',
      label: 'DO NOT PLAY',
      colorClass: 'bg-purple-100 text-purple-800',
      accent: '#c026d3',
    });
  });

  it('returns HIGH THREAT from 61% to just under 81%', () => {
    expect(threatTierFor(80)).toEqual({
      emoji: '🔴',
      label: 'HIGH THREAT',
      colorClass: 'bg-red-100 text-red-800',
      accent: '#dc2626',
    });
    expect(threatTierFor(61)).toEqual({
      emoji: '🔴',
      label: 'HIGH THREAT',
      colorClass: 'bg-red-100 text-red-800',
      accent: '#dc2626',
    });
  });

  it('returns DANGEROUS from 41% to just under 61%', () => {
    expect(threatTierFor(60)).toEqual({
      emoji: '🟠',
      label: 'DANGEROUS',
      colorClass: 'bg-orange-100 text-orange-800',
      accent: '#ea580c',
    });
    expect(threatTierFor(41)).toEqual({
      emoji: '🟠',
      label: 'DANGEROUS',
      colorClass: 'bg-orange-100 text-orange-800',
      accent: '#ea580c',
    });
  });

  it('returns WATCH OUT from 21% to just under 41%', () => {
    expect(threatTierFor(40)).toEqual({
      emoji: '🟡',
      label: 'WATCH OUT',
      colorClass: 'bg-yellow-100 text-yellow-800',
      accent: '#ca8a04',
    });
    expect(threatTierFor(21)).toEqual({
      emoji: '🟡',
      label: 'WATCH OUT',
      colorClass: 'bg-yellow-100 text-yellow-800',
      accent: '#ca8a04',
    });
  });

  it('returns LOW THREAT below 21%', () => {
    expect(threatTierFor(20)).toEqual({
      emoji: '🟢',
      label: 'LOW THREAT',
      colorClass: 'bg-green-100 text-green-800',
      accent: '#16a34a',
    });
    expect(threatTierFor(0)).toEqual({
      emoji: '🟢',
      label: 'LOW THREAT',
      colorClass: 'bg-green-100 text-green-800',
      accent: '#16a34a',
    });
  });
});
