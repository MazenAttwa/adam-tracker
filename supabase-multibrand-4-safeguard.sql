-- ============================================================
-- ADAM STORE — MULTI-BRAND SAFEGUARD (Phase 4)
-- Guarantees every row is always brand-tagged, so nothing can
-- ever be "hidden" again. Run in Supabase -> SQL Editor.
-- This ALSO re-tags any currently-untagged rows (fixes the
-- hidden orders / stock right now). Idempotent & safe.
-- ============================================================
DO $$
DECLARE
  main_brand uuid;
  t text;
  tables text[] := ARRAY[
    'orders','stage_data','materials','material_photos','order_materials','stock_movements',
    'manufacturers','finishing_manufacturers','vendors','vendor_transactions','expenses',
    'revenue','month_closes','retailers','sales','order_photos','production_lines',
    'production_assignments','finishing_types','audit_log'
  ];
BEGIN
  SELECT id INTO main_brand FROM public.brands ORDER BY created_at LIMIT 1;
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name=t AND column_name='brand_id') THEN
      -- 1) re-tag anything still untagged (also fixes hidden rows now)
      EXECUTE format('UPDATE public.%I SET brand_id = %L WHERE brand_id IS NULL', t, main_brand);
      -- 2) auto-tag future inserts even if a code path forgets
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN brand_id SET DEFAULT public.current_brand()', t);
      -- 3) make it required so an untagged row can never be created
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN brand_id SET NOT NULL', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
-- Done. brand_id is now defaulted + required on every table.
