
-- Add presence opening configuration to groups
ALTER TABLE public.groups
  ADD COLUMN presence_open_mode text NOT NULL DEFAULT '1_day_before',
  ADD COLUMN presence_open_time time NOT NULL DEFAULT '10:00:00';

-- presence_open_mode values:
-- 'always'        = list is always open (no restriction)
-- 'same_day'      = opens on the same day at presence_open_time
-- '1_day_before'  = opens 1 day before at presence_open_time (default)
-- '2_days_before' = opens 2 days before at presence_open_time
-- 'random'        = opens at a random time between 36h and 24h before the game
