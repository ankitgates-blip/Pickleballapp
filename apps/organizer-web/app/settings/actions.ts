'use server';

import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/supabase/requireOrganizer';
import { normalizeGuestEmail } from '@/lib/settings/normalizeGuestEmail';

export async function addGuestInvite(formData: FormData) {
  const { supabase, organizer } = await requireOwner();
  const email = normalizeGuestEmail(formData.get('email') as string | null);

  const { error } = await supabase
    .from('guest_invites')
    .insert({ organizer_id: organizer.id, email });

  if (error) {
    if (error.code === '23505') {
      throw new Error('That email is already invited.');
    }
    throw new Error(error.message);
  }

  revalidatePath('/settings');
}

export async function removeGuestInvite(inviteId: string) {
  const { supabase, organizer } = await requireOwner();

  const { error } = await supabase
    .from('guest_invites')
    .delete()
    .eq('id', inviteId)
    .eq('organizer_id', organizer.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/settings');
}

export async function removeGuestMember(memberId: string) {
  const { supabase, organizer } = await requireOwner();

  const { error } = await supabase
    .from('organizer_members')
    .delete()
    .eq('id', memberId)
    .eq('organizer_id', organizer.id)
    .eq('role', 'guest');

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/settings');
}
