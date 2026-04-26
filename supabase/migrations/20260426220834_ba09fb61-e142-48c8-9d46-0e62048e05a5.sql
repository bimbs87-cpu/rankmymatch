WITH targets AS (
  SELECT user_id
  FROM public.user_profiles
  WHERE created_by_admin IS NOT NULL
    AND is_placeholder = false
),
computed AS (
  SELECT
    t.user_id,
    (abs(hashtext(t.user_id::text)) % 1000) AS h,
    (abs(hashtext(t.user_id::text || 'g')) % 2) AS gender_pick,
    (abs(hashtext(t.user_id::text || 'i')) % 99) AS photo_idx,
    (abs(hashtext(t.user_id::text || 's')) % 5) AS sport_idx,
    (abs(hashtext(t.user_id::text || 'n')) % 16) + 1 AS num_idx
  FROM targets t
)
UPDATE public.user_profiles up
SET
  avatar_url = CASE
    WHEN c.h < 550 THEN
      'https://randomuser.me/api/portraits/' ||
        CASE WHEN c.gender_pick = 0 THEN 'men' ELSE 'women' END ||
        '/' || c.photo_idx || '.jpg'
    ELSE
      'avatar:' || (ARRAY['padel','tennis','beach','squash','pickle'])[c.sport_idx + 1] ||
        '-' || lpad(c.num_idx::text, 2, '0')
  END,
  avatar_type = CASE WHEN c.h < 550 THEN 'google' ELSE 'preset' END
FROM computed c
WHERE up.user_id = c.user_id;