
-- 1. Create all tables first (no cross-references in policies yet)

CREATE TABLE public.groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  image_url TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  max_players INTEGER NOT NULL DEFAULT 20,
  slots_per_round INTEGER NOT NULL DEFAULT 4,
  simultaneous_courts INTEGER NOT NULL DEFAULT 1,
  fixed_day INTEGER,
  mode TEXT NOT NULL DEFAULT 'free' CHECK (mode IN ('free', 'season')),
  sport TEXT NOT NULL DEFAULT 'padel',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('creator', 'admin', 'member', 'guest')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'removed')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE TABLE public.group_join_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  message TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  UNIQUE(group_id, user_id)
);

CREATE TABLE public.group_admin_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  can_edit_scores BOOLEAN NOT NULL DEFAULT false,
  can_invite_members BOOLEAN NOT NULL DEFAULT false,
  can_remove_members BOOLEAN NOT NULL DEFAULT false,
  can_manage_rounds BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- 2. Enable RLS on all tables
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_admin_permissions ENABLE ROW LEVEL SECURITY;

-- 3. Helper function to check group membership (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.is_group_member(_user_id UUID, _group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE user_id = _user_id AND group_id = _group_id AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin(_user_id UUID, _group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE user_id = _user_id AND group_id = _group_id AND role IN ('creator', 'admin') AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_creator(_user_id UUID, _group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE user_id = _user_id AND group_id = _group_id AND role = 'creator' AND status = 'active'
  );
$$;

-- 4. Policies for groups
CREATE POLICY "Anyone can view public groups" ON public.groups FOR SELECT USING (is_public = true);
CREATE POLICY "Members can view private groups" ON public.groups FOR SELECT USING (public.is_group_member(auth.uid(), id));
CREATE POLICY "Auth users can create groups" ON public.groups FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creator can update group" ON public.groups FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Creator can delete group" ON public.groups FOR DELETE USING (auth.uid() = created_by);

-- 5. Policies for group_members
CREATE POLICY "Members can view group members" ON public.group_members FOR SELECT USING (public.is_group_member(auth.uid(), group_id) OR user_id = auth.uid());
CREATE POLICY "Users can join as pending" ON public.group_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can update members" ON public.group_members FOR UPDATE USING (public.is_group_admin(auth.uid(), group_id) OR user_id = auth.uid());
CREATE POLICY "Admins can remove members" ON public.group_members FOR DELETE USING (public.is_group_admin(auth.uid(), group_id));

-- 6. Policies for group_join_requests
CREATE POLICY "Users can view own requests" ON public.group_join_requests FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can view requests" ON public.group_join_requests FOR SELECT USING (public.is_group_admin(auth.uid(), group_id));
CREATE POLICY "Users can create requests" ON public.group_join_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can update requests" ON public.group_join_requests FOR UPDATE USING (public.is_group_admin(auth.uid(), group_id));

-- 7. Policies for group_admin_permissions
CREATE POLICY "Members can view permissions" ON public.group_admin_permissions FOR SELECT USING (public.is_group_member(auth.uid(), group_id));
CREATE POLICY "Creator can manage permissions" ON public.group_admin_permissions FOR ALL USING (public.is_group_creator(auth.uid(), group_id));

-- 8. Triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_group_members_updated_at BEFORE UPDATE ON public.group_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_group_admin_permissions_updated_at BEFORE UPDATE ON public.group_admin_permissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Indexes
CREATE INDEX idx_group_members_group ON public.group_members(group_id);
CREATE INDEX idx_group_members_user ON public.group_members(user_id);
CREATE INDEX idx_group_join_requests_group ON public.group_join_requests(group_id);
CREATE INDEX idx_groups_public ON public.groups(is_public) WHERE is_public = true;
