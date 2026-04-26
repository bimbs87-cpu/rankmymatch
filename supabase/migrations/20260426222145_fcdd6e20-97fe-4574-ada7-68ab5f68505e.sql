-- Backfill: distribuir imagens únicas por esporte para grupos fictícios.
-- Para cada esporte, atribui uma URL distinta do pool ampliado, ciclando se necessário.

WITH pool AS (
  SELECT 'padel'::text AS sport, unnest(ARRAY[
    'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1687204209553-7833ca9f4f74?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1664302559210-93986d093aa7?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1719391425657-c20cdcb5cc7e?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1721366073194-2c2c63e75c1d?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1721324573999-39438a1d22b7?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1593766827228-8737b4534aa6?w=800&q=80&auto=format&fit=crop'
  ]) AS url
  UNION ALL
  SELECT 'tennis', unnest(ARRAY[
    'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1542144582-1ba00456b5e3?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1591491634026-77cd95c0aa5e?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1530915365347-e35b749a0381?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1554068864-b66c2b7d5d8c?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1545809074-59472b3f5ecc?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1551773228-6a8a2e294f5a?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1533123275131-a36cf94baeae?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1617083934551-ac1f1b1b8a3d?w=800&q=80&auto=format&fit=crop'
  ])
  UNION ALL
  SELECT 'beach_tennis', unnest(ARRAY[
    'https://images.unsplash.com/photo-1605264522060-32c4ef67ed79?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1591491653056-4e0f7a8a7a48?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1530870110042-98b2cb110834?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1592656094267-764a45160876?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1519861531473-9200262188bf?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1599050751795-6cdaafbc2319?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1531315396756-905d68d21b56?w=800&q=80&auto=format&fit=crop'
  ])
),
pool_indexed AS (
  SELECT sport, url, ROW_NUMBER() OVER (PARTITION BY sport ORDER BY url) - 1 AS idx,
         COUNT(*) OVER (PARTITION BY sport) AS total
  FROM pool
),
groups_indexed AS (
  SELECT id, sport,
         (ROW_NUMBER() OVER (PARTITION BY sport ORDER BY created_at, id) - 1) AS gidx
  FROM public.groups
  WHERE is_fictional = true AND sport IN ('padel','tennis','beach_tennis')
)
UPDATE public.groups g
SET image_url = p.url
FROM groups_indexed gi
JOIN pool_indexed p
  ON p.sport = gi.sport
 AND p.idx = (gi.gidx % p.total)
WHERE g.id = gi.id;