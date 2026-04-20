-- Pending match results awaiting admin approval
CREATE TABLE public.pending_match_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL,
  sets jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one active pending per match
CREATE UNIQUE INDEX pending_match_results_one_active_per_match
  ON public.pending_match_results(match_id)
  WHERE status = 'pending';

CREATE INDEX pending_match_results_status_idx ON public.pending_match_results(status);
CREATE INDEX pending_match_results_match_idx ON public.pending_match_results(match_id);

ALTER TABLE public.pending_match_results ENABLE ROW LEVEL SECURITY;

-- View: members of the group can view pendings of matches in their group
CREATE POLICY "Members view pending results"
  ON public.pending_match_results
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.rounds r ON r.id = m.round_id
      WHERE m.id = pending_match_results.match_id
        AND public.is_group_member(auth.uid(), r.group_id)
    )
  );

-- Insert: only the submitter, and only if they are a player in the match
CREATE POLICY "Players submit pending results"
  ON public.pending_match_results
  FOR INSERT
  WITH CHECK (
    auth.uid() = submitted_by
    AND EXISTS (
      SELECT 1 FROM public.match_players mp
      WHERE mp.match_id = pending_match_results.match_id
        AND mp.user_id = auth.uid()
    )
  );

-- Update: only admins of the group
CREATE POLICY "Admins update pending results"
  ON public.pending_match_results
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.rounds r ON r.id = m.round_id
      WHERE m.id = pending_match_results.match_id
        AND public.is_group_admin(auth.uid(), r.group_id)
    )
  );

-- Delete: only admins
CREATE POLICY "Admins delete pending results"
  ON public.pending_match_results
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.rounds r ON r.id = m.round_id
      WHERE m.id = pending_match_results.match_id
        AND public.is_group_admin(auth.uid(), r.group_id)
    )
  );

-- updated_at trigger
CREATE TRIGGER pending_match_results_set_updated_at
  BEFORE UPDATE ON public.pending_match_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();