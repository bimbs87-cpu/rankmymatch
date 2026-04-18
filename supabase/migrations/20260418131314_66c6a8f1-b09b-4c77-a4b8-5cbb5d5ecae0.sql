ALTER TABLE public.seasons
ADD COLUMN IF NOT EXISTS sets_mode text NOT NULL DEFAULT 'fixed';

-- Validation: only allow known values
ALTER TABLE public.seasons
DROP CONSTRAINT IF EXISTS seasons_sets_mode_check;

ALTER TABLE public.seasons
ADD CONSTRAINT seasons_sets_mode_check
CHECK (sets_mode IN ('fixed', 'flexible', 'unlimited'));