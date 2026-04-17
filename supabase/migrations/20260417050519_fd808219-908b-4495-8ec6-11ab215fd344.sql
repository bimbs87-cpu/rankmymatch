
-- 1) Add visibility column to groups (3 states: public, private, hidden)
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'private', 'hidden'));

-- Backfill from existing is_public
UPDATE public.groups
SET visibility = CASE WHEN is_public THEN 'public' ELSE 'private' END
WHERE visibility = 'public' AND is_public = false;

-- 2) Add claim fields to group_join_requests for self-identification
ALTER TABLE public.group_join_requests
  ADD COLUMN IF NOT EXISTS claimed_player_id uuid,
  ADD COLUMN IF NOT EXISTS claimed_player_kind text
  CHECK (claimed_player_kind IS NULL OR claimed_player_kind IN ('placeholder', 'former'));

-- 3) Update SELECT policy on groups: only show non-hidden public groups to anyone
DROP POLICY IF EXISTS "Anyone can view public active groups" ON public.groups;
CREATE POLICY "Anyone can view non-hidden active groups"
  ON public.groups FOR SELECT
  USING (
    status = 'active'
    AND visibility IN ('public', 'private')
  );

-- 4) Allow non-members to view content of PUBLIC (not private/hidden) groups:
--    rounds, seasons, ranking_snapshots, matches, match_players, match_sets
--    Members keep their existing access via is_group_member

CREATE POLICY "Anyone views rounds of public groups"
  ON public.rounds FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = rounds.group_id
      AND g.visibility = 'public'
      AND g.status = 'active'
  ));

CREATE POLICY "Anyone views seasons of public groups"
  ON public.seasons FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = seasons.group_id
      AND g.visibility = 'public'
      AND g.status = 'active'
  ));

CREATE POLICY "Anyone views rankings of public groups"
  ON public.ranking_snapshots FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.seasons s
    JOIN public.groups g ON g.id = s.group_id
    WHERE s.id = ranking_snapshots.season_id
      AND g.visibility = 'public'
      AND g.status = 'active'
  ));

CREATE POLICY "Anyone views matches of public groups"
  ON public.matches FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.rounds r
    JOIN public.groups g ON g.id = r.group_id
    WHERE r.id = matches.round_id
      AND g.visibility = 'public'
      AND g.status = 'active'
  ));

CREATE POLICY "Anyone views match_players of public groups"
  ON public.match_players FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.matches m
    JOIN public.rounds r ON r.id = m.round_id
    JOIN public.groups g ON g.id = r.group_id
    WHERE m.id = match_players.match_id
      AND g.visibility = 'public'
      AND g.status = 'active'
  ));

CREATE POLICY "Anyone views match_sets of public groups"
  ON public.match_sets FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.matches m
    JOIN public.rounds r ON r.id = m.round_id
    JOIN public.groups g ON g.id = r.group_id
    WHERE m.id = match_sets.match_id
      AND g.visibility = 'public'
      AND g.status = 'active'
  ));

-- Allow non-members to view active group_members of public groups (so they can see who's in)
CREATE POLICY "Anyone views members of public groups"
  ON public.group_members FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = group_members.group_id
      AND g.visibility = 'public'
      AND g.status = 'active'
  ));
