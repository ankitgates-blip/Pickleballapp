// apps/organizer-web/app/people/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass, playerCardClass, playerCardAvatarClass } from '@/app/components/ui';

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
        <div className={`${cardClass} text-center text-slate-500`}>
          No people yet — they're created automatically the first time you add them to a
          tournament roster.
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
