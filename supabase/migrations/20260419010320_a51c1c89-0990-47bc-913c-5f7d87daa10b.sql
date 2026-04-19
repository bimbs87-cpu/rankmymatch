
-- Public bucket to cache rendered OG PNGs
insert into storage.buckets (id, name, public)
values ('og-cache', 'og-cache', true)
on conflict (id) do update set public = true;

-- Public read for cached OG images
create policy "Public read og-cache"
on storage.objects for select
using (bucket_id = 'og-cache');
