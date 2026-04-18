CREATE TABLE public.compare_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  group_id UUID NOT NULL,
  label TEXT NOT NULL,
  player_ids UUID[] NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.compare_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own favorites"
  ON public.compare_favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users create own favorites"
  ON public.compare_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own favorites"
  ON public.compare_favorites FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own favorites"
  ON public.compare_favorites FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_compare_favorites_user_group ON public.compare_favorites(user_id, group_id);

CREATE TRIGGER update_compare_favorites_updated_at
  BEFORE UPDATE ON public.compare_favorites
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();