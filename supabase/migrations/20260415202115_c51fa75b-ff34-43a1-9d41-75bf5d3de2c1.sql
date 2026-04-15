
CREATE OR REPLACE FUNCTION public.get_group_member_count(_group_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM public.group_members
  WHERE group_id = _group_id AND status = 'active';
$$;
