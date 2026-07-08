import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';

export default async function TournamentsPage() {
  const { supabase, organizer } = await requireOrganizer();

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name, date')
    .eq('organizer_id', organizer.id)
    .order('date', { ascending: false });

  return (
    <main style={{ maxWidth: 600, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>Your Tournaments</h1>
      <Link href="/tournaments/new">+ New Tournament</Link>
      <ul>
        {(tournaments ?? []).map((t) => (
          <li key={t.id}>
            <Link href={`/tournaments/${t.id}/roster`}>
              {t.name} — {t.date}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
