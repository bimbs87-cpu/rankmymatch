ALTER TABLE public.group_members DROP CONSTRAINT IF EXISTS group_members_status_check;
ALTER TABLE public.group_members ADD CONSTRAINT group_members_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'pending'::text, 'removed'::text, 'left'::text]));