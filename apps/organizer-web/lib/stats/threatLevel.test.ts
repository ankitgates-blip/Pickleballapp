import { describe, it, expect } from 'vitest';
import { threatTierFor } from './threatLevel';

describe('threatTierFor', () => {
  it('returns COURT DOMINATOR at and above 91%', () => {
    expect(threatTierFor(100)).toEqual({
      emoji: '🟣',
      label: 'COURT DOMINATOR',
      colorClass: 'bg-purple-100 text-purple-800',
      accent: '#a855f7',
    });
    expect(threatTierFor(91)).toEqual({
      emoji: '🟣',
      label: 'COURT DOMINATOR',
      colorClass: 'bg-purple-100 text-purple-800',
      accent: '#a855f7',
    });
  });

  it('returns APEX THREAT from 71% to just under 91%', () => {
    expect(threatTierFor(90)).toEqual({
      emoji: '🔴',
      label: 'APEX THREAT',
      colorClass: 'bg-red-100 text-red-800',
      accent: '#dc2626',
    });
    expect(threatTierFor(71)).toEqual({
      emoji: '🔴',
      label: 'APEX THREAT',
      colorClass: 'bg-red-100 text-red-800',
      accent: '#dc2626',
    });
  });

  it('returns ENFORCER from 46% to just under 71%', () => {
    expect(threatTierFor(70)).toEqual({
      emoji: '🟢',
      label: 'ENFORCER',
      colorClass: 'bg-emerald-100 text-emerald-800',
      accent: '#10b981',
    });
    expect(threatTierFor(46)).toEqual({
      emoji: '🟢',
      label: 'ENFORCER',
      colorClass: 'bg-emerald-100 text-emerald-800',
      accent: '#10b981',
    });
  });

  it('returns CONTENDER from 21% to just under 46%', () => {
    expect(threatTierFor(45)).toEqual({
      emoji: '🔵',
      label: 'CONTENDER',
      colorClass: 'bg-blue-100 text-blue-800',
      accent: '#2563eb',
    });
    expect(threatTierFor(21)).toEqual({
      emoji: '🔵',
      label: 'CONTENDER',
      colorClass: 'bg-blue-100 text-blue-800',
      accent: '#2563eb',
    });
  });

  it('returns ROOKIE below 21%', () => {
    expect(threatTierFor(20)).toEqual({
      emoji: '⚪',
      label: 'ROOKIE',
      colorClass: 'bg-slate-100 text-slate-700',
      accent: '#64748b',
    });
    expect(threatTierFor(0)).toEqual({
      emoji: '⚪',
      label: 'ROOKIE',
      colorClass: 'bg-slate-100 text-slate-700',
      accent: '#64748b',
    });
  });
});
