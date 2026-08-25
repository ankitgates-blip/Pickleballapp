// apps/organizer-web/lib/tournament/inviteMessage.ts

// Always compute the weekday/date display in the venue's actual time zone (Asia/Dubai,
// UTC+4, no DST) rather than the viewer's local time zone -- a recipient reading the
// WhatsApp message from anywhere in the world should see the correct day for the event
// in Dubai, and the RSVP feature's own 5:00 PM cutoff is likewise defined in Asia/Dubai
// (see supabase/migrations/20260825150000_add_league_rsvps.sql). Parsing at midday UTC
// (rather than midnight) keeps this correct regardless of the reader's or server's own
// time zone, since noon UTC can never roll into a different calendar day once shifted
// by any real-world zone offset.
const DUBAI_TIME_ZONE = 'Asia/Dubai';

export function buildLeagueInviteMessage(params: {
  venueName: string;
  date: string; // tournament.date, 'YYYY-MM-DD'
  timeslotLabel: string;
  contactInfo: string | null;
  link: string;
}): string {
  const { venueName, date, timeslotLabel, contactInfo, link } = params;

  const parsed = new Date(`${date}T12:00:00Z`);
  const weekday = parsed.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: DUBAI_TIME_ZONE,
  });
  const dateLabel = parsed.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: DUBAI_TIME_ZONE,
  });

  const contactLine = contactInfo ? `${contactInfo}\n\n` : '';

  return `🎉 Welcome to the ${venueName} ${weekday} Pickleball Rumble! 🏓

📅 ${weekday}, ${dateLabel}
🕐 ${timeslotLabel}
📍 ${venueName}

We're getting the crew together for a fun round of league play! Just RSVP below and we'll take care of the rest — partners will be automatically assigned by the app, so no need to find your own team.

✅ I'm In  ❌ I'm Out  🤔 Tentative

⏰ RSVP by 5:00 PM on ${weekday} to lock in your spot. Spots are limited — once we're full, extra RSVPs go on the waiting list and get bumped in automatically if someone drops out.

${contactLine}👉 ${link}

See you on the court! 🏓`;
}
