-- Update merge_placeholder_player to also support "former members" (status='removed')
-- where the placeholder_user_id is actually a real (former) user, and the claimer
-- might already have a group_members row in the same group.
CREATE OR REPLACE FUNCTION public.merge_placeholder_player(_placeholder_user_id uuid, _real_user_id uuid, _group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_placeholder boolean;
  _claimer_has_row boolean;
BEGIN
  -- Check if the source profile is a true placeholder (no auth user) or a former member
  SELECT COALESCE(is_placeholder, false) INTO _is_placeholder
  FROM user_profiles WHERE user_id = _placeholder_user_id;

  -- Check if claimer already has a group_members row in this group
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE user_id = _real_user_id AND group_id = _group_id
  ) INTO _claimer_has_row;

  -- Handle group_members merge:
  -- If claimer already has a row, delete the source's row to avoid unique conflicts.
  -- Otherwise, transfer the source's row to the claimer (and reactivate it).
  IF _claimer_has_row THEN
    -- Make sure claimer row is active
    UPDATE group_members
    SET status = 'active', updated_at = now()
    WHERE user_id = _real_user_id AND group_id = _group_id;

    DELETE FROM group_members
    WHERE user_id = _placeholder_user_id AND group_id = _group_id;
  ELSE
    UPDATE group_members
    SET user_id = _real_user_id, status = 'active', updated_at = now()
    WHERE user_id = _placeholder_user_id AND group_id = _group_id;
  END IF;

  -- Migrate match history within this group
  UPDATE match_players SET user_id = _real_user_id
  WHERE user_id = _placeholder_user_id
    AND match_id IN (
      SELECT m.id FROM matches m
      JOIN rounds r ON r.id = m.round_id
      WHERE r.group_id = _group_id
    );

  UPDATE round_presence SET user_id = _real_user_id
  WHERE user_id = _placeholder_user_id
    AND round_id IN (SELECT id FROM rounds WHERE group_id = _group_id);

  UPDATE ranking_snapshots SET user_id = _real_user_id
  WHERE user_id = _placeholder_user_id
    AND season_id IN (SELECT id FROM seasons WHERE group_id = _group_id);

  UPDATE rating_events SET user_id = _real_user_id
  WHERE user_id = _placeholder_user_id
    AND match_id IN (
      SELECT m.id FROM matches m
      JOIN rounds r ON r.id = m.round_id
      WHERE r.group_id = _group_id
    );

  UPDATE player_stats_by_season SET user_id = _real_user_id
  WHERE user_id = _placeholder_user_id
    AND season_id IN (SELECT id FROM seasons WHERE group_id = _group_id);

  UPDATE match_confirmations SET user_id = _real_user_id
  WHERE user_id = _placeholder_user_id
    AND match_id IN (
      SELECT m.id FROM matches m
      JOIN rounds r ON r.id = m.round_id
      WHERE r.group_id = _group_id
    );

  -- Only delete profile if it's a true placeholder (no real auth account behind it)
  IF _is_placeholder THEN
    DELETE FROM user_profiles WHERE user_id = _placeholder_user_id AND is_placeholder = true;
  END IF;

  -- Resolve any pending claim
  UPDATE player_claims
  SET status = 'approved', resolved_at = now(), resolved_by = _real_user_id
  WHERE placeholder_user_id = _placeholder_user_id
    AND group_id = _group_id
    AND status = 'pending';
END;
$function$;