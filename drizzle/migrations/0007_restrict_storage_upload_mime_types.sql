
-- Restringe tipos de arquivo aceitos nos buckets de imagem
DROP POLICY IF EXISTS "Anyone can upload bug screenshots" ON storage.objects;
CREATE POLICY "Anyone can upload bug screenshots"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bug-screenshots'
    AND owner_id = (SELECT auth.uid()::text)
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
    AND lower(name) ~ '\.(png|jpe?g|webp|gif)$'
  );

DROP POLICY IF EXISTS "Members can upload group images" ON storage.objects;
CREATE POLICY "Members can upload group images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'group-images'
    AND owner_id = (SELECT auth.uid()::text)
    AND lower(name) ~ '\.(png|jpe?g|webp)$'
    AND EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id::text = (storage.foldername(objects.name))[1]
        AND gm.user_id = (SELECT auth.uid())
        AND gm.status = 'active'
    )
  );
