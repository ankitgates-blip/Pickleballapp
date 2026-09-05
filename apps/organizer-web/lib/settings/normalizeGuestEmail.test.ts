import { describe, it, expect } from 'vitest';
import { normalizeGuestEmail } from './normalizeGuestEmail';

describe('normalizeGuestEmail', () => {
  it('lowercases and trims a valid email', () => {
    expect(normalizeGuestEmail('  Guest@Example.com  ')).toBe('guest@example.com');
  });

  it('throws on null', () => {
    expect(() => normalizeGuestEmail(null)).toThrow('Enter a valid email address.');
  });

  it('throws on an empty string', () => {
    expect(() => normalizeGuestEmail('   ')).toThrow('Enter a valid email address.');
  });

  it('throws when there is no @', () => {
    expect(() => normalizeGuestEmail('not-an-email')).toThrow('Enter a valid email address.');
  });
});
