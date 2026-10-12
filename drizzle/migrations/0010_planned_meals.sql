-- Add is_planned flag to meals.
-- Planned meals live in the diary but are excluded from calorie/macro totals
-- until the user taps the checkbox to confirm them as eaten.
ALTER TABLE public.meals
  ADD COLUMN IF NOT EXISTS is_planned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS meals_planned_idx
  ON public.meals(member_id, meal_date, is_planned);
