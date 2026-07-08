'use client';

export default function CopyLinkButton({ tournamentId }: { tournamentId: string }) {
  const handleCopy = () => {
    const url = `${window.location.origin}/t/${tournamentId}`;
    navigator.clipboard.writeText(url);
    alert('Public link copied: ' + url);
  };

  return <button onClick={handleCopy}>Copy public link</button>;
}
