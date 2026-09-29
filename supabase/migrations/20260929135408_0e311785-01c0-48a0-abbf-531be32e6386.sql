CREATE OR REPLACE FUNCTION public.get_season_set_eligibility(_season_id uuid)
RETURNS TABLE(user_id uuid, sets_played integer, total_sets integer, minimum_sets integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH season_sets AS (
    SELECT ms.id, m.id AS match_id
    FROM public.rounds r
    JOIN public.matches m ON m.round_id = r.id
    JOIN public.match_sets ms ON ms.match_id = m.id
    WHERE r.season_id = _season_id
      AND m.status = 'completed'
      AND COALESCE(m.counts_for_ranking, true)
      AND NOT COALESCE(m.is_exhibition, false)
  ), totals AS (
    SELECT COUNT(*)::integer AS total FROM season_sets
  ), players AS (
    SELECT mp.user_id, COUNT(*)::integer AS played
    FROM season_sets ss
    JOIN public.match_players mp ON mp.match_id = ss.match_id
    GROUP BY mp.user_id
  )
  SELECT snap.user_id, COALESCE(p.played, 0), t.total,
    CASE WHEN t.total > 0 THEN GREATEST(1, FLOOR(t.total * s.min_eligibility_pct / 100.0)::integer) ELSE 0 END
  FROM public.ranking_snapshots snap
  JOIN public.seasons s ON s.id = snap.season_id
  CROSS JOIN totals t
  LEFT JOIN players p ON p.user_id = snap.user_id
  WHERE snap.season_id = _season_id;
$$;
REVOKE ALL ON FUNCTION public.get_season_set_eligibility(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_season_set_eligibility(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refresh_season_ranking_eligibility(_season_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _season_id IS NULL THEN RETURN; END IF;
  WITH ranked AS (
    SELECT snap.id, (e.minimum_sets > 0 AND e.sets_played >= e.minimum_sets) AS eligible,
      ROW_NUMBER() OVER (
        PARTITION BY (e.minimum_sets > 0 AND e.sets_played >= e.minimum_sets)
        ORDER BY snap.rating DESC, snap.id
      ) AS rank_number
    FROM public.ranking_snapshots snap
    JOIN public.get_season_set_eligibility(_season_id) e ON e.user_id = snap.user_id
    WHERE snap.season_id = _season_id
  )
  UPDATE public.ranking_snapshots snap
  SET is_eligible = ranked.eligible,
      position = CASE WHEN ranked.eligible THEN ranked.rank_number::integer ELSE NULL END
  FROM ranked
  WHERE snap.id = ranked.id
    AND (snap.is_eligible IS DISTINCT FROM ranked.eligible OR snap.position IS DISTINCT FROM CASE WHEN ranked.eligible THEN ranked.rank_number::integer ELSE NULL END);
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_season_ranking_eligibility(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ranking_eligibility_match_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _old_season uuid; _new_season uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN SELECT season_id INTO _old_season FROM public.rounds WHERE id = OLD.round_id; END IF;
  IF TG_OP <> 'DELETE' THEN SELECT season_id INTO _new_season FROM public.rounds WHERE id = NEW.round_id; END IF;
  IF _old_season IS NOT NULL THEN PERFORM public.refresh_season_ranking_eligibility(_old_season); END IF;
  IF _new_season IS NOT NULL AND _new_season IS DISTINCT FROM _old_season THEN PERFORM public.refresh_season_ranking_eligibility(_new_season); END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.ranking_eligibility_match_changed() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER ranking_eligibility_after_match_insert AFTER INSERT ON public.matches FOR EACH ROW EXECUTE FUNCTION public.ranking_eligibility_match_changed();
CREATE TRIGGER ranking_eligibility_after_match_update AFTER UPDATE OF status, counts_for_ranking, is_exhibition, round_id ON public.matches FOR EACH ROW EXECUTE FUNCTION public.ranking_eligibility_match_changed();
CREATE TRIGGER ranking_eligibility_after_match_delete AFTER DELETE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.ranking_eligibility_match_changed();

CREATE OR REPLACE FUNCTION public.ranking_eligibility_match_detail_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _old_season uuid; _new_season uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT r.season_id INTO _old_season FROM public.matches m JOIN public.rounds r ON r.id = m.round_id WHERE m.id = OLD.match_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT r.season_id INTO _new_season FROM public.matches m JOIN public.rounds r ON r.id = m.round_id WHERE m.id = NEW.match_id;
  END IF;
  IF _old_season IS NOT NULL THEN PERFORM public.refresh_season_ranking_eligibility(_old_season); END IF;
  IF _new_season IS NOT NULL AND _new_season IS DISTINCT FROM _old_season THEN PERFORM public.refresh_season_ranking_eligibility(_new_season); END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.ranking_eligibility_match_detail_changed() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER ranking_eligibility_after_set_insert AFTER INSERT ON public.match_sets FOR EACH ROW EXECUTE FUNCTION public.ranking_eligibility_match_detail_changed();
CREATE TRIGGER ranking_eligibility_after_set_update AFTER UPDATE OF match_id ON public.match_sets FOR EACH ROW EXECUTE FUNCTION public.ranking_eligibility_match_detail_changed();
CREATE TRIGGER ranking_eligibility_after_set_delete AFTER DELETE ON public.match_sets FOR EACH ROW EXECUTE FUNCTION public.ranking_eligibility_match_detail_changed();
CREATE TRIGGER ranking_eligibility_after_player_insert AFTER INSERT ON public.match_players FOR EACH ROW EXECUTE FUNCTION public.ranking_eligibility_match_detail_changed();
CREATE TRIGGER ranking_eligibility_after_player_update AFTER UPDATE OF match_id, user_id ON public.match_players FOR EACH ROW EXECUTE FUNCTION public.ranking_eligibility_match_detail_changed();
CREATE TRIGGER ranking_eligibility_after_player_delete AFTER DELETE ON public.match_players FOR EACH ROW EXECUTE FUNCTION public.ranking_eligibility_match_detail_changed();

DO $$ DECLARE _id uuid; BEGIN
  FOR _id IN SELECT id FROM public.seasons LOOP
    PERFORM public.refresh_season_ranking_eligibility(_id);
  END LOOP;
END $$;