-- ============================================================
-- One-time backfill: add the "Logistics" expense to orders that
-- were already submitted BEFORE logistics-in-expenses was added.
-- Sums logistic_cost across all stages of each order.
-- Safe to re-run (won't duplicate). Run in Supabase SQL Editor.
-- ============================================================

-- Make sure the order link column exists (harmless if already there)
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

INSERT INTO public.expenses (date, category, amount, description, order_id, created_by)
SELECT
  CURRENT_DATE,
  'manufacturing',
  logi.total,
  o.order_number || ' — Logistics',
  o.id,
  o.created_by
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
    SELECT 1 FROM public.expenses e
    WHERE e.description = o.order_number || ' — Logistics'
  );

NOTIFY pgrst, 'reload schema';
