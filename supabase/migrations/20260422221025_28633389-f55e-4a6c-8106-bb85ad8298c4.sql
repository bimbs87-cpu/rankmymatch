CREATE TABLE IF NOT EXISTS public.page_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  user_id uuid NULL,
  path text NOT NULL,
  referrer_host text NULL,
  utm_source text NULL,
  utm_medium text NULL,
  utm_campaign text NULL,
  invite_code text NULL,
  user_agent text NULL,
  is_first_visit boolean NOT NULL DEFAULT false,
  device_type text NULL,
  country text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_page_visits_created_at ON public.page_visits (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_visits_session ON public.page_visits (session_id);
CREATE INDEX IF NOT EXISTS idx_page_visits_user ON public.page_visits (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_page_visits_first ON public.page_visits (created_at DESC) WHERE is_first_visit = true;
CREATE INDEX IF NOT EXISTS idx_page_visits_utm_source ON public.page_visits (utm_source) WHERE utm_source IS NOT NULL;

ALTER TABLE public.page_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert page visits"
  ON public.page_visits
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Only app admins can read page visits"
  ON public.page_visits
  FOR SELECT
  USING (public.is_app_admin(auth.uid()));