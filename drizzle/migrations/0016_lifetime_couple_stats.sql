-- Calculate lifetime couple metrics without sending the entire meal history to phones.
-- Only the authenticated server's service_role may call this RPC.
BEGIN;
ALTER TABLE public.meals ADD COLUMN IF NOT EXISTS is_planned boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS meals_planned_idx
  ON public.meals (member_id,meal_date,is_planned);
CREATE OR REPLACE FUNCTION public.room_activity_rollup(
  p_room_id uuid, p_today date
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH eaten AS (
    SELECT m.member_id, m.meal_date, m.meal_type, m.protein
    FROM public.meals m
    WHERE m.room_id = p_room_id AND m.is_planned = false
  ),
  per_member_day AS (
    SELECT e.meal_date, e.member_id, SUM(e.protein) AS protein,
           BOOL_OR(e.meal_type = 'dinner') AS had_dinner
    FROM eaten e GROUP BY e.meal_date, e.member_id
  ),
  per_day AS (
    SELECT d.meal_date,
           COUNT(*) AS participants,
           BOOL_AND(d.had_dinner) AS everyone_dinner,
           BOOL_AND(
             m.daily_protein_target IS NOT NULL
             AND m.daily_protein_target > 0
             AND d.protein >= m.daily_protein_target
           ) AS everyone_protein
    FROM per_member_day d
    JOIN public.members m ON m.id = d.member_id
    GROUP BY d.meal_date
  ),
  both_days AS (
    SELECT meal_date FROM per_day WHERE participants = 2
  ),
  start_day AS (
    SELECT CASE WHEN EXISTS (SELECT 1 FROM both_days WHERE meal_date = p_today)
      THEN p_today ELSE p_today - 1 END AS first_day
  ),
  numbered AS (
    SELECT meal_date,
      (ROW_NUMBER() OVER (ORDER BY meal_date DESC) - 1)::integer AS step
    FROM both_days WHERE meal_date <= (SELECT first_day FROM start_day)
  )
  SELECT jsonb_build_object(
    'totalMeals', (SELECT COUNT(*) FROM eaten),
    'daysActive', (SELECT COUNT(*) FROM per_day),
    'daysBoth', (SELECT COUNT(*) FROM both_days),
    'daysBothProtein', (SELECT COUNT(*) FROM per_day WHERE participants = 2 AND everyone_protein),
    'sharedDinners', (SELECT COUNT(*) FROM per_day WHERE participants = 2 AND everyone_dinner),
    'firstBothDay', (SELECT MIN(meal_date)::text FROM both_days),
    'streak', (SELECT COUNT(*) FROM numbered, start_day
       WHERE numbered.meal_date = start_day.first_day - numbered.step)
  );
$$;

REVOKE ALL ON FUNCTION public.room_activity_rollup(uuid,date)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.room_activity_rollup(uuid,date) TO service_role;
COMMIT;
