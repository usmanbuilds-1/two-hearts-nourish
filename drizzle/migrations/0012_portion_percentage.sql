-- Task 3: Portion percentage logging
-- Stores both the nominal (100%) base values and the actually logged scaled values.
-- portion_percentage = 75 means the user ate 75% of a standard serving.
-- nominal_* = the full-portion base. If NULL, treat calories/protein/carbs/fat as 100%.
ALTER TABLE public.meals
  ADD COLUMN IF NOT EXISTS portion_percentage integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS nominal_calories    integer,
  ADD COLUMN IF NOT EXISTS nominal_protein     numeric(6,1),
  ADD COLUMN IF NOT EXISTS nominal_carbs       numeric(6,1),
  ADD COLUMN IF NOT EXISTS nominal_fat         numeric(6,1);
