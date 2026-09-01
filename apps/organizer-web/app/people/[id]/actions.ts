'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
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

  const nickname = (formData.get('nickname') as string)?.trim() || null;

  const playerNumberRaw = (formData.get('playerNumber') as string)?.trim() || '';
  if (playerNumberRaw && !/^\d+$/.test(playerNumberRaw)) {
    throw new Error('Player No. must contain only numbers');
  }
  const playerNumber = playerNumberRaw || null;

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

  // DUPR (Dynamic Universal Pickleball Rating) IDs are a short alphanumeric code, no
  // spaces or punctuation beyond a hyphen -- this is a plain reference field (not
  // validated against DUPR itself, since there's no public API to check it against;
  // see the DUPR integration research this was scoped from), so the only goal here is
  // rejecting obvious garbage, not enforcing DUPR's exact internal ID format.
  const duprIdRaw = (formData.get('duprId') as string)?.trim() || '';
  if (duprIdRaw && !/^[A-Za-z0-9-]{1,32}$/.test(duprIdRaw)) {
    throw new Error('DUPR ID can only contain letters, numbers, and hyphens');
  }
  const duprId = duprIdRaw || null;

  const { error } = await supabase
    .from('people')
    .update({
      name,
      nickname,
      player_number: playerNumber,
      age,
      handedness,
      playing_style: playingStyle,
      paddle_brand: paddleBrand,
      signature_shot: signatureShot,
      strengths,
      dupr_id: duprId,
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
  revalidatePath(`/p/${personId}`);
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

// Permanently removes this person and every players/teams/matches row they're part of,
// across every tournament -- not just this organizer's memory of the name, the actual
// database rows. Deleting their `players` rows first (rather than relying on any cascade
// from `people`, since there isn't one) cascades to remove any team they were paired into
// and any match that team played, exactly like the existing per-tournament "remove player"
// action already does -- this is the same behavior, just applied across every tournament
// at once instead of one.
export async function deletePerson(personId: string) {
  const { supabase, organizer } = await requireOrganizer();

  // Check this BEFORE deleting anything below. players.person_id has no ON DELETE
  // clause (so those rows must be cleared manually before people can be deleted), but
  // player_of_the_month.person_id is `on delete restrict`, which would reject the
  // people delete further down. Since these are separate requests, not one
  // transaction, deleting players first and then hitting that restriction would leave
  // this person's tournament/team history stripped even though neither their profile
  // nor their Player of the Month record actually got deleted. Checking first avoids
  // ever starting a deletion that can't complete.
  const { data: wonPlayerOfTheMonth, error: potmCheckError } = await supabase
    .from('player_of_the_month')
    .select('id')
    .eq('person_id', personId)
    .limit(1)
    .maybeSingle();

  if (potmCheckError) {
    throw new Error(potmCheckError.message);
  }

  if (wonPlayerOfTheMonth) {
    throw new Error(
      'This person has won Player of the Month and their record must be preserved -- they cannot be deleted.'
    );
  }

  const { error: playersError } = await supabase
    .from('players')
    .delete()
    .eq('person_id', personId);

  if (playersError) {
    throw new Error(playersError.message);
  }

  const { error: deleteError } = await supabase
    .from('people')
    .delete()
    .eq('id', personId)
    .eq('organizer_id', organizer.id);

  if (deleteError) {
    if (deleteError.code === '23503') {
      throw new Error(
        'This person has won Player of the Month and their record must be preserved -- they cannot be deleted.'
      );
    }
    throw new Error(deleteError.message);
  }

  revalidatePath('/people');
  redirect('/people');
}
