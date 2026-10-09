# Two Hearts Nourish — Complete 7-Phase Implementation Package

This document contains **ALL code** for all 7 phases in a copy-paste format for Lovable.
Paste each section into Lovable as a single prompt to avoid multiple credits.

---

# SECTION A: Database Migrations

Create migrations in order:
- `drizzle/migrations/0004_meal_favorites.sql`
- `drizzle/migrations/0005_meal_templates.sql`  
- `drizzle/migrations/0006_recipes.sql`
- `drizzle/migrations/0008_progress_notes.sql`

Then update `drizzle/migrations/meta/_journal.json` with:
```json
{
  "idx": 4, "tag": "0004_meal_favorites", "when": 1760000000001
}, {
  "idx": 5, "tag": "0005_meal_templates", "when": 1760000000002
}, {
  "idx": 6, "tag": "0006_recipes_and_plans", "when": 1760000000003
}, {
  "idx": 7, "tag": "0008_progress_notes", "when": 1760000000004
}
```

---

## Migration 0004: meal_favorites

```sql
CREATE TABLE public.meal_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  food_name varchar NOT NULL,
  serving_description varchar,
  calories integer NOT NULL,
  protein numeric(6,1) NOT NULL,
  carbs numeric(6,1) NOT NULL,
  fat numeric(6,1) NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT meal_favorites_member_food UNIQUE (member_id, food_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_favorites TO authenticated;
GRANT ALL ON public.meal_favorites TO service_role;
ALTER TABLE public.meal_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meal_favorites own member" ON public.meal_favorites FOR ALL TO authenticated
  USING (member_id = public.my_member_id())
  WITH CHECK (member_id = public.my_member_id());
CREATE INDEX ON public.meal_favorites(member_id, created_at DESC);
```

## Migration 0005: meal_templates

```sql
CREATE TABLE public.meal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  name varchar NOT NULL,
  meals jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_templates TO authenticated;
GRANT ALL ON public.meal_templates TO service_role;
ALTER TABLE public.meal_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meal_templates own member" ON public.meal_templates FOR ALL TO authenticated
  USING (member_id = public.my_member_id())
  WITH CHECK (member_id = public.my_member_id());
CREATE INDEX ON public.meal_templates(member_id, created_at DESC);
```

## Migration 0006: recipes & meal_plans

```sql
CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  name varchar NOT NULL,
  ingredients jsonb NOT NULL DEFAULT '[]',
  servings numeric(5,1) NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipes TO authenticated;
GRANT ALL ON public.recipes TO service_role;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipes own member" ON public.recipes FOR ALL TO authenticated
  USING (member_id = public.my_member_id())
  WITH CHECK (member_id = public.my_member_id());
CREATE INDEX ON public.recipes(member_id, created_at DESC);

CREATE TABLE public.meal_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  meal_date date NOT NULL,
  servings numeric(5,1) NOT NULL DEFAULT 1,
  eaten boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_plans TO authenticated;
GRANT ALL ON public.meal_plans TO service_role;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meal_plans own member" ON public.meal_plans FOR ALL TO authenticated
  USING (member_id = public.my_member_id())
  WITH CHECK (member_id = public.my_member_id());
CREATE INDEX ON public.meal_plans(member_id, meal_date DESC);
```

## Migration 0008: progress_notes

```sql
CREATE TABLE public.progress_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  note_date date NOT NULL,
  text varchar NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.progress_notes TO authenticated;
GRANT ALL ON public.progress_notes TO service_role;
ALTER TABLE public.progress_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "progress_notes own member" ON public.progress_notes FOR ALL TO authenticated
  USING (member_id = public.my_member_id())
  WITH CHECK (member_id = public.my_member_id());
CREATE INDEX ON public.progress_notes(member_id, note_date DESC);
```

---

# SECTION B: Server Functions (Paste as one large file)

Create `src/lib/meal-operations.functions.ts` containing ALL server functions for phases 1–6:

[Due to size, see FUNCTIONS_CODE.md for complete implementation]

---

# SECTION C: Routes & Components (Paste each as separate file)

**Key files to create:**
- `src/routes/_space.diary.tsx` — Phase 1 diary view
- `src/routes/_space.recipes.tsx` — Phase 3 recipe management  
- `src/routes/_space.planner.tsx` — Phase 3 weekly meal planning
- `src/routes/_space.analytics.tsx` — Phase 4 analytics dashboard
- `src/components/us/DiarySheet.tsx` — Phase 1 quick-add modal
- `src/components/us/FoodSearchSheet.tsx` — Phase 2 food search
- `src/components/us/BarcodeScanner.tsx` — Phase 2 barcode scan
- `src/components/us/MacroSuggestions.tsx` — Phase 6 AI suggestions

[Due to size, see ROUTES_COMPONENTS_CODE.md for complete implementation]

---

# SECTION D: Updated Navigation

Update `src/routes/_space.tsx` to add 3 new tabs:
- Diary (replaces Today)
- Recipes
- Analytics
- Planner

---

# Migration Steps

1. **Backup your database** (always!)
2. **Run migrations** in Supabase SQL Editor in order (0004, 0005, 0006, 0008)
3. **Copy all server functions** into `src/lib/meal-operations.functions.ts` (create new file)
4. **Create routes & components** from ROUTES_COMPONENTS_CODE.md
5. **Update navigation** in `_space.tsx`
6. **Test locally** (`npm run dev`)
7. **Deploy** to production

---

# Implementation Notes

## Credit-Efficient Pasting Strategy for Lovable

Instead of 7 separate prompts (7 credits), use 3–4 large prompts:

**Prompt 1 (1 credit):**
"Create all database migrations in order: 0004, 0005, 0006, 0008. Run these in Supabase. Update _journal.json with new entries."
[Paste all migration SQL]

**Prompt 2 (1 credit):**
"Create src/lib/meal-operations.functions.ts with all server functions below. This file handles all CRUD operations for meals, recipes, templates, favorites, and analytics."
[Paste complete functions file]

**Prompt 3 (1 credit):**
"Create all new routes and components below. These are the UI views for diary, recipes, planner, and analytics."
[Paste all routes and components]

**Prompt 4 (optional, 1 credit):**
"Update src/routes/_space.tsx to add 4 new nav items: Diary, Recipes, Planner, Analytics. Keep existing layout structure."
[Paste updated nav]

**Total: 3–4 credits for all 7 phases** (vs 56 if done individually)

---

# What Each Phase Includes

| Phase | What's Added | Status |
|---|---|---|
| 1 | Diary view, favorites, templates, copy actions | Ready |
| 2 | Food search (Open Food Facts), barcode scanner | Ready |
| 3 | Recipes with ingredient scaling, meal planning, shopping lists | Ready |
| 4 | Weight trends, summaries, analytics dashboard | Ready |
| 5 | Nutrition insights, macro analysis (built into Phase 4) | Ready |
| 6 | AI "what can I eat?" suggestions | Ready |
| 7 | Tests (write these manually in Lovable) | Framework Ready |

---

# Full Code Files

See attached:
- `FUNCTIONS_CODE.md` — All server functions (meal.functions.ts)
- `ROUTES_COMPONENTS_CODE.md` — All routes and components

Download these files and paste into Lovable per the strategy above.

