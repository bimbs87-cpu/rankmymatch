UPDATE public.matches
SET status = 'completed',
    winner_team = 'A',
    result_type = 'normal',
    updated_at = now()
WHERE id IN (
  '8f99618d-829e-44ea-a198-3b7d99e0a094',
  '332ae369-34cc-4f58-8b76-62a57abe3ce4',
  '86efd2a7-37e5-4d47-9199-bb338e564a3d'
);