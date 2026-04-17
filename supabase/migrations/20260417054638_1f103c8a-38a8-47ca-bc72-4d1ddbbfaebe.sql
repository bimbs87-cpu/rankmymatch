-- Allow group admins to update the display name of FORMER members (status != 'active') in their group.
-- This is needed so admins can rename ex-members that have been unlinked from the group.

CREATE POLICY "Admins can rename former members"
ON public.user_profiles
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.user_id = user_profiles.user_id
      AND gm.status <> 'active'
      AND public.is_group_admin(auth.uid(), gm.group_id)
  )
);