export const TIME_SLOTS = [
  { value: 'morning', label: 'Morning (7–10 AM)' },
  { value: 'afternoon', label: 'Afternoon (12–3 PM)' },
  { value: 'evening', label: 'Evening (6–9 PM)' },
] as const;

export type Timeslot = (typeof TIME_SLOTS)[number]['value'];

export function timeslotLabel(timeslot: string): string {
  return TIME_SLOTS.find((t) => t.value === timeslot)?.label ?? timeslot;
}
