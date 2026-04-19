-- 1. bug_reports table
CREATE TABLE public.bug_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  route TEXT,
  user_agent TEXT,
  screenshot_url TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can submit a bug report
CREATE POLICY "Anyone can submit bug reports"
ON public.bug_reports
FOR INSERT
WITH CHECK (
  (user_id IS NULL OR auth.uid() = user_id)
  AND length(trim(title)) BETWEEN 3 AND 200
  AND length(trim(description)) BETWEEN 10 AND 5000
);

-- Users see their own reports
CREATE POLICY "Users view own bug reports"
ON public.bug_reports
FOR SELECT
USING (auth.uid() = user_id);

-- Update trigger for timestamps
CREATE TRIGGER update_bug_reports_updated_at
BEFORE UPDATE ON public.bug_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_bug_reports_user_id ON public.bug_reports(user_id);
CREATE INDEX idx_bug_reports_created_at ON public.bug_reports(created_at DESC);

-- 2. release_notes table
CREATE TABLE public.release_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'feature',
  is_published BOOLEAN NOT NULL DEFAULT true,
  released_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.release_notes ENABLE ROW LEVEL SECURITY;

-- Anyone can read published release notes
CREATE POLICY "Anyone reads published release notes"
ON public.release_notes
FOR SELECT
USING (is_published = true);

CREATE TRIGGER update_release_notes_updated_at
BEFORE UPDATE ON public.release_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_release_notes_released_at ON public.release_notes(released_at DESC);

-- 3. Storage bucket for bug screenshots (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('bug-screenshots', 'bug-screenshots', true);

CREATE POLICY "Bug screenshots are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'bug-screenshots');

CREATE POLICY "Anyone can upload bug screenshots"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'bug-screenshots');

-- 4. Seed initial release notes
INSERT INTO public.release_notes (version, title, description, type, released_at) VALUES
('v0.27.0', 'Reportar bugs no app', 'Agora você pode reportar bugs com screenshot direto pelo app, na página "Sobre o desenvolvimento".', 'feature', now()),
('v0.26.5', 'Changelog público', 'Nova seção de novidades para acompanhar tudo que está sendo lançado.', 'feature', now() - interval '1 hour'),
('v0.26.4', 'Compartilhamento via WhatsApp personalizado', 'Admins podem personalizar a mensagem do WhatsApp ao compartilhar o grupo.', 'feature', now() - interval '1 day'),
('v0.26.3', 'Perfil otimizado para desktop', 'Layout do perfil reestruturado em grid de 12 colunas para aproveitar melhor o espaço.', 'improvement', now() - interval '2 days'),
('v0.26.2', 'Top divulgadores e gráficos de engajamento', 'Painel admin agora mostra top 3 divulgadores e gráfico semanal por canal.', 'feature', now() - interval '4 days');