import Link from 'next/link';

const steps = [
  { key: 'roster', label: 'Roster' },
  { key: 'teams', label: 'Teams' },
  { key: 'bracket', label: 'Bracket' },
  { key: 'standings', label: 'Standings' },
  { key: 'results', label: 'Results' },
] as const;

export default function TournamentNav({
  tournamentId,
  current,
}: {
  tournamentId: string;
  current: (typeof steps)[number]['key'];
}) {
  return (
    <nav className="flex border-b border-slate-200 mb-6">
      {steps.map((step) => {
        const isActive = step.key === current;
        return (
          <Link
            key={step.key}
            href={`/tournaments/${tournamentId}/${step.key}`}
            className={
              isActive
                ? 'flex-1 text-center pb-2.5 text-sm font-bold text-navy-deep border-b-2 border-brand-orange -mb-px'
                : 'flex-1 text-center pb-2.5 text-sm font-semibold text-muted hover:text-navy-mid border-b-2 border-transparent -mb-px transition-colors'
            }
          >
            {step.label}
          </Link>
        );
      })}
    </nav>
  );
}
