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
