-- Personal contacts: pre-cadastro de jogadores que o usuário enfrenta em jogos avulsos
CREATE TABLE public.personal_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  display_name TEXT NOT NULL,
  nickname TEXT,
  linked_user_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_personal_contacts_owner ON public.personal_contacts(owner_user_id);
CREATE UNIQUE INDEX idx_personal_contacts_owner_name ON public.personal_contacts(owner_user_id, lower(display_name));

ALTER TABLE public.personal_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages own contacts" ON public.personal_contacts FOR ALL
  USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

CREATE TRIGGER trg_personal_contacts_updated
  BEFORE UPDATE ON public.personal_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Casual matches: jogos avulsos sem vínculo a grupo
CREATE TABLE public.casual_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  match_format TEXT NOT NULL DEFAULT 'doubles', -- 'singles' | 'doubles'
  played_on DATE NOT NULL DEFAULT CURRENT_DATE,
  played_at_time TIME,
  location TEXT,
  notes TEXT,
  winner_team TEXT, -- 'a' | 'b' | null
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT casual_matches_format_chk CHECK (match_format IN ('singles','doubles')),
  CONSTRAINT casual_matches_winner_chk CHECK (winner_team IS NULL OR winner_team IN ('a','b'))
);
CREATE INDEX idx_casual_matches_owner ON public.casual_matches(owner_user_id, played_on DESC);

ALTER TABLE public.casual_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages own casual matches" ON public.casual_matches FOR ALL
  USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

CREATE TRIGGER trg_casual_matches_updated
  BEFORE UPDATE ON public.casual_matches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Casual match participants
CREATE TABLE public.casual_match_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.casual_matches(id) ON DELETE CASCADE,
  team TEXT NOT NULL, -- 'a' | 'b'
  contact_id UUID REFERENCES public.personal_contacts(id) ON DELETE SET NULL,
  linked_user_id UUID, -- if a real app user
  display_name TEXT NOT NULL, -- snapshot name (always present)
  is_owner BOOLEAN NOT NULL DEFAULT false, -- the registering user themselves
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT casual_match_participants_team_chk CHECK (team IN ('a','b'))
);
CREATE INDEX idx_casual_participants_match ON public.casual_match_participants(match_id);
CREATE INDEX idx_casual_participants_contact ON public.casual_match_participants(contact_id);

ALTER TABLE public.casual_match_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages own casual participants" ON public.casual_match_participants FOR ALL
  USING (EXISTS (SELECT 1 FROM public.casual_matches m WHERE m.id = match_id AND m.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.casual_matches m WHERE m.id = match_id AND m.owner_user_id = auth.uid()));

-- Casual match sets
CREATE TABLE public.casual_match_sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.casual_matches(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL,
  score_team_a INTEGER NOT NULL DEFAULT 0,
  score_team_b INTEGER NOT NULL DEFAULT 0,
  is_tiebreak BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, set_number)
);
CREATE INDEX idx_casual_sets_match ON public.casual_match_sets(match_id);

ALTER TABLE public.casual_match_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages own casual sets" ON public.casual_match_sets FOR ALL
  USING (EXISTS (SELECT 1 FROM public.casual_matches m WHERE m.id = match_id AND m.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.casual_matches m WHERE m.id = match_id AND m.owner_user_id = auth.uid()));