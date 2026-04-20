-- Repair the partial save: sets and rating events were already in the DB
-- but the matches row never got updated to completed (because the old code
-- sent an invalid result_type and didn't check the error).
UPDATE public.matches
SET status = 'completed',
    winner_team = 'A',
    result_type = 'normal',
    updated_at = now()
WHERE id = '2aeec8a9-3b62-4dce-866a-4f4238f32d74'
  AND status = 'scheduled';

-- The round had only this one match; mark it completed too.
UPDATE public.rounds
SET status = 'completed',
    updated_at = now()
WHERE id = '0744a77f-2b08-42c1-b731-f15b3ad83b99'
  AND NOT EXISTS (
    SELECT 1 FROM public.matches
    WHERE round_id = '0744a77f-2b08-42c1-b731-f15b3ad83b99'
      AND status <> 'completed'
  );