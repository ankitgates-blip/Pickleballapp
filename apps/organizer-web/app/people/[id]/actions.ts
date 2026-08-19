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
  const ageNum = ageRaw ? Number(ageRaw) : NaN;
  const age = Number.isInteger(ageNum) && ageNum > 0 && ageNum < 130 ? ageNum : null;
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

  const { error: playersError } = await supabase
    .from('players')
    .update({ name })
    .eq('person_id', personId);

  if (playersError) {
    throw new Error(playersError.message);
  }

  revalidatePath(`/people/${personId}`);
  revalidatePath('/people');
}
