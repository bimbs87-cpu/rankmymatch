UPDATE public.user_profiles
SET avatar_url = 'avatar:no-photo', avatar_type = 'preset', updated_at = now()
WHERE is_placeholder = true
  AND user_id IN (
    SELECT user_id FROM public.group_members
    WHERE group_id = 'a0e8946d-524c-4dbf-a1dd-3fb5303bfa63'
  );