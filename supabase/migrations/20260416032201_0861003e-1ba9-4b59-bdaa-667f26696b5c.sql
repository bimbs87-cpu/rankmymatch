
-- Add match_format to groups
ALTER TABLE public.groups
ADD COLUMN IF NOT EXISTS match_format text NOT NULL DEFAULT 'doubles';

-- Add match_format to seasons
ALTER TABLE public.seasons
ADD COLUMN IF NOT EXISTS match_format text NOT NULL DEFAULT 'doubles';

-- Add match_format to rounds
ALTER TABLE public.rounds
ADD COLUMN IF NOT EXISTS match_format text NOT NULL DEFAULT 'doubles';

-- Add match_format to matches
ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS match_format text NOT NULL DEFAULT 'doubles';

-- Add match_format to ranking_snapshots
ALTER TABLE public.ranking_snapshots
ADD COLUMN IF NOT EXISTS match_format text NOT NULL DEFAULT 'doubles';

-- Add match_format to rating_events
ALTER TABLE public.rating_events
ADD COLUMN IF NOT EXISTS match_format text NOT NULL DEFAULT 'doubles';
