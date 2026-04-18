-- Allow admins to rename placeholder profiles in their groups
CREATE POLICY "Admins can rename placeholders in their groups"
ON public.user_profiles
FOR UPDATE
USING (
  is_placeholder = true
  AND EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.user_id = user_profiles.user_id
      AND public.is_group_admin(auth.uid(), gm.group_id)
  )
);