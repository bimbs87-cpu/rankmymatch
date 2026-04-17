-- Function to merge a former member's history into an active member who has no results yet.
-- Only group admins may call this. Used to "claim" an ex-member's history for a new account
-- that hasn't played any matches yet in the group.
CREATE OR REPLACE FUNCTION public.merge_former_member_into_active(
  _group_id uuid,
  _former_user_id uuid,
  _target_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_admin boolean;
  _former_status text;
  _target_status text;
  _target_has_results boolean;
  _target_has_row boolean;
BEGIN
  -- Only group admins may merge
  SELECT public.is_group_admin(auth.uid(), _group_id) INTO _is_admin;
  IF NOT _is_admin THEN
    RAISE EXCEPTION 'Only group admins can merge members';
  END IF;

  IF _former_user_id = _target_user_id THEN
    RAISE EXCEPTION 'Source and target must be different users';
  END IF;

  -- Validate former member: must have a non-active group_members row in this group
  SELECT status INTO _former_status
  FROM group_members
  WHERE group_id = _group_id AND user_id = _former_user_id
  LIMIT 1;
  IF _former_status IS NULL THEN
    RAISE EXCEPTION 'Source user is not a member of this group';
  END IF;
  IF _former_status = 'active' THEN
    RAISE EXCEPTION 'Source user must be a former member (not active)';
  END IF;

  -- Validate target member: must be active in this group
  SELECT status INTO _target_status
  FROM group_members
  WHERE group_id = _group_id AND user_id = _target_user_id
  LIMIT 1;
  IF _target_status IS NULL OR _target_status <> 'active' THEN
    RAISE EXCEPTION 'Target user must be an active member of this group';
  END IF;

  -- Target must NOT have any match history in this group
  SELECT EXISTS (
    SELECT 1 FROM match_players mp
    JOIN matches m ON m.id = mp.match_id
    JOIN rounds r ON r.id = m.round_id
    WHERE r.group_id = _group_id AND mp.user_id = _target_user_id
  ) INTO _target_has_results;
  IF _target_has_results THEN
    RAISE EXCEPTION 'Target user already has match results in this group';
  END IF;

  -- Target already has a (active) row — keep it, just remove the source row
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = _group_id AND user_id = _target_user_id
  ) INTO _target_has_row;

  -- Migrate match history within this group
  UPDATE match_players SET user_id = _target_user_id
  WHERE user_id = _former_user_id
    AND match_id IN (
      SELECT m.id FROM matches m
      JOIN rounds r ON r.id = m.round_id
      WHERE r.group_id = _group_id
    );

  UPDATE round_presence SET user_id = _target_user_id
  WHERE user_id = _former_user_id
    AND round_id IN (SELECT id FROM rounds WHERE group_id = _group_id);

  UPDATE ranking_snapshots SET user_id = _target_user_id
  WHERE user_id = _former_user_id
    AND season_id IN (SELECT id FROM seasons WHERE group_id = _group_id);

  UPDATE rating_events SET user_id = _target_user_id
  WHERE user_id = _former_user_id
    AND match_id IN (
      SELECT m.id FROM matches m
      JOIN rounds r ON r.id = m.round_id
      WHERE r.group_id = _group_id
    );

  UPDATE player_stats_by_season SET user_id = _target_user_id
  WHERE user_id = _former_user_id
    AND season_id IN (SELECT id FROM seasons WHERE group_id = _group_id);

  UPDATE match_confirmations SET user_id = _target_user_id
  WHERE user_id = _former_user_id
    AND match_id IN (
      SELECT m.id FROM matches m
      JOIN rounds r ON r.id = m.round_id
      WHERE r.group_id = _group_id
    );

  -- Remove the former member's row in this group (target row stays active)
  IF _target_has_row THEN
    UPDATE group_members SET status = 'active', updated_at = now()
    WHERE group_id = _group_id AND user_id = _target_user_id;
    DELETE FROM group_members
    WHERE group_id = _group_id AND user_id = _former_user_id;
  ELSE
    -- Shouldn't happen given validation above, but handle gracefully
    UPDATE group_members
    SET user_id = _target_user_id, status = 'active', updated_at = now()
    WHERE group_id = _group_id AND user_id = _former_user_id;
  END IF;
END;
$function$;