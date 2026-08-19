'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';

export async function updatePersonProfile(personId: string, formData: FormData) {
  const { supabase } = await requireOrganizer();

  const name = (formData.get('name') as string)?.trim();
  if (!name) {
    throw new Error('Name is required');
  }

  const ageRaw = formData.get('age') as string;
  const age = ageRaw ? Number(ageRaw) : null;
  const handedness = (formData.get('handedness') as string) || null;
  const playingStyle = (formData.get('playingStyle') as string) || null;
  const strengths = formData.getAll('strengths') as string[];

  const { error } = await supabase
    .from('people')
    .update({ name, age, handedness, playing_style: playingStyle, strengths })
    .eq('id', personId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/people/${personId}`);
  revalidatePath('/people');
}
