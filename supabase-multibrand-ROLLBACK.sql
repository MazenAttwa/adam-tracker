-- ============================================================
-- ROLLBACK for multi-brand Phase 2 (ONLY run if your data
-- disappeared / the app shows nothing after phase 2).
-- This turns OFF the brand isolation and re-opens all tables,
-- returning the app to normal single-brand behavior.
-- Your data is untouched.
-- ============================================================
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'orders','stage_data','materials','material_photos','order_materials','stock_movements',
    'manufacturers','finishing_manufacturers','vendors','vendor_transactions','expenses',
    'revenue','month_closes','retailers','sales','order_photos','production_lines',
    'production_assignments','finishing_types','audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP POLICY IF EXISTS brand_isolation ON public.%I', t);
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
