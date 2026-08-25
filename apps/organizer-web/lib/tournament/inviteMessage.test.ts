import { describe, it, expect } from 'vitest';
import { buildLeagueInviteMessage } from './inviteMessage';

describe('buildLeagueInviteMessage', () => {
  it('builds the full template with weekday and date computed in Asia/Dubai time', () => {
    const message = buildLeagueInviteMessage({
      venueName: 'Pickleturf',
      date: '2026-08-27',
      timeslotLabel: '7:00 PM - 9:00 PM',
      contactInfo: null,
      link: 'https://example.com/t/abc123',
    });

    expect(message).toContain('Welcome to the Pickleturf Thursday Pickleball Rumble!');
    expect(message).toContain('📅 Thursday, August 27, 2026');
    expect(message).toContain('🕐 7:00 PM - 9:00 PM');
    expect(message).toContain('📍 Pickleturf');
    expect(message).toContain('partners will be automatically assigned by the app');
    expect(message).toContain('RSVP by 5:00 PM on Thursday');
    expect(message).toContain('👉 https://example.com/t/abc123');
  });

  it('substitutes a different venue and weekday for a different date', () => {
    const message = buildLeagueInviteMessage({
      venueName: 'Picklers',
      date: '2026-03-10',
      timeslotLabel: '6:00 PM - 8:00 PM',
      contactInfo: null,
      link: 'https://example.com/t/xyz789',
    });

    expect(message).toContain('Welcome to the Picklers Tuesday Pickleball Rumble!');
    expect(message).toContain('📅 Tuesday, March 10, 2026');
    expect(message).toContain('RSVP by 5:00 PM on Tuesday');
  });

  it('omits the contact line entirely when contactInfo is null', () => {
    const message = buildLeagueInviteMessage({
      venueName: 'Pickleturf',
      date: '2026-01-01',
      timeslotLabel: '7:00 PM - 9:00 PM',
      contactInfo: null,
      link: 'https://example.com/t/abc123',
    });

    expect(message).not.toContain('null');
    expect(message).not.toMatch(/\n\n\n/);
  });

  it('includes the contact line when contactInfo is set', () => {
    const message = buildLeagueInviteMessage({
      venueName: 'Pickleturf',
      date: '2026-01-01',
      timeslotLabel: '7:00 PM - 9:00 PM',
      contactInfo: '📞 +971 50 123 4567 · pickleturf.ae',
      link: 'https://example.com/t/abc123',
    });

    expect(message).toContain('📞 +971 50 123 4567 · pickleturf.ae');
  });
});
