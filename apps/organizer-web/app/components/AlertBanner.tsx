// Shared warning/error banner -- replaces ~13 hand-rolled instances of the
// same `rounded-lg bg-{color}-50 border border-{color}-200 text-{color}-{shade}`
// pattern that had drifted slightly (some semibold, some not; amber-700 vs
// amber-800) across roster/teams/bracket/login.
export function alertToneClass(tone: 'warning' | 'error'): string {
  return tone === 'warning'
    ? 'bg-amber-50 border-amber-200 text-amber-800'
    : 'bg-red-50 border-red-200 text-red-700';
}

export default function AlertBanner({
  tone,
  className = '',
  children,
}: {
  tone: 'warning' | 'error';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border text-sm px-4 py-3 font-semibold ${alertToneClass(tone)} ${className}`}>
      {children}
    </div>
  );
}
