
-- Allow admins to delete matches
CREATE POLICY "Admins can delete matches"
ON public.matches
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM rounds r
  WHERE r.id = matches.round_id AND is_group_admin(auth.uid(), r.group_id)
));

-- Add cascade delete foreign keys for match_players and match_sets
ALTER TABLE public.match_players
  DROP CONSTRAINT IF EXISTS match_players_match_id_fkey,
  ADD CONSTRAINT match_players_match_id_fkey
    FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;

ALTER TABLE public.match_sets
  DROP CONSTRAINT IF EXISTS match_sets_match_id_fkey,
  ADD CONSTRAINT match_sets_match_id_fkey
    FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;

-- Also cascade match_confirmations
ALTER TABLE public.match_confirmations
  DROP CONSTRAINT IF EXISTS match_confirmations_match_id_fkey,
  ADD CONSTRAINT match_confirmations_match_id_fkey
    FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
