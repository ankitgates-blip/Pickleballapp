# Signature Shot Badges — Design

Status: Approved.

## Goal

Replace the free-text "Signature Shot" profile field with a multi-select
of up to 4 skill badges, picked from a fixed curated list of 30, each with
an emoji, a skill name, and a funny badge name.

## Data model

`people.signature_shot` changes from nullable `text` to
`text[] not null default '{}'`, mirroring the existing `strengths` column
exactly. Every player's `signature_shot` is currently unset (0 non-null
rows across all 48 people as of this spec), so this is a clean type
change with no real data to migrate:

```sql
alter table public.people
  alter column signature_shot type text[]
    using case when signature_shot is null then array[]::text[] else array[signature_shot] end,
  alter column signature_shot set default '{}',
  alter column signature_shot set not null;
```

## Badge list

New constant `SIGNATURE_SHOT_OPTIONS` in
`apps/organizer-web/lib/people/profileOptions.ts`, replacing the free-text
field entirely. Each entry: `{ value, emoji, skillName, funnyName }`. The
`value` is a snake_case slug derived from the skill name, used as the
stored identifier; `emoji`/`skillName`/`funnyName` are display-only.

| value | emoji | skillName | funnyName |
|---|---|---|---|
| `power_serve` | 🚀 | Power Serve | Rocket Launcher |
| `spin_serve` | 🌀 | Spin Serve | Spin Doctor |
| `nasty_backhand` | ☠️ | Nasty Backhand | Backhand Bandit |
| `forehand_drive` | 💥 | Forehand Drive | Drive By |
| `backhand_flick` | 🪄 | Backhand Flick | Flick Wizard |
| `forehand_flick` | 🎯 | Forehand Flick | Flick & Furious |
| `smash` | 💣 | Smash | Smashmouth |
| `dink` | 🥷 | Dink | Dink & Disappear |
| `soft_dink` | 🧈 | Soft Dink | Butter Hands |
| `speed_up` | ⚡ | Speed Up | Speed Demon |
| `drop_shot` | 🎯 | Drop Shot | Drop Dead |
| `lob` | ✈️ | Lob | Lob Star |
| `volley` | 🔫 | Volley | Quick Draw |
| `block` | 🛡️ | Block | Nope Button |
| `reset` | 🧊 | Reset | Cool Operator |
| `erne` | 🦅 | Erne | Erne Airlines |
| `atp` | 🚪 | ATP | Wrong Side! |
| `around_the_post` | 🐍 | Around-the-Post | Sneaky Snake |
| `kitchen_battle` | ⚔️ | Kitchen Battle | Kitchen Warrior |
| `third_shot_drop` | 🎩 | Third Shot Drop | Drop Magician |
| `third_shot_drive` | 💥 | Third Shot Drive | Third Shot Thunder |
| `fifth_shot` | 🧙 | Fifth Shot | Reset Wizard |
| `counter_attack` | 🔄 | Counter Attack | Return to Sender |
| `reaction_speed` | ⚡ | Reaction Speed | Lightning Hands |
| `hand_battle` | 👊 | Hand Battle | Hand War Hero |
| `placement` | 🎯 | Placement | Pinpoint Pest |
| `spin` | 🌀 | Spin | Spin Cycle |
| `fake_disguise` | 🃏 | Fake / Disguise | Pickle Poker |
| `shot_variety` | 🎨 | Shot Variety | Shot Shapeshifter |
| `net_play` | 🕸️ | Net Play | Net Monster |

`ATP` and `Around-the-Post` are kept as two separate entries (as given),
even though they refer to the same real shot — different emoji, different
joke, both preserved as distinct selectable badges.

## Edit form

The free-text input is replaced with a `<fieldset>` of 30 checkboxes —
identical structure to the existing `Strengths` fieldset — each labeled
`emoji SkillName — FunnyName`, `defaultChecked` when its value is in the
player's current `signature_shot` array. Input `name="signatureShot"` on
every checkbox (same multi-value-via-shared-name pattern `strengths`
already uses).

No live JS disabling of checkboxes past 4 — plain HTML, no new Client
Component. If more than 4 are checked and the form is submitted, the
server action rejects it with a clear error (surfaced via the app's
`error.tsx` boundary) and nothing saves; the organizer unchecks down to 4
and saves again.

## Server action

`updatePersonProfile` reads `formData.getAll('signatureShot')` (replacing
the current single `formData.get('signatureShot')` trim-or-null read).
If the result has more than 4 entries, throws
`Error('Choose at most 4 signature shot badges')` before any DB call.
Otherwise writes the array directly to `signature_shot` — no per-value
whitelist validation against `SIGNATURE_SHOT_OPTIONS`, matching how
`strengths` already works today (RLS confines any tampered values to the
submitter's own rows; React escapes all render paths, so there's no XSS
path even for an unrecognized value).

## Page display

The current italic quoted line
(`🎯 "Nasty backhand slam"`) is replaced with a wrapped row of pills
(reusing the existing `pillClass` style already used elsewhere in this
app), one pill per selected badge, each showing `emoji SkillName —
FunnyName`. Omitted entirely when the player has no badges selected, same
omit-if-empty behavior as today.

## PDF export

The `Signature Shot:` row (added in the prior "PDF Profile Labeled Rows"
change) now shows all selected badges comma-joined:
`Signature Shot: 🚀 Power Serve — Rocket Launcher, 🎯 Drop Shot — Drop Dead`,
consistent with how the `Strengths:` row already joins multiple values.
Still omitted entirely when no badges are selected.

## Out of scope

- Live/JS-enforced 4-badge cap (deferred; server-side rejection is
  sufficient per this design).
- Any change to the `Strengths` field itself (separate, pre-existing
  field, untouched by this change).
