
CREATE TABLE public.premium_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  price_brl NUMERIC NOT NULL DEFAULT 0,
  features JSONB DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.group_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.premium_plans(id),
  status TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'active', 'cancelled', 'expired')),
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.branding_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE UNIQUE,
  primary_color TEXT DEFAULT '#6366f1',
  secondary_color TEXT,
  logo_url TEXT,
  custom_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.whatsapp_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  whatsapp_group_id TEXT,
  phone_number TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.whatsapp_commands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  command TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.whatsapp_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wa_group_id UUID REFERENCES public.whatsapp_groups(id) ON DELETE CASCADE,
  command TEXT,
  user_phone TEXT,
  request_data JSONB,
  response_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.premium_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branding_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view plans" ON public.premium_plans FOR SELECT USING (true);

CREATE POLICY "Members view subscriptions" ON public.group_subscriptions FOR SELECT USING (
  public.is_group_member(auth.uid(), group_id)
);

CREATE POLICY "Members view branding" ON public.branding_settings FOR SELECT USING (public.is_group_member(auth.uid(), group_id));
CREATE POLICY "Creator manages branding" ON public.branding_settings FOR ALL USING (public.is_group_creator(auth.uid(), group_id));

CREATE POLICY "Admins view wa groups" ON public.whatsapp_groups FOR SELECT USING (public.is_group_admin(auth.uid(), group_id));
CREATE POLICY "Admins manage wa groups" ON public.whatsapp_groups FOR ALL USING (public.is_group_admin(auth.uid(), group_id));

CREATE POLICY "Anyone views commands" ON public.whatsapp_commands FOR SELECT USING (true);

CREATE POLICY "Admins view wa logs" ON public.whatsapp_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.whatsapp_groups wg WHERE wg.id = wa_group_id AND public.is_group_admin(auth.uid(), wg.group_id))
);

-- Triggers
CREATE TRIGGER update_branding_updated_at BEFORE UPDATE ON public.branding_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed data
INSERT INTO public.whatsapp_commands (command, description) VALUES
  ('/ranking', 'Exibe o ranking atual da temporada'),
  ('/historico', 'Mostra o histórico recente de partidas'),
  ('/resultado', 'Registra o resultado de uma partida'),
  ('/proxima-rodada', 'Mostra informações da próxima rodada'),
  ('/presenca', 'Confirma presença na próxima rodada'),
  ('/confirmar', 'Confirma um resultado pendente');

INSERT INTO public.premium_plans (name, price_brl, features) VALUES
  ('Free', 0, '["1 grupo", "ranking básico", "histórico limitado"]'::jsonb),
  ('Premium', 9.90, '["grupos ilimitados", "ranking completo", "exportações", "sem anúncios", "WhatsApp bot"]'::jsonb),
  ('Premium + Branding', 14.80, '["tudo do Premium", "logo personalizado", "cores customizadas", "white-label"]'::jsonb);
