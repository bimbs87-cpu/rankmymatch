DROP POLICY IF EXISTS "Anyone can submit a sales lead" ON public.sales_leads;

CREATE POLICY "Anyone can submit a sales lead"
ON public.sales_leads
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(trim(name)) BETWEEN 2 AND 100
  AND length(trim(contact)) BETWEEN 5 AND 150
  AND contact_type IN ('whatsapp', 'email')
  AND plan_interest IN ('premium', 'avulso', 'duvida')
  AND (message IS NULL OR length(message) <= 1000)
);