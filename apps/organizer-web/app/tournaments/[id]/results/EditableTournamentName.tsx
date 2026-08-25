'use client';

import { useState } from 'react';

export default function EditableTournamentName({
  tournamentId,
  initialName,
  renameAction,
}: {
  tournamentId: string;
  initialName: string;
  renameAction: (tournamentId: string, formData: FormData) => Promise<{ name: string }>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (formData: FormData) => {
    setIsSaving(true);
    setError(null);
    try {
      const result = await renameAction(tournamentId, formData);
      setName(result.name);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename league.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <h1 className="mb-1">
        <button
          type="button"
          onClick={() => {
            setIsEditing(true);
            setError(null);
          }}
          className="text-2xl font-bold text-slate-900 text-left hover:text-navy-mid transition-colors"
        >
          {name}
        </button>
      </h1>
    );
  }

  return (
    <h1 className="mb-1">
      <form action={handleSubmit}>
        <input
          name="name"
          type="text"
          defaultValue={name}
          autoFocus
          required
          disabled={isSaving}
          onBlur={(e) => e.currentTarget.form?.requestSubmit()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsEditing(false);
              setError(null);
            }
          }}
          className="text-2xl font-bold text-slate-900 border-b-2 border-navy-mid focus:outline-none bg-transparent w-full"
        />
      </form>
      {error && <p className="text-xs font-semibold text-red-600 mt-1">{error}</p>}
    </h1>
  );
}
