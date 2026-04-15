
-- Matches
CREATE TABLE public.matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  court_id UUID REFERENCES public.courts(id) ON DELETE SET NULL,
  match_number INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'wo', 'not_played')),
  result_type TEXT CHECK (result_type IN ('normal', 'wo', 'forfeit', 'draw', 'cancelled', 'not_played')),
  winner_team TEXT CHECK (winner_team IN ('A', 'B')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Match players
CREATE TABLE public.match_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  team TEXT NOT NULL CHECK (team IN ('A', 'B')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(match_id, user_id)
);

-- Match sets
CREATE TABLE public.match_sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL,
  score_team_a INTEGER NOT NULL DEFAULT 0,
  score_team_b INTEGER NOT NULL DEFAULT 0,
  is_tiebreak BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Match confirmations
CREATE TABLE public.match_confirmations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  confirmed BOOLEAN NOT NULL DEFAULT false,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(match_id, user_id)
);

-- Rating events (Elo log)
CREATE TABLE public.rating_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE,
  rating_before NUMERIC NOT NULL,
  rating_after NUMERIC NOT NULL,
  rating_change NUMERIC NOT NULL,
  k_factor NUMERIC NOT NULL DEFAULT 28,
  expected_score NUMERIC,
  actual_score NUMERIC,
  margin_multiplier NUMERIC DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ranking snapshots
CREATE TABLE public.ranking_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rating NUMERIC NOT NULL DEFAULT 1000,
  position INTEGER,
  matches_played INTEGER NOT NULL DEFAULT 0,
  matches_won INTEGER NOT NULL DEFAULT 0,
  sets_won INTEGER NOT NULL DEFAULT 0,
  sets_lost INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  games_lost INTEGER NOT NULL DEFAULT 0,
  is_eligible BOOLEAN NOT NULL DEFAULT false,
  last_5_results TEXT[] DEFAULT '{}',
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rating_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranking_snapshots ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Members can view matches" ON public.matches FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND public.is_group_member(auth.uid(), r.group_id))
);
CREATE POLICY "Members can create matches" ON public.matches FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND public.is_group_member(auth.uid(), r.group_id))
);
CREATE POLICY "Admins can update matches" ON public.matches FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND public.is_group_admin(auth.uid(), r.group_id))
);

CREATE POLICY "Members can view match players" ON public.match_players FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.matches m JOIN public.rounds r ON r.id = m.round_id WHERE m.id = match_id AND public.is_group_member(auth.uid(), r.group_id))
);
CREATE POLICY "Members can add match players" ON public.match_players FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.matches m JOIN public.rounds r ON r.id = m.round_id WHERE m.id = match_id AND public.is_group_member(auth.uid(), r.group_id))
);

CREATE POLICY "Members can view match sets" ON public.match_sets FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.matches m JOIN public.rounds r ON r.id = m.round_id WHERE m.id = match_id AND public.is_group_member(auth.uid(), r.group_id))
);
CREATE POLICY "Members can add match sets" ON public.match_sets FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.matches m JOIN public.rounds r ON r.id = m.round_id WHERE m.id = match_id AND public.is_group_member(auth.uid(), r.group_id))
);

CREATE POLICY "Players can manage confirmations" ON public.match_confirmations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Members can view confirmations" ON public.match_confirmations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.matches m JOIN public.rounds r ON r.id = m.round_id WHERE m.id = match_id AND public.is_group_member(auth.uid(), r.group_id))
);

CREATE POLICY "Members can view rating events" ON public.rating_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.matches m JOIN public.rounds r ON r.id = m.round_id WHERE m.id = match_id AND public.is_group_member(auth.uid(), r.group_id))
);

CREATE POLICY "Members can view rankings" ON public.ranking_snapshots FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.seasons s WHERE s.id = season_id AND public.is_group_member(auth.uid(), s.group_id))
);

-- Triggers
CREATE TRIGGER update_matches_updated_at BEFORE UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ranking_snapshots_updated_at BEFORE UPDATE ON public.ranking_snapshots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_matches_round ON public.matches(round_id);
CREATE INDEX idx_match_players_match ON public.match_players(match_id);
CREATE INDEX idx_match_sets_match ON public.match_sets(match_id);
CREATE INDEX idx_rating_events_match ON public.rating_events(match_id);
CREATE INDEX idx_rating_events_user ON public.rating_events(user_id);
CREATE INDEX idx_ranking_snapshots_season ON public.ranking_snapshots(season_id);
CREATE INDEX idx_ranking_snapshots_user ON public.ranking_snapshots(user_id);
