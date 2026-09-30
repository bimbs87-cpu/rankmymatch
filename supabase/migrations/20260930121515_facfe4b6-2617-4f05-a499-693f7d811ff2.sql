CREATE POLICY "App admins can rename player profiles"
ON public.user_profiles
FOR UPDATE TO authenticated
USING (public.is_app_admin(auth.uid()))
WITH CHECK (public.is_app_admin(auth.uid()));