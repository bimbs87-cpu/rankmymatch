CREATE OR REPLACE FUNCTION public.save_match_score_consistently(_match_id uuid, _season_id uuid, _sets jsonb)
RETURNS TABLE(winner_team text, sets_a integer, sets_b integer, edited boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_group uuid; v_round uuid; v_status text; v_format text; v_type text;
  v_winner text; v_sets_a int; v_sets_b int; v_games_a int; v_games_b int;
  v_match record; v_player record; v_avg_a numeric; v_avg_b numeric;
  v_expect_a numeric; v_multiplier numeric; v_actual numeric; v_expected numeric;
  v_k integer; v_change numeric; v_is_winner boolean; v_team_sets int; v_opp_sets int;
  v_team_games int; v_opp_games int; v_match_players int;
  v_total int; v_minimum int; v_pct numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT r.group_id, r.id, g.match_format, g.singles_group_type, s.min_eligibility_pct
    INTO v_group, v_round, v_format, v_type, v_pct
  FROM public.matches m JOIN public.rounds r ON r.id=m.round_id
  JOIN public.seasons s ON s.id=r.season_id JOIN public.groups g ON g.id=r.group_id
  WHERE m.id=_match_id AND s.id=_season_id;
  IF v_group IS NULL THEN RAISE EXCEPTION 'Partida não pertence à temporada'; END IF;
  IF NOT public.is_group_admin(auth.uid(),v_group) THEN RAISE EXCEPTION 'Apenas administradores do grupo podem registrar resultados'; END IF;
  -- One writer per season, including separate matches edited at the same time.
  PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended(_season_id::text, 90417));
  SELECT status INTO v_status FROM public.matches WHERE id=_match_id FOR UPDATE;
  IF jsonb_typeof(_sets) IS DISTINCT FROM 'array' OR jsonb_array_length(_sets) NOT BETWEEN 1 AND 99
    THEN RAISE EXCEPTION 'Informe os sets da partida'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(_sets) AS x("setNumber" int,"scoreA" int,"scoreB" int)
             WHERE x."setNumber" IS NULL OR x."setNumber" NOT BETWEEN 1 AND 99
                OR x."scoreA" IS NULL OR x."scoreB" IS NULL OR x."scoreA" NOT BETWEEN 0 AND 30
                OR x."scoreB" NOT BETWEEN 0 AND 30 OR (x."scoreA"=0 AND x."scoreB"=0))
    OR (SELECT count(*) FROM jsonb_to_recordset(_sets) AS x("setNumber" int,"scoreA" int,"scoreB" int))
       <> (SELECT count(DISTINCT x."setNumber") FROM jsonb_to_recordset(_sets) AS x("setNumber" int,"scoreA" int,"scoreB" int))
    THEN RAISE EXCEPTION 'Placar inválido'; END IF;
  SELECT count(*) INTO v_match_players FROM public.match_players WHERE match_id=_match_id;
  IF v_match_players < 2 OR NOT EXISTS(SELECT 1 FROM public.match_players WHERE match_id=_match_id AND team='A')
    OR NOT EXISTS(SELECT 1 FROM public.match_players WHERE match_id=_match_id AND team='B')
    THEN RAISE EXCEPTION 'Times incompletos'; END IF;
  SELECT count(*) FILTER(WHERE "scoreA">"scoreB"), count(*) FILTER(WHERE "scoreB">"scoreA"),
         sum("scoreA"),sum("scoreB") INTO v_sets_a,v_sets_b,v_games_a,v_games_b
  FROM jsonb_to_recordset(_sets) AS x("setNumber" int,"scoreA" int,"scoreB" int);
  v_winner := CASE WHEN v_sets_a>v_sets_b THEN 'A' WHEN v_sets_b>v_sets_a THEN 'B'
    WHEN v_games_a>v_games_b THEN 'A' WHEN v_games_b>v_games_a THEN 'B' ELSE NULL END;
  IF v_winner IS NULL AND NOT (v_format='singles' AND v_type IN ('rivalry','flexible'))
    THEN RAISE EXCEPTION 'Empate total — ajuste o placar ou adicione o tiebreak'; END IF;

  UPDATE public.matches SET status='completed',winner_team=v_winner,
    result_type=CASE WHEN v_winner IS NULL THEN 'draw' ELSE 'normal' END WHERE id=_match_id;
  DELETE FROM public.match_sets WHERE match_id=_match_id;
  INSERT INTO public.match_sets(match_id,set_number,score_team_a,score_team_b,is_tiebreak)
    SELECT _match_id,"setNumber","scoreA","scoreB",
      "setNumber"=(SELECT max(y."setNumber") FROM jsonb_to_recordset(_sets) AS y("setNumber" int))
       AND jsonb_array_length(_sets)>=3
    FROM jsonb_to_recordset(_sets) AS x("setNumber" int,"scoreA" int,"scoreB" int);
  UPDATE public.rounds SET status=CASE
    WHEN NOT EXISTS(SELECT 1 FROM public.matches WHERE round_id=v_round) THEN 'scheduled'
    WHEN NOT EXISTS(SELECT 1 FROM public.matches WHERE round_id=v_round AND status NOT IN ('completed','not_played','cancelled')) THEN 'completed'
    ELSE 'in_progress' END WHERE id=v_round;
  INSERT INTO public.round_presence(round_id,user_id,status,confirmed_at)
    SELECT v_round,user_id,'confirmed',now() FROM public.match_players WHERE match_id=_match_id
    ON CONFLICT (round_id,user_id) DO UPDATE SET status='confirmed',confirmed_at=excluded.confirmed_at;

  CREATE TEMP TABLE IF NOT EXISTS elo_replay_state(
    user_id uuid PRIMARY KEY, rating numeric NOT NULL DEFAULT 1000,
    matches_played int NOT NULL DEFAULT 0,matches_won int NOT NULL DEFAULT 0,
    sets_won int NOT NULL DEFAULT 0,sets_lost int NOT NULL DEFAULT 0,
    games_won int NOT NULL DEFAULT 0,games_lost int NOT NULL DEFAULT 0
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS elo_replay_events(
    match_id uuid,user_id uuid,season_id uuid,rating_before numeric,rating_after numeric,
    rating_change numeric,k_factor int,expected_score numeric,actual_score numeric,margin_multiplier numeric
  ) ON COMMIT DROP;
  TRUNCATE elo_replay_state, elo_replay_events;
  INSERT INTO elo_replay_state(user_id)
    SELECT DISTINCT mp.user_id FROM public.match_players mp JOIN public.matches m ON m.id=mp.match_id
    JOIN public.rounds r ON r.id=m.round_id WHERE r.season_id=_season_id AND m.status='completed'
      AND COALESCE(m.counts_for_ranking,true) AND NOT COALESCE(m.is_exhibition,false)
      AND EXISTS(SELECT 1 FROM public.match_sets ms WHERE ms.match_id=m.id);

  FOR v_match IN
    SELECT m.id,m.winner_team,
      count(*) FILTER(WHERE ms.score_team_a>ms.score_team_b)::int AS sa,
      count(*) FILTER(WHERE ms.score_team_b>ms.score_team_a)::int AS sb,
      sum(ms.score_team_a)::int AS ga,sum(ms.score_team_b)::int AS gb
    FROM public.matches m JOIN public.rounds r ON r.id=m.round_id
    JOIN public.match_sets ms ON ms.match_id=m.id
    WHERE r.season_id=_season_id AND m.status='completed'
      AND COALESCE(m.counts_for_ranking,true) AND NOT COALESCE(m.is_exhibition,false)
    GROUP BY m.id,m.winner_team,r.scheduled_date,r.round_number,m.match_number,m.created_at
    ORDER BY r.scheduled_date NULLS LAST,r.round_number NULLS LAST,m.match_number NULLS LAST,m.created_at,m.id
  LOOP
    SELECT avg(st.rating) FILTER(WHERE mp.team='A'),avg(st.rating) FILTER(WHERE mp.team='B')
      INTO v_avg_a,v_avg_b FROM public.match_players mp JOIN elo_replay_state st ON st.user_id=mp.user_id
      WHERE mp.match_id=v_match.id;
    IF v_avg_a IS NULL OR v_avg_b IS NULL THEN RAISE EXCEPTION 'Times incompletos na temporada'; END IF;
    v_expect_a := 1/(1+power(10::numeric,(v_avg_b-v_avg_a)/400));
    v_multiplier := CASE WHEN v_match.winner_team IS NULL THEN 1
      ELSE 1 + 0.1*abs(v_match.sa-v_match.sb) + 0.02*greatest(0,abs(v_match.ga-v_match.gb)) END;
    -- Matches with a games tiebreak use the winning side's set/game margin, not absolute margins.
    IF v_match.winner_team IS NOT NULL THEN
      v_multiplier := 1 + 0.1*(CASE WHEN v_match.winner_team='A' THEN v_match.sa-v_match.sb ELSE v_match.sb-v_match.sa END)
        + 0.02*greatest(0,CASE WHEN v_match.winner_team='A' THEN v_match.ga-v_match.gb ELSE v_match.gb-v_match.ga END);
    END IF;
    FOR v_player IN SELECT mp.user_id,mp.team,st.rating,st.matches_played
      FROM public.match_players mp JOIN elo_replay_state st ON st.user_id=mp.user_id WHERE mp.match_id=v_match.id
    LOOP
      v_expected := CASE WHEN v_player.team='A' THEN v_expect_a ELSE 1-v_expect_a END;
      v_actual := CASE WHEN v_match.winner_team IS NULL THEN 0.5 WHEN v_player.team=v_match.winner_team THEN 1 ELSE 0 END;
      v_k := CASE WHEN v_player.matches_played<10 THEN 40 WHEN v_player.matches_played<30 THEN 32 ELSE 28 END;
      v_change := round(v_k*v_multiplier*(v_actual-v_expected),2);
      v_is_winner := v_match.winner_team IS NOT NULL AND v_player.team=v_match.winner_team;
      v_team_sets := CASE WHEN v_player.team='A' THEN v_match.sa ELSE v_match.sb END;
      v_opp_sets := CASE WHEN v_player.team='A' THEN v_match.sb ELSE v_match.sa END;
      v_team_games := CASE WHEN v_player.team='A' THEN v_match.ga ELSE v_match.gb END;
      v_opp_games := CASE WHEN v_player.team='A' THEN v_match.gb ELSE v_match.ga END;
      INSERT INTO elo_replay_events VALUES (v_match.id,v_player.user_id,_season_id,v_player.rating,
        v_player.rating+v_change,v_change,v_k,v_expected,v_actual,v_multiplier);
      UPDATE elo_replay_state SET rating=rating+v_change,matches_played=matches_played+1,
        matches_won=matches_won+CASE WHEN v_is_winner THEN 1 ELSE 0 END,
        sets_won=sets_won+v_team_sets,sets_lost=sets_lost+v_opp_sets,
        games_won=games_won+v_team_games,games_lost=games_lost+v_opp_games WHERE user_id=v_player.user_id;
    END LOOP;
  END LOOP;
  DELETE FROM public.rating_events WHERE season_id=_season_id;
  INSERT INTO public.rating_events(match_id,user_id,season_id,rating_before,rating_after,rating_change,k_factor,expected_score,actual_score,margin_multiplier,recomputed_at)
    SELECT match_id,user_id,season_id,rating_before,rating_after,rating_change,k_factor,expected_score,actual_score,margin_multiplier,now()
    FROM elo_replay_events;
  -- Existing snapshot IDs remain stable for screens and references.
  UPDATE public.ranking_snapshots rs SET rating=st.rating,matches_played=st.matches_played,
    matches_won=st.matches_won,sets_won=st.sets_won,sets_lost=st.sets_lost,
    games_won=st.games_won,games_lost=st.games_lost,snapshot_date=current_date
    FROM elo_replay_state st WHERE rs.season_id=_season_id AND rs.user_id=st.user_id;
  INSERT INTO public.ranking_snapshots(season_id,user_id,rating,matches_played,matches_won,sets_won,sets_lost,games_won,games_lost)
    SELECT _season_id,st.user_id,st.rating,st.matches_played,st.matches_won,st.sets_won,st.sets_lost,st.games_won,st.games_lost
    FROM elo_replay_state st WHERE NOT EXISTS(SELECT 1 FROM public.ranking_snapshots rs WHERE rs.season_id=_season_id AND rs.user_id=st.user_id);
  DELETE FROM public.ranking_snapshots rs WHERE rs.season_id=_season_id AND NOT EXISTS(SELECT 1 FROM elo_replay_state st WHERE st.user_id=rs.user_id);
  PERFORM public.refresh_season_ranking_eligibility(_season_id);
  RETURN QUERY SELECT v_winner,v_sets_a,v_sets_b,(v_status='completed');
END;
$fn$;
REVOKE ALL ON FUNCTION public.save_match_score_consistently(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_match_score_consistently(uuid,uuid,jsonb) TO authenticated;