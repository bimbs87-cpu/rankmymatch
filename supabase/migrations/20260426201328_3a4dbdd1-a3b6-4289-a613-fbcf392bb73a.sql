-- ============================================================================
-- 1. Add new columns to groups table
-- ============================================================================

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS public_code text,
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_fictional boolean NOT NULL DEFAULT false;

-- ============================================================================
-- 2. Generate public_code for existing rows + enforce uniqueness going forward
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_group_public_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I to avoid confusion
  _candidate text;
  _attempt int := 0;
  _len int := length(_alphabet);
BEGIN
  LOOP
    _candidate := 'RMM-';
    FOR i IN 1..6 LOOP
      _candidate := _candidate || substr(_alphabet, 1 + floor(random() * _len)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.groups WHERE public_code = _candidate);
    _attempt := _attempt + 1;
    IF _attempt > 50 THEN
      RAISE EXCEPTION 'Could not generate unique public_code after 50 attempts';
    END IF;
  END LOOP;
  RETURN _candidate;
END;
$$;

-- Backfill all existing groups
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.groups WHERE public_code IS NULL LOOP
    UPDATE public.groups
    SET public_code = public.generate_group_public_code()
    WHERE id = r.id;
  END LOOP;
END $$;

-- Enforce non-null + unique now that backfill is done
ALTER TABLE public.groups
  ALTER COLUMN public_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS groups_public_code_key
  ON public.groups (public_code);

-- Trigger: auto-generate public_code on insert if not provided
CREATE OR REPLACE FUNCTION public.set_group_public_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.public_code IS NULL OR NEW.public_code = '' THEN
    NEW.public_code := public.generate_group_public_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_group_public_code ON public.groups;
CREATE TRIGGER trg_set_group_public_code
  BEFORE INSERT ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.set_group_public_code();

-- ============================================================================
-- 3. Allow visibility = 'hidden' (no constraint exists today, just docs)
-- ============================================================================

COMMENT ON COLUMN public.groups.visibility IS
  'public = visible to all, private = visible name+meta but no full content, hidden = only findable by public_code';

-- ============================================================================
-- 4. RLS update: hide "hidden" groups from open listings
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view non-hidden active groups" ON public.groups;

CREATE POLICY "Anyone can view non-hidden active groups"
  ON public.groups
  FOR SELECT
  USING (
    status = 'active'
    AND visibility IN ('public', 'private')
  );

-- Members can still always see their hidden groups (existing policy already covers this)

-- ============================================================================
-- 5. Helper RPC: lookup a hidden (or any) group by its public_code
-- ============================================================================

CREATE OR REPLACE FUNCTION public.find_group_by_public_code(_code text)
RETURNS TABLE(
  id uuid,
  name text,
  visibility text,
  match_format text,
  singles_group_type text,
  sport text,
  member_count integer,
  requires_approval boolean,
  image_url text,
  description text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    g.id,
    g.name,
    g.visibility,
    g.match_format,
    g.singles_group_type,
    g.sport,
    public.get_group_member_count(g.id) AS member_count,
    g.requires_approval,
    g.image_url,
    g.description
  FROM public.groups g
  WHERE upper(trim(g.public_code)) = upper(trim(_code))
    AND g.status = 'active'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_group_by_public_code(text) TO authenticated, anon;