-- Add recomputed_at to rating_events to preserve the original created_at
-- when batch Elo recalculations happen. Future recompute scripts should set
-- recomputed_at = now() instead of touching created_at.
ALTER TABLE public.rating_events
  ADD COLUMN IF NOT EXISTS recomputed_at timestamptz;

COMMENT ON COLUMN public.rating_events.recomputed_at IS
  'Timestamp of the most recent Elo recalculation for this event. created_at must remain the original creation time so that chronological ordering of past matches is preserved.';

CREATE INDEX IF NOT EXISTS rating_events_recomputed_at_idx
  ON public.rating_events (recomputed_at);