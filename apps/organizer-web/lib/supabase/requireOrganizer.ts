import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function requireOrganizer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: organizer, error } = await supabase
    .from('organizers')
    .select('id, name')
    .eq('auth_user_id', user.id)
    .single();

  if (error || !organizer) {
    redirect('/login');
  }

  return { supabase, organizer: organizer! };
}
