
-- Registro de consentimento de privacidade (tecnologias não essenciais)
CREATE TABLE IF NOT EXISTS public.privacy_consents (
  user_id uuid NOT NULL,
  choice text NOT NULL CHECK (choice IN ('granted','denied')),
  notice_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT privacy_consents_pkey PRIMARY KEY (user_id)
);

ALTER TABLE public.privacy_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own privacy consent"
  ON public.privacy_consents FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own privacy consent"
  ON public.privacy_consents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own privacy consent"
  ON public.privacy_consents FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.privacy_consents TO authenticated;
GRANT ALL ON public.privacy_consents TO service_role;

-- Log de envios de push para limite de frequência (somente servidor)
CREATE TABLE IF NOT EXISTS public.push_send_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  caller_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_send_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS push_send_log_caller_created_idx
  ON public.push_send_log (caller_id, created_at DESC);

GRANT ALL ON public.push_send_log TO service_role;

-- Capturas de tela de bugs: leitura restrita ao dono da pasta ou admins do app
CREATE POLICY "Users read own bug screenshots"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bug-screenshots' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text));

CREATE POLICY "App admins read bug screenshots"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bug-screenshots' AND EXISTS (SELECT 1 FROM public.app_admins WHERE app_admins.user_id = auth.uid()));
