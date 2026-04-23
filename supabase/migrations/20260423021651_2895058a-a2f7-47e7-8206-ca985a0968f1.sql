ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS member_limit integer NULL;
COMMENT ON COLUMN public.groups.member_limit IS 'Maximum number of members allowed in the group. NULL = unlimited.';