CREATE OR REPLACE FUNCTION public.guard_group_members_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid := auth.uid();
  _role text := current_setting('request.jwt.claims', true)::jsonb->>'role';
  _is_admin boolean;
  _claim_ok boolean;
BEGIN
  -- Only guard writes made with an end-user token; server code with the service role passes.
  IF _role IS DISTINCT FROM 'authenticated' AND _role IS DISTINCT FROM 'anon' THEN
    RETURN NEW;
  END IF;
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  _is_admin := public.is_group_admin(_uid, NEW.group_id);

  IF TG_OP = 'INSERT' THEN
    IF _is_admin THEN
      IF NEW.role = 'creator' AND NOT public.is_group_creator(_uid, NEW.group_id) THEN
        RAISE EXCEPTION 'Only the creator can assign creator role' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.user_id <> _uid THEN
      RAISE EXCEPTION 'Cannot add other users' USING ERRCODE = '42501';
    END IF;
    IF NEW.role = 'creator' THEN
      IF NEW.status = 'active'
         AND EXISTS (SELECT 1 FROM groups WHERE id = NEW.group_id AND created_by = _uid)
         AND NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = NEW.group_id AND role = 'creator') THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Not allowed to join as creator' USING ERRCODE = '42501';
    END IF;
    IF NEW.role <> 'member' THEN
      RAISE EXCEPTION 'Not allowed to join with this role' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'active' AND NOT EXISTS (
      SELECT 1 FROM invite_links il
      WHERE il.group_id = NEW.group_id AND il.is_active
        AND (il.expires_at IS NULL OR il.expires_at > now())
        AND (il.max_uses IS NULL OR il.use_count < il.max_uses)
    ) THEN
      RAISE EXCEPTION 'A valid invite is required to join' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF _is_admin THEN
    IF (NEW.role = 'creator') IS DISTINCT FROM (OLD.role = 'creator')
       AND NOT public.is_group_creator(_uid, NEW.group_id) THEN
      RAISE EXCEPTION 'Only the creator can change creator role' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.group_id <> OLD.group_id OR NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Cannot change role or group' USING ERRCODE = '42501';
  END IF;

  -- Claim invites: a player linking their account to a placeholder in this group.
  _claim_ok := NEW.user_id = _uid AND EXISTS (
    SELECT 1 FROM invite_links il
    JOIN user_profiles up ON up.user_id = il.claim_placeholder_user_id AND up.is_placeholder
    WHERE il.group_id = NEW.group_id AND il.is_active
      AND (il.expires_at IS NULL OR il.expires_at > now())
      AND (OLD.user_id = _uid OR il.claim_placeholder_user_id = OLD.user_id)
  );

  IF NEW.user_id <> OLD.user_id AND NOT _claim_ok THEN
    RAISE EXCEPTION 'Cannot move memberships' USING ERRCODE = '42501';
  END IF;
  IF OLD.user_id = _uid AND NEW.user_id = _uid
     AND NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' AND NOT _claim_ok THEN
    RAISE EXCEPTION 'Cannot reactivate your own membership' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;