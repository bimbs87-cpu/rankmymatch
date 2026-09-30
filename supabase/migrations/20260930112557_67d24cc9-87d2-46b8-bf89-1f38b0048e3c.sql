DO $fix$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.save_match_score_consistently(uuid,uuid,jsonb)'::regprocedure) INTO v_def;
  v_def := replace(v_def, 'save_match_score_consistently(_match_id uuid, _season_id uuid, _sets jsonb)', 'save_match_score_consistently(_match_id uuid, _season_id uuid, _sets jsonb, _actor uuid)');
  v_def := replace(v_def, 'auth.uid()', '_actor');
  EXECUTE v_def;
END;
$fix$;
REVOKE ALL ON FUNCTION public.save_match_score_consistently(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
DROP FUNCTION public.save_match_score_consistently(uuid,uuid,jsonb);
REVOKE ALL ON FUNCTION public.save_match_score_consistently(uuid,uuid,jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_match_score_consistently(uuid,uuid,jsonb,uuid) TO service_role;