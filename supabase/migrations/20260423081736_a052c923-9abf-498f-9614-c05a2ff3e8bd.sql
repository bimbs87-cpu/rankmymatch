-- Trigger function: enforce member_limit when approving join request
CREATE OR REPLACE FUNCTION public.enforce_member_limit_on_request_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit integer;
  _count integer;
BEGIN
  -- Only check transitions from non-approved to approved
  IF NEW.status = 'approved' AND COALESCE(OLD.status, '') <> 'approved' THEN
    SELECT member_limit INTO _limit FROM public.groups WHERE id = NEW.group_id;
    IF _limit IS NOT NULL THEN
      SELECT public.get_group_member_count(NEW.group_id) INTO _count;
      IF _count >= _limit THEN
        RAISE EXCEPTION 'GROUP_FULL: cannot approve request, group has reached member_limit (%/%)', _count, _limit
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_member_limit_on_request_approval ON public.group_join_requests;
CREATE TRIGGER trg_enforce_member_limit_on_request_approval
BEFORE UPDATE ON public.group_join_requests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_member_limit_on_request_approval();

-- Trigger function: enforce member_limit when inserting/activating a group member
CREATE OR REPLACE FUNCTION public.enforce_member_limit_on_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit integer;
  _count integer;
  _is_new_active boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _is_new_active := (NEW.status = 'active');
  ELSE
    _is_new_active := (NEW.status = 'active' AND COALESCE(OLD.status, '') <> 'active');
  END IF;

  IF NOT _is_new_active THEN
    RETURN NEW;
  END IF;

  SELECT member_limit INTO _limit FROM public.groups WHERE id = NEW.group_id;
  IF _limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT public.get_group_member_count(NEW.group_id) INTO _count;
  IF _count >= _limit THEN
    RAISE EXCEPTION 'GROUP_FULL: cannot add member, group has reached member_limit (%/%)', _count, _limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_member_limit_on_membership ON public.group_members;
CREATE TRIGGER trg_enforce_member_limit_on_membership
BEFORE INSERT OR UPDATE ON public.group_members
FOR EACH ROW
EXECUTE FUNCTION public.enforce_member_limit_on_membership();