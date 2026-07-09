import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass, accentButtonClass } from '@/app/components/ui';

export default async function TournamentsPage() {
  const { supabase, organizer } = await requireOrganizer();

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name, date')
    .eq('organizer_id', organizer.id)
    .order('date', { ascending: false });

  return (
    <OrganizerShell organizerName={organizer.name}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Your Tournaments</h1>
        <Link href="/tournaments/new" className={accentButtonClass}>
          + New Tournament
        </Link>
      </div>

      {(tournaments ?? []).length === 0 && (
        <div className={`${cardClass} text-center text-slate-500`}>
          No tournaments yet — create your first one.
        </div>
      )}

      <ul className="space-y-3">
        {(tournaments ?? []).map((t) => (
          <li key={t.id}>
            <Link
              href={`/tournaments/${t.id}/roster`}
              className={`${cardClass} flex items-center justify-between hover:border-teal-400 transition-colors block`}
            >
              <span className="font-semibold text-slate-900">{t.name}</span>
              <span className="text-sm text-slate-500">{t.date}</span>
            </Link>
          </li>
        ))}
      </ul>
    </OrganizerShell>
  );
}
