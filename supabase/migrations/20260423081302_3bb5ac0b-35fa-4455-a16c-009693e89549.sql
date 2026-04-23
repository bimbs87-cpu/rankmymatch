-- Add waitlist position support to group_join_requests
ALTER TABLE public.group_join_requests
  ADD COLUMN IF NOT EXISTS waitlist_position integer,
  ADD COLUMN IF NOT EXISTS is_waitlisted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_group_join_requests_waitlist
  ON public.group_join_requests(group_id, waitlist_position)
  WHERE status = 'pending' AND is_waitlisted = true;

-- Function to recompute waitlist positions for a group (FIFO by created_at among waitlisted pending requests)
CREATE OR REPLACE FUNCTION public.recompute_waitlist_positions(_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
    FROM public.group_join_requests
    WHERE group_id = _group_id
      AND status = 'pending'
      AND is_waitlisted = true
  )
  UPDATE public.group_join_requests r
  SET waitlist_position = o.rn
  FROM ordered o
  WHERE r.id = o.id;
END;
$$;

-- Trigger: when a new pending request is inserted, mark as waitlisted if group is at member_limit
CREATE OR REPLACE FUNCTION public.assign_waitlist_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit integer;
  _count integer;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;
  SELECT member_limit INTO _limit FROM public.groups WHERE id = NEW.group_id;
  IF _limit IS NULL THEN
    NEW.is_waitlisted := false;
    NEW.waitlist_position := NULL;
    RETURN NEW;
  END IF;
  SELECT public.get_group_member_count(NEW.group_id) INTO _count;
  IF _count >= _limit THEN
    NEW.is_waitlisted := true;
  ELSE
    NEW.is_waitlisted := false;
    NEW.waitlist_position := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_waitlist_on_insert ON public.group_join_requests;
CREATE TRIGGER trg_assign_waitlist_on_insert
BEFORE INSERT ON public.group_join_requests
FOR EACH ROW
EXECUTE FUNCTION public.assign_waitlist_on_insert();

-- Trigger: after insert/update, recompute positions for the group
CREATE OR REPLACE FUNCTION public.refresh_waitlist_positions_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_waitlist_positions(COALESCE(NEW.group_id, OLD.group_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_waitlist_after_insert ON public.group_join_requests;
CREATE TRIGGER trg_refresh_waitlist_after_insert
AFTER INSERT OR UPDATE OR DELETE ON public.group_join_requests
FOR EACH ROW
EXECUTE FUNCTION public.refresh_waitlist_positions_trigger();