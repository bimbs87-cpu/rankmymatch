-- Bucket privado para relatórios mensais em PDF
INSERT INTO storage.buckets (id, name, public)
VALUES ('monthly-reports', 'monthly-reports', false)
ON CONFLICT (id) DO NOTHING;

-- Apenas service role lê/escreve (sem políticas para usuários comuns)
CREATE POLICY "App admins can read monthly reports"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'monthly-reports'
  AND EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid())
);