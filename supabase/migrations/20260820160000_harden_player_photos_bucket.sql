create policy "player_photos_select_own" on storage.objects
  for select using (
    bucket_id = 'player-photos'
    and (storage.foldername(name))[1] = (
      select id::text from public.organizers where auth_user_id = auth.uid()
    )
  );

update storage.buckets
set file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'player-photos';
