import { describe, it, expect } from 'vitest';
import { newSignupsSince, rosterSeenCountKey } from './newSignupsSince';

describe('newSignupsSince', () => {
  it('returns the difference when current is higher than seen', () => {
    expect(newSignupsSince(2, 5)).toBe(3);
  });

  it('returns 0 when nothing changed', () => {
    expect(newSignupsSince(5, 5)).toBe(0);
  });

  it('never returns negative when current is lower than seen (e.g. organizer removed a player)', () => {
    expect(newSignupsSince(5, 2)).toBe(0);
  });

  it('treats an unseen tournament (seenCount 0) as all current players being new', () => {
    expect(newSignupsSince(0, 4)).toBe(4);
  });
});

describe('rosterSeenCountKey', () => {
  it('builds a namespaced localStorage key from the tournament id', () => {
    expect(rosterSeenCountKey('abc-123')).toBe('roster-seen-count-abc-123');
  });
});
