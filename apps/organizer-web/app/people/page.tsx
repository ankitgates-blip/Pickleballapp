// apps/organizer-web/app/people/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import EmptyState from '@/app/components/EmptyState';
import { cardClass, playerCardClass, playerCardAvatarClass, primaryButtonClass } from '@/app/components/ui';

function PeopleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="10" cy="8" r="3.5" stroke="currentColor" strokeWidth={2} />
      <path d="M3.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M18 8v4M16 10h4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

export default async function PeopleListPage() {
  const { supabase, organizer } = await requireOrganizer();

  const { data: people } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', organizer.id)
    .order('name', { ascending: true });

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Player Profiles</h1>

      {(people ?? []).length === 0 && (
        <div className={cardClass}>
          <EmptyState
            icon={<PeopleIcon />}
            cta={
              <Link href="/tournaments/new" className={primaryButtonClass}>
                + Create League
              </Link>
            }
          >
            No people yet — they're created automatically the first time you add them to a
            league roster.
          </EmptyState>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {(people ?? []).map((person) => (
          <Link key={person.id} href={`/people/${person.id}`} className={playerCardClass}>
            <span className={playerCardAvatarClass}>{initial(person.name)}</span>
            <span className="font-semibold text-white text-sm">{person.name}</span>
          </Link>
        ))}
      </div>
    </OrganizerShell>
  );
}
