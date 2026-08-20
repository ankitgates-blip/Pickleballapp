# Nickname Field — Design

Status: Approved.

## Goal

Add a free-text "Nickname" field to the player profile, displayed
alongside the player's real name as `Name (Nickname)` in the three places
the name appears as a heading.

## Data model

New nullable `people.nickname text` column — same simple free-text
pattern the original (pre-badges) Signature Shot field used.

```sql
alter table public.people add column nickname text;
```

## Display

`Name (Nickname)` when set, plain `Name` when not, in exactly these three
places:

- Organizer's Player Detail page (`/people/[id]`) — the `<h1>` heading
- Public share page (`/p/[id]`) — the `<h1>` heading
- PDF export's name line

Out of scope: `players.name` (the denormalized copy read by Bracket,
Standings, Matches, Tournament lists, and Match History rows) is
untouched — those keep showing the real name only. Propagating the
nickname there would be a much larger, riskier change and wasn't asked
for.

## Edit form

A plain text input in the existing Edit Profile form on `/people/[id]`,
placed right after the Name field.

## Server action

`updatePersonProfile` gains:

```typescript
const nickname = (formData.get('nickname') as string)?.trim() || null;
```

written to `people.nickname` — same trim-or-null pattern as every other
optional text field already in that action. No length limit.

## Out of scope

- Propagating the nickname to `players.name` or any other page that
  displays a player's name (Bracket, Standings, Matches, Tournaments
  list, Match History).
- A character limit.
