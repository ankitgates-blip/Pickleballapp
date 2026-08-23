import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass, inputClass, accentButtonClass } from '@/app/components/ui';
import { TIME_SLOTS } from '@/lib/tournament/timeslots';
import { createTournament } from './actions';
import FormatFields from './FormatFields';
import SaveButton from '@/app/components/SaveButton';

export default async function NewTournamentPage() {
  const { supabase, organizer } = await requireOrganizer();

  const { data: venues } = await supabase.from('venues').select('id, name').order('name');

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">New League</h1>
      <div className={cardClass}>
        <form action={createTournament} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              League name
            </label>
            <input name="name" type="text" placeholder="e.g. Saturday Round Robin" required className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Date</label>
            <input name="date" type="date" required className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Max players (optional)
            </label>
            <input
              name="maxPlayers"
              type="number"
              min={1}
              placeholder="Leave blank for no limit"
              className={inputClass}
            />
          </div>
          <FormatFields />
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Location</label>
            <select name="venueId" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Select a location
              </option>
              {(venues ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Timeslot</label>
            <select name="timeslot" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Select a timeslot
              </option>
              {TIME_SLOTS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
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
          <SaveButton className={`${accentButtonClass} w-full`} pendingLabel="Creating League…">
            Create League
          </SaveButton>
        </form>
      </div>
    </OrganizerShell>
  );
}
