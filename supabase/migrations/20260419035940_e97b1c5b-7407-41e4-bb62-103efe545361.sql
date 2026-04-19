-- Add public visibility for bug reports (so users can see known issues) + admin notes + upvotes

-- 1) Add admin_notes and make bug_reports publicly readable for non-spam ones
ALTER TABLE public.bug_reports ADD COLUMN IF NOT EXISTS admin_notes text;
ALTER TABLE public.bug_reports ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

-- Replace restrictive SELECT with public read for is_public reports
DROP POLICY IF EXISTS "Users view own bug reports" ON public.bug_reports;

CREATE POLICY "Anyone reads public bug reports"
ON public.bug_reports
FOR SELECT
USING (is_public = true);

CREATE POLICY "Users view own bug reports private"
ON public.bug_reports
FOR SELECT
USING (auth.uid() = user_id);

-- Allow the designated admin to update bug reports (status, notes, priority)
-- Admin user_id: the group creator pattern — we'll use a hardcoded admin email lookup via auth.users is not allowed,
-- so we expose updates via a security definer check on a known admin uuid stored in a config table.

-- Simpler: create an app_admins table
CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can check app admin membership"
ON public.app_admins
FOR SELECT
USING (true);

CREATE OR REPLACE FUNCTION public.is_app_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = _user_id);
$$;

CREATE POLICY "App admins can update bug reports"
ON public.bug_reports
FOR UPDATE
USING (public.is_app_admin(auth.uid()));

-- 2) Bug report upvotes
CREATE TABLE public.bug_report_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_report_id uuid NOT NULL REFERENCES public.bug_reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bug_report_id, user_id)
);

ALTER TABLE public.bug_report_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads bug votes"
ON public.bug_report_votes
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users vote"
ON public.bug_report_votes
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users remove own vote"
ON public.bug_report_votes
FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX idx_bug_report_votes_bug ON public.bug_report_votes(bug_report_id);