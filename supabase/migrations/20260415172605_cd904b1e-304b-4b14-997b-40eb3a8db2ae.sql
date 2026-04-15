
-- Allow group members to insert notifications for other group members
CREATE POLICY "Members can create notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  (group_id IS NULL) OR is_group_member(auth.uid(), group_id)
);

-- Allow users to delete their own notifications
CREATE POLICY "Users can delete own notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
