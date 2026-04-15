-- Create storage bucket for group images
INSERT INTO storage.buckets (id, name, public)
VALUES ('group-images', 'group-images', true);

-- Anyone can view group images (public bucket)
CREATE POLICY "Anyone can view group images"
ON storage.objects FOR SELECT
USING (bucket_id = 'group-images');

-- Group members can upload images (folder structure: {group_id}/filename)
CREATE POLICY "Members can upload group images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'group-images'
  AND auth.uid() IS NOT NULL
);

-- Admins can update group images
CREATE POLICY "Admins can update group images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'group-images'
  AND auth.uid() IS NOT NULL
);

-- Admins can delete group images
CREATE POLICY "Admins can delete group images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'group-images'
  AND auth.uid() IS NOT NULL
);