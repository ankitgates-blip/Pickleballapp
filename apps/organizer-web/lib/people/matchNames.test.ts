import { describe, it, expect } from 'vitest';
import { matchNamesToPeople } from './matchNames';

describe('matchNamesToPeople', () => {
  it('matches names case-insensitively and trims whitespace', () => {
    const result = matchNamesToPeople(
      [' alice ', 'BOB'],
      [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
      ]
    );

    expect(result.matched).toEqual([
      { name: ' alice ', personId: 'p1' },
      { name: 'BOB', personId: 'p2' },
    ]);
    expect(result.newNames).toEqual([]);
  });

  it('treats unmatched names as new', () => {
    const result = matchNamesToPeople(['Zara'], [{ id: 'p1', name: 'Alice' }]);

    expect(result.matched).toEqual([]);
    expect(result.newNames).toEqual(['Zara']);
  });

  it('handles a mix of matched and new names', () => {
    const result = matchNamesToPeople(['Alice', 'Zara'], [{ id: 'p1', name: 'Alice' }]);

    expect(result.matched).toEqual([{ name: 'Alice', personId: 'p1' }]);
    expect(result.newNames).toEqual(['Zara']);
  });

  it('treats two identically-named new entries as two separate new names', () => {
    const result = matchNamesToPeople(['Mike', 'Mike'], []);

    expect(result.matched).toEqual([]);
    expect(result.newNames).toEqual(['Mike', 'Mike']);
  });
});
