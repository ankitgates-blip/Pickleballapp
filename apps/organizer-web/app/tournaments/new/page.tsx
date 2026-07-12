import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass, inputClass, accentButtonClass } from '@/app/components/ui';
import { TOURNAMENT_FORMATS } from '@/lib/tournament/formats';
import { TIME_SLOTS } from '@/lib/tournament/timeslots';
import { createTournament } from './actions';

export default async function NewTournamentPage() {
  const { supabase, organizer } = await requireOrganizer();

  const { data: venues } = await supabase.from('venues').select('id, name').order('name');

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
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Format</label>
            <select name="format" required defaultValue="round_robin" className={inputClass}>
              {TOURNAMENT_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
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
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Number of rounds (Popcorn only)
            </label>
            <input name="popcornRounds" type="number" defaultValue={5} min={1} className={inputClass} />
          </div>
          <button type="submit" className={`${accentButtonClass} w-full`}>
            Create Tournament
          </button>
        </form>
      </div>
    </OrganizerShell>
  );
}
