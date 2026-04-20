
-- Tabela de aquisição (origem do cadastro)
CREATE TABLE public.user_acquisition (
  user_id UUID PRIMARY KEY,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  invite_code TEXT,
  referrer TEXT,
  landing_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_acquisition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own acquisition"
ON public.user_acquisition FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own acquisition"
ON public.user_acquisition FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "App admins view all acquisition"
ON public.user_acquisition FOR SELECT
USING (public.is_app_admin(auth.uid()));

CREATE INDEX idx_user_acquisition_utm_source ON public.user_acquisition(utm_source);
CREATE INDEX idx_user_acquisition_invite_code ON public.user_acquisition(invite_code);
CREATE INDEX idx_user_acquisition_created_at ON public.user_acquisition(created_at);

-- Tabela de sessões (para retenção real)
CREATE TABLE public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_date)
);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own sessions"
ON public.user_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own sessions"
ON public.user_sessions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "App admins view all sessions"
ON public.user_sessions FOR SELECT
USING (public.is_app_admin(auth.uid()));

CREATE INDEX idx_user_sessions_user_date ON public.user_sessions(user_id, session_date);
CREATE INDEX idx_user_sessions_date ON public.user_sessions(session_date);
