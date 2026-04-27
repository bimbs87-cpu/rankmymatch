-- Restaurar Bruno Cruz (Bruninho) e Robson Santos (Robs) como placeholders sem foto
-- no grupo Imbecis do Pádel, e desativar invite_links órfãos cujos placeholders
-- não existem mais.

UPDATE public.user_profiles
SET name = 'Bruninho',
    nickname = NULL,
    is_placeholder = true,
    avatar_url = 'avatar:no-photo',
    avatar_type = NULL
WHERE user_id = '50b77ceb-e598-473b-bc23-5afab951a3ea';

UPDATE public.user_profiles
SET name = 'Robs',
    nickname = NULL,
    is_placeholder = true,
    avatar_url = 'avatar:no-photo',
    avatar_type = NULL
WHERE user_id = '4e1e1e9e-e00c-46eb-8f53-1e9995f8367d';

-- Desativar invite_links cujos placeholders foram removidos (órfãos)
UPDATE public.invite_links
SET is_active = false
WHERE group_id = 'a0e8946d-524c-4dbf-a1dd-3fb5303bfa63'
  AND claim_placeholder_user_id IS NOT NULL
  AND claim_placeholder_user_id NOT IN (
    SELECT user_id FROM public.user_profiles
  );
