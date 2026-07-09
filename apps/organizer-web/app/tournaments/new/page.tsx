import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass, inputClass, accentButtonClass } from '@/app/components/ui';
import { createTournament } from './actions';

export default async function NewTournamentPage() {
  const { organizer } = await requireOrganizer();

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">New Tournament</h1>
      <div className={cardClass}>
        <form action={createTournament} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Tournament name
            </label>
            <input name="name" type="text" placeholder="e.g. Saturday Round Robin" required className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Date</label>
            <input name="date" type="date" required className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Target score
              </label>
              <input name="targetScore" type="number" defaultValue={11} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Win by</label>
              <input name="winBy" type="number" defaultValue={2} required className={inputClass} />
            </div>
          </div>
          <button type="submit" className={`${accentButtonClass} w-full`}>
            Create Tournament
          </button>
        </form>
      </div>
    </OrganizerShell>
  );
}
