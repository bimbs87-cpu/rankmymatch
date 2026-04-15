
-- Create invite_links table
CREATE TABLE public.invite_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  expires_at timestamp with time zone,
  max_uses integer DEFAULT 0,
  use_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.invite_links ENABLE ROW LEVEL SECURITY;

-- Anyone can view active invite links (needed to accept invites)
CREATE POLICY "Anyone can view active invite links"
  ON public.invite_links FOR SELECT
  USING (is_active = true);

-- Members can view all group invite links
CREATE POLICY "Members view group invite links"
  ON public.invite_links FOR SELECT
  USING (is_group_member(auth.uid(), group_id));

-- Members can create invite links
CREATE POLICY "Members can create invite links"
  ON public.invite_links FOR INSERT
  WITH CHECK (auth.uid() = created_by AND is_group_member(auth.uid(), group_id));

-- Admins can update/deactivate invite links
CREATE POLICY "Admins can update invite links"
  ON public.invite_links FOR UPDATE
  USING (is_group_admin(auth.uid(), group_id));

-- Admins can delete invite links
CREATE POLICY "Admins can delete invite links"
  ON public.invite_links FOR DELETE
  USING (is_group_admin(auth.uid(), group_id));
