'use client';

import { accentButtonClass } from '@/app/components/ui';

export default function CopyLinkButton({ tournamentId }: { tournamentId: string }) {
  const handleCopy = () => {
    const url = `${window.location.origin}/t/${tournamentId}`;
    navigator.clipboard.writeText(url);
    alert('Public link copied: ' + url);
  };

  return (
    <button onClick={handleCopy} className={accentButtonClass}>
      Copy public link
    </button>
  );
}
