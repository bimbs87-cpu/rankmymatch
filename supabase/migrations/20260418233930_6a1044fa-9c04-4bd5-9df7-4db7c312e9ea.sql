ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS presence_force_open_at timestamp with time zone;

-- Update the trigger to bypass the check if presence was force-opened
CREATE OR REPLACE FUNCTION public.check_presence_open_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _round rounds%ROWTYPE;
  _group groups%ROWTYPE;
  _open_at timestamptz;
  _days_before int;
  _open_time time;
  _seed bigint;
  _offset_minutes int;
  _game_ts timestamptz;
BEGIN
  SELECT * INTO _round FROM rounds WHERE id = NEW.round_id;
  IF _round.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins bypass the check
  IF public.is_group_admin(auth.uid(), _round.group_id) THEN
    RETURN NEW;
  END IF;

  -- If admin already force-opened the presence list, bypass
  IF _round.presence_force_open_at IS NOT NULL AND now() >= _round.presence_force_open_at THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _group FROM groups WHERE id = _round.group_id;
  IF _group.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF _group.presence_open_mode = 'always' OR _round.scheduled_date IS NULL THEN
    RETURN NEW;
  END IF;

  _game_ts := (_round.scheduled_date::text || ' ' || COALESCE(_round.scheduled_time::text, '00:00:00'))::timestamptz;

  IF _group.presence_open_mode = 'random' THEN
    _seed := abs(('x' || substr(md5(_round.id::text), 1, 8))::bit(32)::int);
    _offset_minutes := 1440 + (_seed % 720)::int;
    _open_at := _game_ts - (_offset_minutes || ' minutes')::interval;
  ELSE
    _days_before := CASE _group.presence_open_mode
      WHEN 'same_day' THEN 0
      WHEN '1_day_before' THEN 1
      WHEN '2_days_before' THEN 2
      ELSE 1
    END;
    _open_time := COALESCE(_group.presence_open_time, '10:00:00'::time);
    _open_at := ((_round.scheduled_date - _days_before)::text || ' ' || _open_time::text)::timestamptz;
  END IF;

  IF now() < _open_at THEN
    RAISE EXCEPTION 'Presence list is not open yet (opens at %)', _open_at
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;