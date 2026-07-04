-- ============================================================
-- ADAM STORE — MULTI-BRAND FOUNDATION (Phase 1)
-- Adds a brands table + a brand_id to every data table, and
-- assigns ALL existing data to a default "Adam Store" brand.
-- Safe & idempotent. Run in Supabase -> SQL Editor.
-- This does NOT change how the app behaves yet (single brand).
-- ============================================================

-- 1) brands table
CREATE TABLE IF NOT EXISTS public.brands (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brands_all ON public.brands;
CREATE POLICY brands_all ON public.brands FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2) create the default brand for existing data (only once)
INSERT INTO public.brands (name)
SELECT 'Adam Store'
WHERE NOT EXISTS (SELECT 1 FROM public.brands);

-- 3) add brand_id to every data table, backfill to the default brand, index it
DO $$
DECLARE
  default_brand uuid;
  t text;
  tables text[] := ARRAY[
    'orders','stage_data','materials','material_photos','order_materials','stock_movements',
    'manufacturers','finishing_manufacturers','vendors','vendor_transactions','expenses',
    'revenue','month_closes','retailers','sales','order_photos','production_lines',
    'production_assignments','finishing_types','audit_log'
  ];
BEGIN
  SELECT id INTO default_brand FROM public.brands ORDER BY created_at LIMIT 1;
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE', t);
      EXECUTE format('UPDATE public.%I SET brand_id = %L WHERE brand_id IS NULL', t, default_brand);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_brand ON public.%I(brand_id)', t, t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
-- Done. Existing data is now all under the "Adam Store" brand.
