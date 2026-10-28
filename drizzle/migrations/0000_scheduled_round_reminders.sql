CREATE TABLE public.round_reminder_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 event_type text NOT NULL,
 status text NOT NULL DEFAULT 'processing',
 attempts integer NOT NULL DEFAULT 1,
 claimed_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz,
 last_error text,
 UNIQUE (round_id, user_id, event_type)
);
GRANT SELECT ON public.round_reminder_deliveries TO authenticated;
GRANT ALL ON public.round_reminder_deliveries TO service_role;
ALTER TABLE public.round_reminder_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own reminder deliveries" ON public.round_reminder_deliveries FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX round_reminder_delivery_retry ON public.round_reminder_deliveries(status, claimed_at);
CREATE TABLE public.game_reminder_scheduler_credentials (
 id integer PRIMARY KEY DEFAULT 1,
 token text NOT NULL DEFAULT (gen_random_uuid()::text || gen_random_uuid()::text)
);
GRANT ALL ON public.game_reminder_scheduler_credentials TO service_role;
ALTER TABLE public.game_reminder_scheduler_credentials ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.verify_game_reminder_token(_token text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM public.game_reminder_scheduler_credentials WHERE id=1 AND length(_token)=72 AND token=_token);
$$;
REVOKE ALL ON FUNCTION public.verify_game_reminder_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_game_reminder_token(text) TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.claim_round_reminder(_round_id uuid, _user_id uuid, _event_type text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE claimed uuid;
BEGIN
 INSERT INTO public.round_reminder_deliveries(round_id,user_id,event_type)
 VALUES(_round_id,_user_id,_event_type)
 ON CONFLICT(round_id,user_id,event_type) DO UPDATE SET status='processing', claimed_at=now(), attempts=round_reminder_deliveries.attempts+1
 WHERE round_reminder_deliveries.status='failed' AND round_reminder_deliveries.claimed_at < now()-interval '15 minutes' AND round_reminder_deliveries.attempts<3
 OR round_reminder_deliveries.status='processing' AND round_reminder_deliveries.claimed_at < now()-interval '15 minutes' AND round_reminder_deliveries.attempts<3
 RETURNING id INTO claimed;
 RETURN claimed IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_round_reminder(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_round_reminder(uuid,uuid,text) TO service_role;