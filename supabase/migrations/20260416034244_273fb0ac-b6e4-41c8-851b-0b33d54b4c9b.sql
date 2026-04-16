
-- Add singles_group_type to groups
ALTER TABLE public.groups
ADD COLUMN IF NOT EXISTS singles_group_type text DEFAULT NULL;

-- Add sets_per_match, singles_pairing_mode, odd_player_rule to seasons
ALTER TABLE public.seasons
ADD COLUMN IF NOT EXISTS sets_per_match integer DEFAULT 3;

ALTER TABLE public.seasons
ADD COLUMN IF NOT EXISTS singles_pairing_mode text DEFAULT 'manual';

ALTER TABLE public.seasons
ADD COLUMN IF NOT EXISTS odd_player_rule text DEFAULT 'admin_decides';

-- Add is_exhibition and counts_for_ranking to matches
ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS is_exhibition boolean DEFAULT false;

ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS counts_for_ranking boolean DEFAULT true;
