# Signature Shot Field — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Add a free-text "Signature Shot" field to the player profile edit form
(e.g. "Nasty backhand slam", "Ernie shot down the line").

## Design

Unlike `handedness`/`playing_style`/`paddle_brand` (fixed dropdowns),
this is free text — no options constant needed.

### Migration

```sql
alter table public.people add column signature_shot text;
```

### `updatePersonProfile` gains one more optional field

Same `(formData.get('signatureShot') as string)?.trim() || null`
pattern already used for the other optional fields, written to
`people.signature_shot`.

### Edit form

A text input (not a `<select>`) placed after "Paddle Brand" in the
existing edit form, labeled "Signature Shot", placeholder like "e.g.
Nasty backhand slam".

### Display

Shown as its own line below the existing profile summary (handedness
· age · playing style · paddle brand · strengths), not folded into
that joined line — a free-text sentence wouldn't read well crammed in
with short badge-style values. Styled as a quote, e.g.:

> 🎯 "Nasty backhand slam"

Omitted entirely when not set, same as the rest of the profile
section.

## Out of scope

- Profile photo upload (separate spec).
- DUPR ID (deferred by the organizer for now).
