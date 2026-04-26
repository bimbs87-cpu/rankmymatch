-- Backfill: cleanup nicknames (remove digits) for fictional members, and
-- rebuild player_stats_by_season + ranking_snapshots from existing matches/rating_events.

-- 1) Strip digits from nicknames of fictional profiles, dedupe with suffix letters
WITH cleaned AS (
  SELECT user_id,
         NULLIF(regexp_replace(nickname, '[0-9]+', '', 'g'), '') AS new_nick
  FROM public.user_profiles
  WHERE created_by_admin IS NOT NULL
    AND nickname IS NOT NULL
    AND nickname ~ '[0-9]'
)
UPDATE public.user_profiles up
SET nickname = c.new_nick
FROM cleaned c
WHERE up.user_id = c.user_id
  AND c.new_nick IS NOT NULL
  AND length(c.new_nick) >= 2;

-- 2) Rebuild player_stats_by_season for all fictional groups
DO $$
DECLARE
  v_season RECORD;
BEGIN
  FOR v_season IN
    SELECT s.id AS season_id, s.match_format, s.group_id
    FROM public.seasons s
    JOIN public.groups g ON g.id = s.group_id
    WHERE g.is_fictional = true
  LOOP
    -- Stats
    DELETE FROM public.player_stats_by_season WHERE season_id = v_season.season_id;

    INSERT INTO public.player_stats_by_season (
      season_id, user_id, matches_played, matches_won,
      sets_won, sets_lost, games_won, games_lost,
      rounds_present, rounds_absent, reliability_score
    )
    SELECT
      v_season.season_id,
      mp.user_id,
      COUNT(DISTINCT m.id) AS matches_played,
      COUNT(DISTINCT m.id) FILTER (WHERE m.winner_team = mp.team) AS matches_won,
      COALESCE(SUM(CASE WHEN mp.team='A' THEN sets_a ELSE sets_b END), 0) AS sets_won,
      COALESCE(SUM(CASE WHEN mp.team='A' THEN sets_b ELSE sets_a END), 0) AS sets_lost,
      COALESCE(SUM(CASE WHEN mp.team='A' THEN games_a ELSE games_b END), 0) AS games_won,
      COALESCE(SUM(CASE WHEN mp.team='A' THEN games_b ELSE games_a END), 0) AS games_lost,
      0, 0, 0
    FROM public.matches m
    JOIN public.rounds r ON r.id = m.round_id
    JOIN public.match_players mp ON mp.match_id = m.id
    LEFT JOIN LATERAL (
      SELECT
        SUM(CASE WHEN ms.score_team_a > ms.score_team_b THEN 1 ELSE 0 END) AS sets_a,
        SUM(CASE WHEN ms.score_team_b > ms.score_team_a THEN 1 ELSE 0 END) AS sets_b,
        SUM(ms.score_team_a) AS games_a,
        SUM(ms.score_team_b) AS games_b
      FROM public.match_sets ms
      WHERE ms.match_id = m.id
    ) agg ON true
    WHERE r.season_id = v_season.season_id
      AND m.status = 'completed'
    GROUP BY mp.user_id;

    -- Snapshots (latest rating per user)
    DELETE FROM public.ranking_snapshots WHERE season_id = v_season.season_id;

    INSERT INTO public.ranking_snapshots (
      season_id, user_id, rating, position, is_eligible, match_format,
      matches_played, matches_won, sets_won, sets_lost, games_won, games_lost,
      snapshot_date
    )
    SELECT
      v_season.season_id,
      ranked.user_id,
      ranked.rating,
      ROW_NUMBER() OVER (ORDER BY ranked.rating DESC) AS position,
      COALESCE(pss.matches_played, 0) > 0 AS is_eligible,
      v_season.match_format,
      COALESCE(pss.matches_played, 0),
      COALESCE(pss.matches_won, 0),
      COALESCE(pss.sets_won, 0),
      COALESCE(pss.sets_lost, 0),
      COALESCE(pss.games_won, 0),
      COALESCE(pss.games_lost, 0),
      CURRENT_DATE
    FROM (
      SELECT DISTINCT ON (re.user_id)
        re.user_id, re.rating_after AS rating
      FROM public.rating_events re
      WHERE re.season_id = v_season.season_id
      ORDER BY re.user_id, re.created_at DESC
    ) ranked
    LEFT JOIN public.player_stats_by_season pss
      ON pss.season_id = v_season.season_id AND pss.user_id = ranked.user_id;
  END LOOP;
END $$;