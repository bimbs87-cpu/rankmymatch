-- Pin privileged queue routines to a trusted lookup scope.
ALTER FUNCTION public.move_to_dlq(text,text,bigint,jsonb) SET search_path = '';
ALTER FUNCTION public.read_email_batch(text,integer,integer) SET search_path = '';
ALTER FUNCTION public.enqueue_email(text,jsonb) SET search_path = '';
ALTER FUNCTION public.delete_email(text,bigint) SET search_path = '';

DROP POLICY "profiles_select" ON public.user_profiles;
CREATE POLICY "profiles_select" ON public.user_profiles FOR SELECT TO authenticated
USING (user_id = (select auth.uid()) OR EXISTS (
  SELECT 1 FROM public.group_members mine
  JOIN public.group_members theirs ON theirs.group_id = mine.group_id
  WHERE mine.user_id = (select auth.uid()) AND mine.status = 'active'
    AND theirs.user_id = user_profiles.user_id AND theirs.status = 'active'
));
DROP POLICY "Anyone can check app admin membership" ON public.app_admins;
CREATE POLICY "Users check own app admin membership" ON public.app_admins FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
DROP POLICY "Anyone can view plans" ON public.premium_plans;
CREATE POLICY "Anyone can view active plans" ON public.premium_plans FOR SELECT USING (is_active = true);
DROP POLICY "Anyone views commands" ON public.whatsapp_commands;
CREATE POLICY "Anyone views active commands" ON public.whatsapp_commands FOR SELECT USING (is_active = true);
DROP POLICY "Anyone reads bug votes" ON public.bug_report_votes;
CREATE POLICY "Users read own bug votes" ON public.bug_report_votes FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
DROP POLICY "Anyone can insert page visits" ON public.page_visits;

DROP POLICY "Members can upload group images" ON storage.objects;
CREATE POLICY "Members can upload group images" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'group-images' AND owner_id = (select auth.uid()::text)
 AND EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id::text = (storage.foldername(name))[1]
 AND gm.user_id = (select auth.uid()) AND gm.status = 'active'));
DROP POLICY "Admins can update group images" ON storage.objects;
CREATE POLICY "Admins can update group images" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'group-images' AND owner_id = (select auth.uid()::text))
WITH CHECK (bucket_id = 'group-images' AND owner_id = (select auth.uid()::text));
DROP POLICY "Admins can delete group images" ON storage.objects;
CREATE POLICY "Admins can delete group images" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'group-images' AND owner_id = (select auth.uid()::text));
DROP POLICY "Anyone can upload bug screenshots" ON storage.objects;
CREATE POLICY "Anyone can upload bug screenshots" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'bug-screenshots' AND owner_id = (select auth.uid()::text)
 AND (storage.foldername(name))[1] = (select auth.uid()::text));
-- Public buckets still serve existing direct URLs; do not expose object enumeration via Data API.
DROP POLICY "Anyone can view group images" ON storage.objects;
DROP POLICY "Bug screenshots are publicly readable" ON storage.objects;
DROP POLICY "Public read og-cache files" ON storage.objects;