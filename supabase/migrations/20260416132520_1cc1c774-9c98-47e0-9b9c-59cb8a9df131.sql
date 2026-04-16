
-- Add placeholder support to user_profiles
ALTER TABLE public.user_profiles ADD COLUMN is_placeholder boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_profiles ADD COLUMN created_by_admin uuid;

-- Create player_claims table
CREATE TABLE public.player_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  placeholder_user_id uuid NOT NULL,
  claimer_user_id uuid NOT NULL,
  group_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);

ALTER TABLE public.player_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create claims" ON public.player_claims
  FOR INSERT WITH CHECK (auth.uid() = claimer_user_id);

CREATE POLICY "Users can view own claims" ON public.player_claims
  FOR SELECT USING (auth.uid() = claimer_user_id);

CREATE POLICY "Admins can view group claims" ON public.player_claims
  FOR SELECT USING (is_group_admin(auth.uid(), group_id));

CREATE POLICY "Admins can update claims" ON public.player_claims
  FOR UPDATE USING (is_group_admin(auth.uid(), group_id));

-- Function to merge placeholder into real user when claim is approved
CREATE OR REPLACE FUNCTION public.merge_placeholder_player(
  _placeholder_user_id uuid,
  _real_user_id uuid,
  _group_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Update group_members
  UPDATE group_members SET user_id = _real_user_id, updated_at = now()
  WHERE user_id = _placeholder_user_id AND group_id = _group_id;

  -- Update match_players for matches in this group
  UPDATE match_players SET user_id = _real_user_id
  WHERE user_id = _placeholder_user_id
    AND match_id IN (
      SELECT m.id FROM matches m
      JOIN rounds r ON r.id = m.round_id
      WHERE r.group_id = _group_id
    );

  -- Update round_presence for rounds in this group
  UPDATE round_presence SET user_id = _real_user_id
  WHERE user_id = _placeholder_user_id
    AND round_id IN (SELECT id FROM rounds WHERE group_id = _group_id);

  -- Update ranking_snapshots for seasons in this group
  UPDATE ranking_snapshots SET user_id = _real_user_id
  WHERE user_id = _placeholder_user_id
    AND season_id IN (SELECT id FROM seasons WHERE group_id = _group_id);

  -- Update rating_events for matches in this group
  UPDATE rating_events SET user_id = _real_user_id
  WHERE user_id = _placeholder_user_id
    AND match_id IN (
      SELECT m.id FROM matches m
      JOIN rounds r ON r.id = m.round_id
      WHERE r.group_id = _group_id
    );

  -- Update player_stats_by_season for seasons in this group
  UPDATE player_stats_by_season SET user_id = _real_user_id
  WHERE user_id = _placeholder_user_id
    AND season_id IN (SELECT id FROM seasons WHERE group_id = _group_id);

  -- Update match_confirmations for matches in this group
  UPDATE match_confirmations SET user_id = _real_user_id
  WHERE user_id = _placeholder_user_id
    AND match_id IN (
      SELECT m.id FROM matches m
      JOIN rounds r ON r.id = m.round_id
      WHERE r.group_id = _group_id
    );

  -- Delete placeholder profile
  DELETE FROM user_profiles WHERE user_id = _placeholder_user_id AND is_placeholder = true;

  -- Update claim status
  UPDATE player_claims SET status = 'approved', resolved_at = now(), resolved_by = _real_user_id
  WHERE placeholder_user_id = _placeholder_user_id AND group_id = _group_id AND status = 'pending';
END;
$$;
