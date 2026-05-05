
-- 1) Insert new release notes from chat work after "Explorar grupos abre direto pelo menu"
INSERT INTO public.release_notes (version, title, description, type, released_at, is_published) VALUES
  ('v0.28.9', 'Empate em games nas rivalidades', 'Agora é possível registrar duelos de rivalidade que terminam empatados em games (ex.: 6x4 e 5x7 = 11x11), refletindo no Elo da rivalidade.', 'feature', '2026-04-26 23:00:00+00', true),
  ('v0.28.9', 'Termo "grupo" no lugar de "feirinha"', 'Substituímos "feirinha" por "grupo" na tela de boas-vindas e nos metadados de SEO para uma comunicação mais clara e profissional.', 'improvement', '2026-04-26 23:10:00+00', true);

-- 2) Renumber every v0.28.x entry so each release note has its own unique version, ordered chronologically.
WITH ranked AS (
  SELECT id,
         'v0.28.' || (row_number() OVER (ORDER BY released_at ASC, title ASC) - 1) AS new_version
  FROM public.release_notes
  WHERE version LIKE 'v0.28%'
)
UPDATE public.release_notes r
SET version = ranked.new_version
FROM ranked
WHERE r.id = ranked.id;
