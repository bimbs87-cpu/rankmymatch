-- Allow app admins to manage release_notes from the new admin UI panel
CREATE POLICY "App admins can insert release notes"
  ON public.release_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_app_admin(auth.uid()));

CREATE POLICY "App admins can update release notes"
  ON public.release_notes
  FOR UPDATE
  TO authenticated
  USING (public.is_app_admin(auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()));

CREATE POLICY "App admins can delete release notes"
  ON public.release_notes
  FOR DELETE
  TO authenticated
  USING (public.is_app_admin(auth.uid()));

CREATE POLICY "App admins can read all release notes"
  ON public.release_notes
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin(auth.uid()));