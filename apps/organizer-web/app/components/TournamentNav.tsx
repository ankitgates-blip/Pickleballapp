import Link from 'next/link';

const steps = [
  { key: 'roster', label: 'Roster' },
  { key: 'teams', label: 'Teams' },
  { key: 'bracket', label: 'Bracket' },
  { key: 'matches', label: 'Scores' },
  { key: 'standings', label: 'Standings' },
] as const;

export default function TournamentNav({
  tournamentId,
  current,
}: {
  tournamentId: string;
  current: (typeof steps)[number]['key'];
}) {
  return (
    <nav className="flex flex-wrap gap-2 mb-6">
      {steps.map((step) => {
        const isActive = step.key === current;
        return (
          <Link
            key={step.key}
            href={`/tournaments/${tournamentId}/${step.key}`}
            className={
              isActive
                ? 'rounded-full bg-teal-600 text-white text-sm font-semibold px-4 py-1.5'
                : 'rounded-full bg-white border border-slate-300 text-slate-600 hover:border-teal-400 hover:text-teal-700 text-sm font-semibold px-4 py-1.5 transition-colors'
            }
          >
            {step.label}
          </Link>
        );
      })}
    </nav>
  );
}
