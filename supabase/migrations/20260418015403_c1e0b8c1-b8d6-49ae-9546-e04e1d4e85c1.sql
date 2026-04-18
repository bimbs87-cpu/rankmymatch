CREATE TABLE public.sales_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  contact_type TEXT NOT NULL DEFAULT 'whatsapp',
  plan_interest TEXT NOT NULL DEFAULT 'premium',
  message TEXT,
  source TEXT DEFAULT 'sistema_page',
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can submit a lead
CREATE POLICY "Anyone can submit a sales lead"
ON public.sales_leads
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- No one can read via client (only via backend/service role)
-- This is intentional: leads are private business data.

CREATE INDEX idx_sales_leads_created_at ON public.sales_leads(created_at DESC);
CREATE INDEX idx_sales_leads_plan ON public.sales_leads(plan_interest);