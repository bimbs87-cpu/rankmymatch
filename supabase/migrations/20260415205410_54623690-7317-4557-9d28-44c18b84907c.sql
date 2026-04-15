
-- Add status column to groups
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Update public groups policy to hide inactive/finished groups from explore
DROP POLICY IF EXISTS "Anyone can view public groups" ON public.groups;
CREATE POLICY "Anyone can view public active groups"
  ON public.groups FOR SELECT
  USING (is_public = true AND status = 'active');
