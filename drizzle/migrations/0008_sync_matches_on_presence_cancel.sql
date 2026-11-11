CREATE OR REPLACE FUNCTION public.sync_match_players_on_presence_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _max int;
  _status text;
  _sub uuid;
  _mp record;
BEGIN
  IF OLD.status <> 'confirmed' OR NEW.status NOT IN ('absent','declined') THEN
    RETURN NEW;
  END IF;
  SELECT max_players, status INTO _max, _status FROM rounds WHERE id = NEW.round_id;
  IF _status = 'completed' THEN RETURN NEW; END IF;

  FOR _mp IN
    SELECT mp.id FROM match_players mp
    JOIN matches m ON m.id = mp.match_id
    WHERE m.round_id = NEW.round_id
      AND mp.user_id = NEW.user_id
      AND m.status NOT IN ('completed','not_played')
      AND NOT EXISTS (SELECT 1 FROM match_sets s WHERE s.match_id = m.id)
  LOOP
    -- First confirmed player inside the cutoff who isn't drawn in this round yet
    SELECT c.user_id INTO _sub FROM (
      SELECT rp.user_id, rp.confirmed_at FROM round_presence rp
      WHERE rp.round_id = NEW.round_id AND rp.status = 'confirmed'
      ORDER BY rp.confirmed_at ASC NULLS LAST
      LIMIT COALESCE(NULLIF(_max,0), 1000)
    ) c
    WHERE NOT EXISTS (
      SELECT 1 FROM match_players mp2 JOIN matches m2 ON m2.id = mp2.match_id
      WHERE m2.round_id = NEW.round_id AND mp2.user_id = c.user_id
    )
    ORDER BY c.confirmed_at ASC NULLS LAST
    LIMIT 1;

    IF _sub IS NOT NULL THEN
      UPDATE match_players SET user_id = _sub WHERE id = _mp.id;
    ELSE
      DELETE FROM match_players WHERE id = _mp.id;
    END IF;
    _sub := NULL;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_match_players_on_presence_cancel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_match_players_on_presence_cancel ON public.round_presence;
CREATE TRIGGER trg_sync_match_players_on_presence_cancel
AFTER UPDATE OF status ON public.round_presence
FOR EACH ROW EXECUTE FUNCTION public.sync_match_players_on_presence_cancel();