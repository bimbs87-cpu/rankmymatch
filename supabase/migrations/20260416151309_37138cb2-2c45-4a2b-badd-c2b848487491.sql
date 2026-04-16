
-- Allow admins to insert placeholder profiles
CREATE POLICY "Admins can insert placeholder profiles"
ON public.user_profiles
FOR INSERT
WITH CHECK (is_placeholder = true AND created_by_admin = auth.uid());

-- Allow admins to insert placeholder group members
CREATE POLICY "Admins can insert placeholder members"
ON public.group_members
FOR INSERT
WITH CHECK (is_group_admin(auth.uid(), group_id));
