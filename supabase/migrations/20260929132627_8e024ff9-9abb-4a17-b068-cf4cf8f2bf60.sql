CREATE OR REPLACE FUNCTION public.refresh_season_ranking_eligibility(_season_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _minimum integer;
BEGIN
  IF _season_id IS NULL THEN RETURN; END IF;
  SELECT CEIL(COUNT(r.id) FILTER (WHERE r.status = 'completed') * s.min_eligibility_pct / 100.0)::integer
  INTO _minimum
  FROM public.seasons s
  LEFT JOIN public.rounds r ON r.season_id = s.id
  WHERE s.id = _season_id
  GROUP BY s.id, s.min_eligibility_pct;
  IF NOT FOUND THEN RETURN; END IF;

  WITH ordered AS (
    SELECT id,
      ( _minimum > 0 AND matches_played >= _minimum ) AS eligible,
      ROW_NUMBER() OVER (
        PARTITION BY (_minimum > 0 AND matches_played >= _minimum)
        ORDER BY rating DESC, id
      ) AS rank_number
    FROM public.ranking_snapshots
    WHERE season_id = _season_id
  )
  UPDATE public.ranking_snapshots snap
  SET is_eligible = ordered.eligible,
      position = CASE WHEN ordered.eligible THEN ordered.rank_number::integer ELSE NULL END
  FROM ordered
  WHERE snap.id = ordered.id
    AND (snap.is_eligible IS DISTINCT FROM ordered.eligible OR snap.position IS DISTINCT FROM CASE WHEN ordered.eligible THEN ordered.rank_number::integer ELSE NULL END);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_season_ranking_eligibility(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ranking_eligibility_snapshot_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_season_ranking_eligibility(OLD.season_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.season_id IS DISTINCT FROM NEW.season_id THEN
    PERFORM public.refresh_season_ranking_eligibility(OLD.season_id);
  END IF;
  PERFORM public.refresh_season_ranking_eligibility(NEW.season_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ranking_eligibility_snapshot_changed() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER ranking_eligibility_after_snapshot_insert AFTER INSERT ON public.ranking_snapshots FOR EACH ROW EXECUTE FUNCTION public.ranking_eligibility_snapshot_changed();
CREATE TRIGGER ranking_eligibility_after_snapshot_update AFTER UPDATE OF matches_played, rating, season_id ON public.ranking_snapshots FOR EACH ROW EXECUTE FUNCTION public.ranking_eligibility_snapshot_changed();
CREATE TRIGGER ranking_eligibility_after_snapshot_delete AFTER DELETE ON public.ranking_snapshots FOR EACH ROW EXECUTE FUNCTION public.ranking_eligibility_snapshot_changed();

CREATE OR REPLACE FUNCTION public.ranking_eligibility_round_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_season_ranking_eligibility(OLD.season_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.season_id IS DISTINCT FROM NEW.season_id THEN
    PERFORM public.refresh_season_ranking_eligibility(OLD.season_id);
  END IF;
  PERFORM public.refresh_season_ranking_eligibility(NEW.season_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ranking_eligibility_round_changed() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER ranking_eligibility_after_round_insert AFTER INSERT ON public.rounds FOR EACH ROW EXECUTE FUNCTION public.ranking_eligibility_round_changed();
CREATE TRIGGER ranking_eligibility_after_round_update AFTER UPDATE OF status, season_id ON public.rounds FOR EACH ROW EXECUTE FUNCTION public.ranking_eligibility_round_changed();
CREATE TRIGGER ranking_eligibility_after_round_delete AFTER DELETE ON public.rounds FOR EACH ROW EXECUTE FUNCTION public.ranking_eligibility_round_changed();

CREATE OR REPLACE FUNCTION public.ranking_eligibility_season_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_season_ranking_eligibility(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ranking_eligibility_season_changed() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER ranking_eligibility_after_season_pct_update AFTER UPDATE OF min_eligibility_pct ON public.seasons FOR EACH ROW EXECUTE FUNCTION public.ranking_eligibility_season_changed();

DO $$ DECLARE _id uuid; BEGIN
  FOR _id IN SELECT id FROM public.seasons LOOP
    PERFORM public.refresh_season_ranking_eligibility(_id);
  END LOOP;
END $$;