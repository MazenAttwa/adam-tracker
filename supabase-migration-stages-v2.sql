-- ============================================================
-- Adam Store — Stages v2 Migration
-- Changes:
--   1. Split 'cutting_printing' into 'cutting' and 'printing'
--   2. Add 'manufacturing' expense category
--   3. Create manufacturers table
-- Run in Supabase SQL Editor
-- ============================================================

-- ── 1. UPDATE STAGE CHECK CONSTRAINTS ─────────────────────

-- orders.current_stage
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_current_stage_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_current_stage_check
  CHECK (current_stage IN ('draft','preparation','cutting','printing','finishing','submitted'));

-- stage_data.stage
ALTER TABLE public.stage_data DROP CONSTRAINT IF EXISTS stage_data_stage_check;
ALTER TABLE public.stage_data ADD CONSTRAINT stage_data_stage_check
  CHECK (stage IN ('draft','preparation','cutting','printing','finishing','submitted'));

-- profiles.assigned_stage
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_assigned_stage_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_assigned_stage_check
  CHECK (
    assigned_stage IN ('draft','preparation','cutting','printing','finishing','submitted')
    OR assigned_stage IS NULL
  );

-- ── 2. MIGRATE EXISTING DATA ───────────────────────────────

-- Rename cutting_printing → cutting in all tables
-- (existing data treated as the cutting phase)
UPDATE public.orders
  SET current_stage = 'cutting'
  WHERE current_stage = 'cutting_printing';

UPDATE public.stage_data
  SET stage = 'cutting'
  WHERE stage = 'cutting_printing';

UPDATE public.profiles
  SET assigned_stage = 'cutting'
  WHERE assigned_stage = 'cutting_printing';

-- ── 3. ADD 'manufacturing' TO EXPENSE CATEGORY ────────────

-- Drop the old constraint (name may vary; try both common names)
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_check
  CHECK (category IN ('salary','rent','utilities','materials','transport','other','manufacturing'));

-- ── 4. CREATE MANUFACTURERS TABLE ─────────────────────────

CREATE TABLE IF NOT EXISTS public.manufacturers (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL,
  phone       text,
  address     text,
  speciality  text CHECK (speciality IN ('cutting','printing','finishing','all') OR speciality IS NULL),
  notes       text,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz DEFAULT now() NOT NULL,
  updated_at  timestamptz DEFAULT now() NOT NULL
);

-- Auto-update timestamp
CREATE TRIGGER manufacturers_updated_at
  BEFORE UPDATE ON public.manufacturers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 5. RLS FOR MANUFACTURERS ───────────────────────────────

ALTER TABLE public.manufacturers ENABLE ROW LEVEL SECURITY;

-- Managers: full access
CREATE POLICY "manufacturers: manager all"
  ON public.manufacturers
  FOR ALL
  USING (public.get_my_role() = 'manager');

-- Workers: read only
CREATE POLICY "manufacturers: worker read"
  ON public.manufacturers
  FOR SELECT
  USING (public.get_my_role() = 'worker');

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.manufacturers;
