-- Allow admins to update/delete match_sets
CREATE POLICY "Admins can update match sets"
ON public.match_sets FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM matches m JOIN rounds r ON r.id = m.round_id
  WHERE m.id = match_sets.match_id AND is_group_admin(auth.uid(), r.group_id)
));

CREATE POLICY "Admins can delete match sets"
ON public.match_sets FOR DELETE
USING (EXISTS (
  SELECT 1 FROM matches m JOIN rounds r ON r.id = m.round_id
  WHERE m.id = match_sets.match_id AND is_group_admin(auth.uid(), r.group_id)
));

-- Allow admins to update/delete match_players
CREATE POLICY "Admins can update match players"
ON public.match_players FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM matches m JOIN rounds r ON r.id = m.round_id
  WHERE m.id = match_players.match_id AND is_group_admin(auth.uid(), r.group_id)
));

CREATE POLICY "Admins can delete match players"
ON public.match_players FOR DELETE
USING (EXISTS (
  SELECT 1 FROM matches m JOIN rounds r ON r.id = m.round_id
  WHERE m.id = match_players.match_id AND is_group_admin(auth.uid(), r.group_id)
));

-- Allow admins to insert rating_events
CREATE POLICY "Admins can insert rating events"
ON public.rating_events FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM matches m JOIN rounds r ON r.id = m.round_id
  WHERE m.id = rating_events.match_id AND is_group_admin(auth.uid(), r.group_id)
));

-- Allow admins to manage ranking_snapshots
CREATE POLICY "Admins can insert ranking snapshots"
ON public.ranking_snapshots FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM seasons s
  WHERE s.id = ranking_snapshots.season_id AND is_group_admin(auth.uid(), s.group_id)
));

CREATE POLICY "Admins can update ranking snapshots"
ON public.ranking_snapshots FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM seasons s
  WHERE s.id = ranking_snapshots.season_id AND is_group_admin(auth.uid(), s.group_id)
));

-- Allow admins to manage player_stats_by_season
CREATE POLICY "Admins can insert player stats"
ON public.player_stats_by_season FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM seasons s
  WHERE s.id = player_stats_by_season.season_id AND is_group_admin(auth.uid(), s.group_id)
));

CREATE POLICY "Admins can update player stats"
ON public.player_stats_by_season FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM seasons s
  WHERE s.id = player_stats_by_season.season_id AND is_group_admin(auth.uid(), s.group_id)
));