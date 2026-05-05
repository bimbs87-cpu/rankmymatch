ALTER TABLE public.round_presence
ADD COLUMN IF NOT EXISTS rejoin_requested_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_round_presence_rejoin_pending
  ON public.round_presence (round_id)
  WHERE rejoin_requested_at IS NOT NULL;