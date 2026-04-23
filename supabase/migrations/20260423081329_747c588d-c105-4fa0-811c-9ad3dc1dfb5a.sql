ALTER FUNCTION public.recompute_waitlist_positions(uuid) SET search_path TO 'public';
ALTER FUNCTION public.assign_waitlist_on_insert() SET search_path TO 'public';
ALTER FUNCTION public.refresh_waitlist_positions_trigger() SET search_path TO 'public';