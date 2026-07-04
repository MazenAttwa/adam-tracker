-- ============================================================
-- ADAM STORE — MULTI-BRAND PHASE 2: database-enforced isolation
-- Every read is filtered, every write is tagged, to the user's
-- current brand — automatically, at the DB level.
-- Run AFTER phase 1. Idempotent & safe to re-run.
-- Behavior is unchanged until you actually switch brands
-- (everyone defaults to the first/"Adam Store" brand).
-- ============================================================

-- 1) each user's currently-selected brand
CREATE TABLE IF NOT EXISTS public.user_brand_selection (
  user_id  uuid PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE
);
ALTER TABLE public.user_brand_selection ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ubs_all ON public.user_brand_selection;
CREATE POLICY ubs_all ON public.user_brand_selection FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 2) the caller's current brand (defaults to the first brand if none chosen)
CREATE OR REPLACE FUNCTION public.current_brand() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT brand_id FROM public.user_brand_selection WHERE user_id = auth.uid()),
    (SELECT id FROM public.brands ORDER BY created_at LIMIT 1)
  )
$$;

-- 3) auto-fill brand_id on insert
CREATE OR REPLACE FUNCTION public.set_brand_id() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.brand_id IS NULL THEN NEW.brand_id := public.current_brand(); END IF;
  RETURN NEW;
END $$;

-- 4) apply brand isolation (RLS + insert trigger) to every scoped table
DO $$
DECLARE
  t text;
  pol record;
  tables text[] := ARRAY[
    'orders','stage_data','materials','material_photos','order_materials','stock_movements',
    'manufacturers','finishing_manufacturers','vendors','vendor_transactions','expenses',
    'revenue','month_closes','retailers','sales','order_photos','production_lines',
    'production_assignments','finishing_types','audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name=t AND column_name='brand_id') THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
        EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
      END LOOP;
      EXECUTE format(
        'CREATE POLICY brand_isolation ON public.%I FOR ALL TO authenticated '
        || 'USING (brand_id = public.current_brand()) WITH CHECK (brand_id = public.current_brand())', t);
      EXECUTE format('DROP TRIGGER IF EXISTS trg_set_brand ON public.%I', t);
      EXECUTE format('CREATE TRIGGER trg_set_brand BEFORE INSERT ON public.%I '
        || 'FOR EACH ROW EXECUTE FUNCTION public.set_brand_id()', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
-- Done. Data is now isolated per brand at the database level.
