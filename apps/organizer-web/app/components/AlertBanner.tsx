// Shared warning/error/info banner -- replaces ~13 hand-rolled instances of the
// same `rounded-lg bg-{color}-50 border border-{color}-200 text-{color}-{shade}`
// pattern that had drifted slightly (some semibold, some not; amber-700 vs
// amber-800) across roster/teams/bracket/login, plus 4 navy-tint informational
// boxes (bracket/teams) that used the same wrapper shape with the app's navy
// tokens instead of a semantic warning/error color. Font weight lives in each
// tone's own class string, not the shared wrapper, because 'info' reads as a
// plain note (not semibold) while warning/error keep their original bold look.
export function alertToneClass(tone: 'warning' | 'error' | 'info'): string {
  if (tone === 'warning') return 'bg-amber-50 border-amber-200 text-amber-800 font-semibold';
  if (tone === 'error') return 'bg-red-50 border-red-200 text-red-700 font-semibold';
  return 'bg-navy-tint border-navy-mid/25 text-navy-deep';
}

export default function AlertBanner({
  tone,
  className = '',
  children,
}: {
  tone: 'warning' | 'error' | 'info';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border text-sm px-4 py-3 ${alertToneClass(tone)} ${className}`}>
      {children}
    </div>
  );
}
