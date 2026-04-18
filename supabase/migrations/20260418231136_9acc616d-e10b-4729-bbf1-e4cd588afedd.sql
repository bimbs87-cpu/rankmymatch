ALTER TABLE public.invite_links
ADD COLUMN IF NOT EXISTS claim_placeholder_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_invite_links_claim_placeholder
ON public.invite_links(claim_placeholder_user_id)
WHERE claim_placeholder_user_id IS NOT NULL;