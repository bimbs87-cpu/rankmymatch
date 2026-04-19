ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS privacy_settings jsonb NOT NULL DEFAULT jsonb_build_object(
  'show_personal', true,
  'show_stats', true,
  'show_groups', true,
  'show_achievements', true
);

COMMENT ON COLUMN public.user_profiles.privacy_settings IS 'Per-section visibility toggles for the public profile. Ranking and current Elo are always public.';