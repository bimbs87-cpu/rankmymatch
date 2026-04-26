
-- Allow public read of player stats for public groups
CREATE POLICY "Anyone views stats of public groups"
ON public.player_stats_by_season FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.seasons s
  JOIN public.groups g ON g.id = s.group_id
  WHERE s.id = player_stats_by_season.season_id
    AND g.visibility = 'public' AND g.status = 'active'
));

-- Allow public read of rating events for public groups
CREATE POLICY "Anyone views rating events of public groups"
ON public.rating_events FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.matches m
  JOIN public.rounds r ON r.id = m.round_id
  JOIN public.groups g ON g.id = r.group_id
  WHERE m.id = rating_events.match_id
    AND g.visibility = 'public' AND g.status = 'active'
));

-- Allow public read of courts for public groups
CREATE POLICY "Anyone views courts of public groups"
ON public.courts FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.rounds r
  JOIN public.groups g ON g.id = r.group_id
  WHERE r.id = courts.round_id
    AND g.visibility = 'public' AND g.status = 'active'
));

-- Allow public read of match confirmations for public groups
CREATE POLICY "Anyone views confirmations of public groups"
ON public.match_confirmations FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.matches m
  JOIN public.rounds r ON r.id = m.round_id
  JOIN public.groups g ON g.id = r.group_id
  WHERE m.id = match_confirmations.match_id
    AND g.visibility = 'public' AND g.status = 'active'
));
