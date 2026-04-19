-- Push notification preferences per user per event type
CREATE TABLE public.push_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_type)
);

ALTER TABLE public.push_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push preferences"
ON public.push_notification_preferences
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_push_pref_user ON public.push_notification_preferences(user_id);

CREATE TRIGGER trg_push_pref_updated_at
BEFORE UPDATE ON public.push_notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Track which rounds we've already pushed presence-open notifications for
-- (so the cron is idempotent across runs)
CREATE TABLE public.round_presence_push_log (
  round_id UUID PRIMARY KEY,
  pushed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.round_presence_push_log ENABLE ROW LEVEL SECURITY;

-- Only service role accesses this; no policies needed for normal users.
-- Members can view (read-only) so the dashboard can detect "already pushed".
CREATE POLICY "Members read presence push log"
ON public.round_presence_push_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.rounds r
    WHERE r.id = round_presence_push_log.round_id
      AND public.is_group_member(auth.uid(), r.group_id)
  )
);