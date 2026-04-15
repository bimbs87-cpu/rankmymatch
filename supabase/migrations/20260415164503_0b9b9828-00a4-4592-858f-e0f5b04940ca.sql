
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS avatar_type TEXT DEFAULT 'google' CHECK (avatar_type IN ('google', 'upload', 'camera', 'preset')),
  ADD COLUMN IF NOT EXISTS dominant_hand TEXT DEFAULT 'right' CHECK (dominant_hand IN ('right', 'left')),
  ADD COLUMN IF NOT EXISTS preferred_position TEXT DEFAULT 'both' CHECK (preferred_position IN ('left', 'right', 'both')),
  ADD COLUMN IF NOT EXISTS killer_shot TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS worst_shot TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS instagram_handle TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
