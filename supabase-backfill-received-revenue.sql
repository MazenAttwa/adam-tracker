-- ============================================================
-- One-time backfill: record revenue for orders ALREADY at
-- "Received by Customer" so they count toward profit in Reports.
--
-- - Updates the 0-placeholder revenue (created at "Submitted")
--   to the actual received value.
-- - Inserts a revenue row for received orders that have none.
-- Safe to re-run. Run in Supabase SQL Editor.
-- ============================================================

-- 1) Update existing revenue rows to the actual received value
UPDATE public.revenue r
SET amount = (sd.data->>'total_received_revenue')::numeric,
    date  = COALESCE(NULLIF(sd.data->>'received_date','')::date, r.date)
FROM public.orders o
JOIN public.stage_data sd
  ON sd.order_id = o.id AND sd.stage = 'received'
WHERE r.order_id = o.id
  AND o.current_stage = 'received'
  AND (sd.data->>'total_received_revenue') IS NOT NULL
  AND (sd.data->>'total_received_revenue')::numeric > 0;

-- 2) Insert revenue for received orders that have no revenue row yet
INSERT INTO public.revenue (date, type, amount, description, order_id, created_by)
SELECT
  COALESCE(NULLIF(sd.data->>'received_date','')::date, CURRENT_DATE),
  'sales',
  (sd.data->>'total_received_revenue')::numeric,
  o.order_number || ' — ' || o.customer_name,
  o.id,
  o.created_by
FROM public.orders o
JOIN public.stage_data sd
  ON sd.order_id = o.id AND sd.stage = 'received'
WHERE o.current_stage = 'received'
  AND (sd.data->>'total_received_revenue') IS NOT NULL
  AND (sd.data->>'total_received_revenue')::numeric > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.revenue r WHERE r.order_id = o.id
  );
