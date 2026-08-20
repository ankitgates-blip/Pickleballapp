'use client';

import { useEffect } from 'react';
import { primaryButtonClass } from '@/app/components/ui';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
      <h1 className="text-xl font-bold text-slate-900">Something went wrong</h1>
      <p className="text-sm text-slate-600 max-w-sm">{error.message || 'An unexpected error occurred.'}</p>
      <button type="button" onClick={reset} className={primaryButtonClass}>
        Try again
      </button>
    </div>
  );
}
