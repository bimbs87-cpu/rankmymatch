-- 1) Remove duplicate fictional groups, keeping the oldest of each (name) pair.
--    Cascade FKs already exist for rounds/members/etc., so the dependent rows go too.
WITH ranked AS (
  SELECT id, name,
         ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at, id) AS rn
  FROM public.groups
  WHERE is_fictional = true
)
DELETE FROM public.groups g
USING ranked r
WHERE g.id = r.id AND r.rn > 1;

-- 2) Prevent future duplicates among fictional groups.
CREATE UNIQUE INDEX IF NOT EXISTS groups_fictional_name_uniq
  ON public.groups (name)
  WHERE is_fictional = true;