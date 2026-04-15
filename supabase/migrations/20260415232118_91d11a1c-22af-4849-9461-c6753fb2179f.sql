-- Allow admins to delete round presence records
CREATE POLICY "Admins can delete presence"
ON public.round_presence
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM rounds r
    WHERE r.id = round_presence.round_id
    AND is_group_admin(auth.uid(), r.group_id)
  )
);