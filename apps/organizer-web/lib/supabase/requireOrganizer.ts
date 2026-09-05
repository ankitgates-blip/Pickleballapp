import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

type Organizer = { id: string; name: string };
type Role = 'owner' | 'guest';

export async function requireOrganizer(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  organizer: Organizer;
  role: Role;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  let { data: membership, error } = await supabase
    .from('organizer_members')
    .select('role, organizers(id, name)')
    .eq('auth_user_id', user.id)
    .single();

  if (error || !membership) {
    // A returning user with no membership row yet (e.g. a removed guest
    // who was re-invited) -- claim any pending invite for their email,
    // then retry once. A no-op if there's nothing to claim.
    await supabase.rpc('claim_pending_guest_invite');

    ({ data: membership, error } = await supabase
      .from('organizer_members')
      .select('role, organizers(id, name)')
      .eq('auth_user_id', user.id)
      .single());
  }

  if (error || !membership) {
    redirect('/login');
  }

  // Supabase's JS client returns an embedded belongs-to relation as a
  // single object, but is defensive about arrays here to match this
  // codebase's existing handling of embedded relations elsewhere (see
  // app/tournaments/page.tsx's venue lookup).
  const organizerRow = Array.isArray(membership!.organizers)
    ? membership!.organizers[0]
    : membership!.organizers;

  if (!organizerRow) {
    redirect('/login');
  }

  return {
    supabase,
    organizer: organizerRow as Organizer,
    role: membership!.role as Role,
  };
}

export async function requireOwner() {
  const result = await requireOrganizer();

  if (result.role !== 'owner') {
    throw new Error('Only the workspace owner can do this.');
  }

  return { ...result, role: 'owner' as const };
}
