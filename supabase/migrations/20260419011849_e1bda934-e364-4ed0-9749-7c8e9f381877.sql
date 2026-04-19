ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS share_accent_color text;

-- Validate the accent color is one of the allowed presets (or null)
CREATE OR REPLACE FUNCTION public.validate_share_accent_color()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.share_accent_color IS NOT NULL THEN
    NEW.share_accent_color := nullif(trim(NEW.share_accent_color), '');
    IF NEW.share_accent_color IS NOT NULL
       AND NEW.share_accent_color NOT IN ('emerald','amber','sky','rose','violet','slate') THEN
      RAISE EXCEPTION 'share_accent_color must be one of: emerald, amber, sky, rose, violet, slate';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_share_accent_color_trg ON public.user_profiles;
CREATE TRIGGER validate_share_accent_color_trg
BEFORE INSERT OR UPDATE OF share_accent_color ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_share_accent_color();