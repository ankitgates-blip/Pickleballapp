# Save Confirmation — Design

Status: Approved.

## Goal

Player profile saves and match score entries currently give no visible
feedback — the page just re-renders with the same data, so an organizer
can't tell whether their save actually happened. Add a brief "✓ Saved"
confirmation next to the relevant button.

## Mechanism

A new reusable Client Component,
`apps/organizer-web/app/components/SaveButton.tsx`, using React's
`useFormStatus()` hook. It reads the pending state of whichever `<form>`
it's rendered inside (no prop wiring needed — this is how
`useFormStatus` works), and when that form's submission transitions from
pending to not-pending (a successful save), briefly shows "✓ Saved" next
to the button before it fades out after 2 seconds.

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

export default function SaveButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  const [showSaved, setShowSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    wasPending.current = pending;
  }, [pending]);

  return (
    <span className="inline-flex items-center gap-2">
      <button type="submit" disabled={pending} className={className}>
        {pending ? pendingLabel : children}
      </button>
      {showSaved && <span className="text-xs font-semibold text-green-600">✓ Saved</span>}
    </span>
  );
}
```

No changes are needed to the surrounding forms or the pages that host
them — they stay plain Server Components with plain `<form action={...}>`
submissions. Each usage swaps its existing `<button type="submit">
{label}</button>` for `<SaveButton className={...} pendingLabel={...}>
{label}</SaveButton>`, keeping the exact same visual styling (the
component takes the button's classes and label as props) — the only
differences are the pending-state label while submitting, and the
"✓ Saved" flash afterward.

Because `useFormStatus` is scoped to the nearest enclosing `<form>`, this
naturally works correctly even on a page with many independent
score-entry forms at once (e.g. the Bracket page's per-match forms) —
only the form actually submitted shows its own confirmation.

## Where it's used

- `apps/organizer-web/app/people/[id]/page.tsx`: the "Save Profile"
  button, the photo "Upload" button, and the "Remove photo" button.
- `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`: each
  match's score-entry "Save" button.
- `apps/organizer-web/app/tournaments/[id]/matches/page.tsx`: each
  match's score-entry "Save" button (same `enterScore` action as
  Bracket, separate page).

## Out of scope

- Any other save action in the app (team reassignment, roster edits,
  tournament creation/cancellation, etc.) — not requested; `SaveButton`
  is built generically enough to reuse there later without redesign.
- A toast/notification-style confirmation (a bigger, app-wide system) —
  the organizer chose the simpler inline-next-to-button style.
