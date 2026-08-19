# Paddle Brand Field — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Add a "Paddle Brand" dropdown to the Player Profile Editing feature,
with a fixed set of options: Selkirk Boomstick, Selkirk Omni, Joola
Perseus 4/5, Joola Agassi, Bread and Butter, RPM.

## Design

Follows the exact same pattern already established for `handedness`/
`playing_style` in the "Player Profile Editing" feature.

### Migration

```sql
alter table public.people add column paddle_brand text;
```

### New constant, appended to the existing `lib/people/profileOptions.ts`

```typescript
export const PADDLE_BRAND_OPTIONS = [
  { value: 'selkirk_boomstick', label: 'Selkirk Boomstick' },
  { value: 'selkirk_omni', label: 'Selkirk Omni' },
  { value: 'joola_perseus_4_5', label: 'Joola Perseus 4/5' },
  { value: 'joola_agassi', label: 'Joola Agassi' },
  { value: 'bread_and_butter', label: 'Bread and Butter' },
  { value: 'rpm', label: 'RPM' },
] as const;
```

### `updatePersonProfile` gains one more optional field

Same `(formData.get('paddleBrand') as string) || null` pattern already
used for `handedness`/`playingStyle`, written to `people.paddle_brand`.

### Edit form gains one more `<select>`

Placed after "Playing Style" in the existing edit form, same shape:
blank/"Not set" option plus the 6 `PADDLE_BRAND_OPTIONS`, pre-selected
to the current value.

### Profile summary automatically includes it

`profileSummaryParts` (already computed in `/people/[id]/page.tsx`)
gains one more entry for paddle brand, following the same
`person.paddle_brand ? PADDLE_BRAND_OPTIONS.find(...)?.label : null`
pattern as the other three attributes. Since this same computed string
is already passed into `SharePlayerStatsButton`'s `profileSummary`
prop, the paddle brand automatically appears in the Player Stats PDF
too — no separate PDF work needed.

## Out of scope

- Any change to the PDF component itself (it already renders whatever
  `profileSummary` contains).
- Adding/removing paddle brand options later is a one-line code change
  to the constant, not a migration — same convention as the other
  three fixed-option fields.
