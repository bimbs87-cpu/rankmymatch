
-- Seasons
CREATE TABLE public.seasons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'finished', 'cancelled')),
  start_date DATE,
  end_date DATE,
  duration_type TEXT DEFAULT 'custom' CHECK (duration_type IN ('1_month', '2_months', '3_months', '6_months', '1_year', 'custom')),
  total_rounds INTEGER,
  rounds_per_week INTEGER DEFAULT 1,
  scoring_format JSONB DEFAULT '{"sets": 3, "games_per_set": 6, "tiebreak_at": 6, "tiebreak_points": 7}'::jsonb,
  match_format TEXT NOT NULL DEFAULT '2v2' CHECK (match_format IN ('2v2', '1v1')),
  min_eligibility_pct NUMERIC NOT NULL DEFAULT 30,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rounds
CREATE TABLE public.rounds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  round_number INTEGER,
  scheduled_date DATE,
  scheduled_time TIME,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'postponed')),
  max_players INTEGER NOT NULL DEFAULT 4,
  location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Round presence
CREATE TABLE public.round_presence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'waiting', 'absent', 'cancelled')),
  confirmed_at TIMESTAMPTZ,
  position_in_queue INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id, user_id)
);

-- Waiting list
CREATE TABLE public.waiting_list (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  position INTEGER NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id, user_id)
);

-- Courts
CREATE TABLE public.courts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  court_number INTEGER NOT NULL DEFAULT 1,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waiting_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;

-- Policies: members can view, admins can manage
CREATE POLICY "Members can view seasons" ON public.seasons FOR SELECT USING (public.is_group_member(auth.uid(), group_id));
CREATE POLICY "Admins can manage seasons" ON public.seasons FOR ALL USING (public.is_group_admin(auth.uid(), group_id));

CREATE POLICY "Members can view rounds" ON public.rounds FOR SELECT USING (public.is_group_member(auth.uid(), group_id));
CREATE POLICY "Admins can manage rounds" ON public.rounds FOR ALL USING (public.is_group_admin(auth.uid(), group_id));

CREATE POLICY "Members can view presence" ON public.round_presence FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND public.is_group_member(auth.uid(), r.group_id))
);
CREATE POLICY "Users can manage own presence" ON public.round_presence FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own presence" ON public.round_presence FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Members can view waiting list" ON public.waiting_list FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND public.is_group_member(auth.uid(), r.group_id))
);
CREATE POLICY "Users can join waiting list" ON public.waiting_list FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members can view courts" ON public.courts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND public.is_group_member(auth.uid(), r.group_id))
);
CREATE POLICY "Admins can manage courts" ON public.courts FOR ALL USING (
  EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND public.is_group_admin(auth.uid(), r.group_id))
);

-- Triggers
CREATE TRIGGER update_seasons_updated_at BEFORE UPDATE ON public.seasons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_rounds_updated_at BEFORE UPDATE ON public.rounds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_round_presence_updated_at BEFORE UPDATE ON public.round_presence FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_seasons_group ON public.seasons(group_id);
CREATE INDEX idx_rounds_season ON public.rounds(season_id);
CREATE INDEX idx_rounds_group ON public.rounds(group_id);
CREATE INDEX idx_round_presence_round ON public.round_presence(round_id);
CREATE INDEX idx_waiting_list_round ON public.waiting_list(round_id);
