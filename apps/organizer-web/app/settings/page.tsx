import { redirect } from 'next/navigation';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import SaveButton from '@/app/components/SaveButton';
import { addGuestInvite, removeGuestInvite, removeGuestMember } from './actions';

export default async function SettingsPage() {
  const { supabase, organizer, role } = await requireOrganizer();

  if (role !== 'owner') {
    redirect('/tournaments');
  }

  const { data: guests } = await supabase
    .from('organizer_members')
    .select('id, email')
    .eq('organizer_id', organizer.id)
    .eq('role', 'guest')
    .order('created_at', { ascending: true });

  const { data: invites } = await supabase
    .from('guest_invites')
    .select('id, email')
    .eq('organizer_id', organizer.id)
    .order('created_at', { ascending: true });

  return (
    <OrganizerShell organizerName={organizer.name} role={role}>
      <h1 className="text-xl font-bold mb-2">Guests</h1>
      <p className="text-sm text-slate-600 mb-4">
        A guest can create tournaments and leagues, generate rounds, and enter scores —
        they can never delete or edit anything.
      </p>

      <form action={addGuestInvite} className="flex gap-2 mb-6">
        <input
          type="email"
          name="email"
          required
          placeholder="guest@gmail.com"
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <SaveButton
          className="rounded bg-slate-900 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
          pendingLabel="Adding…"
        >
          Add guest
        </SaveButton>
      </form>

      <div className="space-y-2">
        {(guests ?? []).map((g) => {
          const removeGuestMemberWithId = removeGuestMember.bind(null, g.id);
          return (
            <div key={g.id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
              <span className="text-sm">{g.email}</span>
              <form action={removeGuestMemberWithId}>
                <SaveButton className="text-sm text-red-600 font-semibold" pendingLabel="Removing…">
                  Remove
                </SaveButton>
              </form>
            </div>
          );
        })}
        {(invites ?? []).map((i) => {
          const removeGuestInviteWithId = removeGuestInvite.bind(null, i.id);
          return (
            <div key={i.id} className="flex items-center justify-between rounded border border-dashed border-slate-300 px-3 py-2">
              <span className="text-sm text-slate-500">{i.email} (pending)</span>
              <form action={removeGuestInviteWithId}>
                <SaveButton className="text-sm text-red-600 font-semibold" pendingLabel="Removing…">
                  Cancel invite
                </SaveButton>
              </form>
            </div>
          );
        })}
        {(guests ?? []).length === 0 && (invites ?? []).length === 0 && (
          <p className="text-sm text-slate-500">No guests yet.</p>
        )}
      </div>
    </OrganizerShell>
  );
}
