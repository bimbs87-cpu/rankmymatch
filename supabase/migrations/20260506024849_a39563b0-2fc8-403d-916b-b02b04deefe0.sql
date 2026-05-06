ALTER TABLE public.casual_match_sets
  ADD COLUMN team_a_participant_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN team_b_participant_ids uuid[] NOT NULL DEFAULT '{}';