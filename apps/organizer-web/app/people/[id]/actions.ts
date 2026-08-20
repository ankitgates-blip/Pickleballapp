'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { ALLOWED_PHOTO_MIME_TO_EXT, validatePhotoFile } from '@/lib/people/photoValidation';

const PLAYER_PHOTOS_BUCKET = 'player-photos';
const PHOTO_EXTENSIONS = Object.values(ALLOWED_PHOTO_MIME_TO_EXT);

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
  const paddleBrand = (formData.get('paddleBrand') as string) || null;
  const signatureShot = formData.getAll('signatureShot') as string[];
  if (signatureShot.length > 4) {
    throw new Error('Choose at most 4 signature shot badges');
  }
  const strengths = formData.getAll('strengths') as string[];

  const { error } = await supabase
    .from('people')
    .update({
      name,
      age,
      handedness,
      playing_style: playingStyle,
      paddle_brand: paddleBrand,
      signature_shot: signatureShot,
      strengths,
    })
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

export async function uploadPersonPhoto(personId: string, formData: FormData) {
  const { supabase, organizer } = await requireOrganizer();

  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('Choose a photo to upload');
  }

  const validationError = validatePhotoFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const ext = ALLOWED_PHOTO_MIME_TO_EXT[file.type];
  const path = `${organizer.id}/${personId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(PLAYER_PHOTOS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data: publicUrlData } = supabase.storage.from(PLAYER_PHOTOS_BUCKET).getPublicUrl(path);
  const photoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error } = await supabase
    .from('people')
    .update({ photo_url: photoUrl })
    .eq('id', personId)
    .eq('organizer_id', organizer.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/people/${personId}`);
  revalidatePath(`/p/${personId}`);
}

export async function removePersonPhoto(personId: string) {
  const { supabase, organizer } = await requireOrganizer();

  const pathsToRemove = PHOTO_EXTENSIONS.map((ext) => `${organizer.id}/${personId}.${ext}`);
  await supabase.storage.from(PLAYER_PHOTOS_BUCKET).remove(pathsToRemove);

  const { error } = await supabase
    .from('people')
    .update({ photo_url: null })
    .eq('id', personId)
    .eq('organizer_id', organizer.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/people/${personId}`);
  revalidatePath(`/p/${personId}`);
}
