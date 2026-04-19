
drop policy if exists "Public read og-cache" on storage.objects;

-- Allow public read only for objects under og/ prefix (no listing of bucket root)
create policy "Public read og-cache files"
on storage.objects for select
using (bucket_id = 'og-cache' and (storage.foldername(name))[1] = 'og');
