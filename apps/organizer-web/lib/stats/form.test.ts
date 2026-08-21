import { describe, it, expect } from 'vitest';
import { formTierFor } from './form';

describe('formTierFor', () => {
  it('returns ON FIRE at 81 and above', () => {
    expect(formTierFor(81)).toEqual({ emoji: '🔥', label: 'ON FIRE' });
    expect(formTierFor(100)).toEqual({ emoji: '🔥', label: 'ON FIRE' });
  });

  it('returns IN FORM from 61 to 80', () => {
    expect(formTierFor(61)).toEqual({ emoji: '📈', label: 'IN FORM' });
    expect(formTierFor(80)).toEqual({ emoji: '📈', label: 'IN FORM' });
  });

  it('returns STEADY from 41 to 60', () => {
    expect(formTierFor(41)).toEqual({ emoji: '➖', label: 'STEADY' });
    expect(formTierFor(60)).toEqual({ emoji: '➖', label: 'STEADY' });
  });

  it('returns COOLING OFF from 21 to 40', () => {
    expect(formTierFor(21)).toEqual({ emoji: '📉', label: 'COOLING OFF' });
    expect(formTierFor(40)).toEqual({ emoji: '📉', label: 'COOLING OFF' });
  });

  it('returns COLD below 21', () => {
    expect(formTierFor(20)).toEqual({ emoji: '🧊', label: 'COLD' });
    expect(formTierFor(0)).toEqual({ emoji: '🧊', label: 'COLD' });
  });
});
