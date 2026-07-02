-- ============================================================
-- ADAM STORE — RUN ALL PENDING SQL (one-time, idempotent)
-- Paste this whole file into Supabase -> SQL Editor and click Run.
-- Safe to re-run; it won't duplicate or break anything.
-- Order matters: schema changes -> backfills -> cleanup.
-- ============================================================

-- 1) SALES: allow direct-customer sales (fixes the "date column" schema-cache error)
ALTER TABLE public.sales ALTER COLUMN retailer_id DROP NOT NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS customer_name text;

-- 2) EXPENSES: link each expense to its order (so deletes clean up costs)
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

-- refresh the API schema cache after the column changes
NOTIFY pgrst, 'reload schema';

-- 3) BACKFILL: link existing manufacturing expenses to their (still-existing) order
UPDATE public.expenses e
SET order_id = o.id
FROM public.orders o
WHERE e.order_id IS NULL
  AND e.category = 'manufacturing'
  AND e.description LIKE o.order_number || ' — %';

-- 4) BACKFILL: add the "Logistics" expense to already-submitted orders that lack it
INSERT INTO public.expenses (date, category, amount, description, order_id, created_by)
SELECT
  CURRENT_DATE, 'manufacturing', logi.total,
  o.order_number || ' — Logistics', o.id, o.created_by
FROM public.orders o
JOIN (
  SELECT order_id, SUM((data->>'logistic_cost')::numeric) AS total
  FROM public.stage_data
  WHERE (data->>'logistic_cost') ~ '^[0-9]+(\.[0-9]+)?$'
  GROUP BY order_id
) logi ON logi.order_id = o.id
WHERE o.current_stage IN ('submitted', 'received')
  AND logi.total > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.expenses e WHERE e.description = o.order_number || ' — Logistics'
  );

-- 5) BACKFILL: reflect received revenue for orders already at "Received"
UPDATE public.revenue r
SET amount = (sd.data->>'total_received_revenue')::numeric,
    date  = COALESCE(NULLIF(sd.data->>'received_date','')::date, r.date)
FROM public.orders o
JOIN public.stage_data sd ON sd.order_id = o.id AND sd.stage = 'received'
WHERE r.order_id = o.id
  AND o.current_stage = 'received'
  AND (sd.data->>'total_received_revenue') IS NOT NULL
  AND (sd.data->>'total_received_revenue')::numeric > 0;

INSERT INTO public.revenue (date, type, amount, description, order_id, created_by)
SELECT
  COALESCE(NULLIF(sd.data->>'received_date','')::date, CURRENT_DATE),
  'sales',
  (sd.data->>'total_received_revenue')::numeric,
  o.order_number || ' — ' || o.customer_name,
  o.id, o.created_by
FROM public.orders o
JOIN public.stage_data sd ON sd.order_id = o.id AND sd.stage = 'received'
WHERE o.current_stage = 'received'
  AND (sd.data->>'total_received_revenue') IS NOT NULL
  AND (sd.data->>'total_received_revenue')::numeric > 0
  AND NOT EXISTS (SELECT 1 FROM public.revenue r WHERE r.order_id = o.id);

-- 6) CLEANUP (last): remove manufacturing expenses whose order no longer exists
DELETE FROM public.expenses e
WHERE e.category = 'manufacturing'
  AND (
        e.description LIKE '% — Materials'  OR e.description LIKE '% — Fabric'
     OR e.description LIKE '% — Cutting'    OR e.description LIKE '% — Printing'
     OR e.description LIKE '% — Finishing'  OR e.description LIKE '% — Logistics'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.orders o WHERE e.description LIKE o.order_number || ' — %'
  );

NOTIFY pgrst, 'reload schema';

-- Done. Refresh the app; Finance / Reports / Dashboard numbers should now reconcile.