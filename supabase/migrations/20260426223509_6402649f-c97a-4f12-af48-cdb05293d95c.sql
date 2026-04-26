WITH pool AS (
  SELECT 'padel'::text AS sport, unnest(ARRAY[
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/padel-1-1777242500369.png',
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/padel-2-1777242518766.png',
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/padel-3-1777242535367.png',
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/padel-4-1777242548665.png',
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/padel-5-1777242566911.png',
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/padel-6-1777242581787.png',
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/padel-7-1777242595065.png',
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/padel-8-1777242611005.png'
  ]) AS url
  UNION ALL
  SELECT 'tennis', unnest(ARRAY[
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/tennis-1-1777242629691.png',
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/tennis-2-1777242646900.png',
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/tennis-3-1777242662495.png',
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/tennis-4-1777242681167.png',
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/tennis-5-1777242696833.png',
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/tennis-6-1777242720900.png',
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/tennis-7-1777242736152.png',
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/tennis-8-1777242754864.png'
  ])
  UNION ALL
  SELECT 'beach_tennis', unnest(ARRAY[
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/beach_tennis-1-1777242769232.png',
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/beach_tennis-2-1777242784663.png',
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/beach_tennis-3-1777242799499.png',
    'https://oeizpqyvnmickosoynrr.supabase.co/storage/v1/object/public/group-images/fictional/beach_tennis-4-1777242815315.png'
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