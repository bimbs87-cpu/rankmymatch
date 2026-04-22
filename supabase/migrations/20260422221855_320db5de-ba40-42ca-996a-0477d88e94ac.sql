CREATE TABLE IF NOT EXISTS public.onboarding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  step text NOT NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_events_user ON public.onboarding_events (user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_events_step ON public.onboarding_events (step);
CREATE INDEX IF NOT EXISTS idx_onboarding_events_created ON public.onboarding_events (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_events_unique_step ON public.onboarding_events (user_id, step);

ALTER TABLE public.onboarding_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own onboarding events"
  ON public.onboarding_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own onboarding events"
  ON public.onboarding_events
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "App admins read all onboarding events"
  ON public.onboarding_events
  FOR SELECT
  USING (public.is_app_admin(auth.uid()));