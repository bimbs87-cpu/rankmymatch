-- Allow group admins to insert/update presence on behalf of any member.
-- This enables admins to add players to the presence list directly when the
-- list is open (e.g. in-person sign-up at the courts).

CREATE POLICY "Admins can manage presence"
ON public.round_presence
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.rounds r
    WHERE r.id = round_presence.round_id
      AND public.is_group_admin(auth.uid(), r.group_id)
  )
);

CREATE POLICY "Admins can update presence"
ON public.round_presence
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rounds r
    WHERE r.id = round_presence.round_id
      AND public.is_group_admin(auth.uid(), r.group_id)
  )
);
