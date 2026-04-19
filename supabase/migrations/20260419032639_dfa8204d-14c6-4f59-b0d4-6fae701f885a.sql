-- Custom OG cover (separate from group avatar)
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS og_cover_url text;

-- Share analytics
CREATE TABLE IF NOT EXISTS public.group_share_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  user_id uuid,
  channel text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_share_events_channel_check
    CHECK (channel IN ('copy','native','qr','image','preview','whatsapp'))
);

CREATE INDEX IF NOT EXISTS idx_group_share_events_group_created
  ON public.group_share_events (group_id, created_at DESC);

ALTER TABLE public.group_share_events ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon visitors on public groups) can record a share
CREATE POLICY "Anyone can record share events"
  ON public.group_share_events
  FOR INSERT
  WITH CHECK (
    user_id IS NULL OR auth.uid() = user_id
  );

-- Group admins can read share events for their group (for counters)
CREATE POLICY "Admins read group share events"
  ON public.group_share_events
  FOR SELECT
  USING (public.is_group_admin(auth.uid(), group_id));

-- Members can read aggregate counts for their group too (used in member-visible UI if needed)
CREATE POLICY "Members read group share events"
  ON public.group_share_events
  FOR SELECT
  USING (public.is_group_member(auth.uid(), group_id));