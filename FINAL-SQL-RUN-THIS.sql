-- ============================================================
-- ADAM STORE — FINAL SETUP SQL (run this once, top to bottom)
-- Paste ALL of this into Supabase -> SQL Editor and click Run.
-- Idempotent & safe to re-run. Fixes number accuracy + adds audit log.
-- ============================================================

-- ---------- 1) SCHEMA ----------
ALTER TABLE public.sales    ALTER COLUMN retailer_id DROP NOT NULL;
ALTER TABLE public.sales    ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

-- Audit log table (who did what, when)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_email  text,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text,
  details     text
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_all ON public.audit_log;
CREATE POLICY audit_all ON public.audit_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- ---------- 2) CLEAN orphaned rows from deleted orders ----------
DELETE FROM public.stage_data sd             WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = sd.order_id);
DELETE FROM public.order_materials om        WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = om.order_id);
DELETE FROM public.stock_movements sm        WHERE sm.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = sm.order_id);
DELETE FROM public.order_photos op           WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = op.order_id);
DELETE FROM public.finishing_manufacturers fm WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = fm.order_id);
DELETE FROM public.production_assignments pa WHERE pa.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = pa.order_id);
DELETE FROM public.revenue rv                WHERE rv.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = rv.order_id);
DELETE FROM public.sales s                   WHERE s.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = s.order_id);
DELETE FROM public.expenses e                WHERE e.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = e.order_id);
DELETE FROM public.expenses e
WHERE e.order_id IS NULL AND e.category = 'manufacturing'
  AND (e.description LIKE '% — Materials' OR e.description LIKE '% — Fabric' OR e.description LIKE '% — Cutting'
       OR e.description LIKE '% — Printing' OR e.description LIKE '% — Finishing' OR e.description LIKE '% — Logistics')
  AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE e.description LIKE o.order_number || ' — %');

-- ---------- 3) BACKFILLS for existing orders ----------
-- link existing expenses to their order
UPDATE public.expenses e SET order_id = o.id
FROM public.orders o
WHERE e.order_id IS NULL AND e.category = 'manufacturing' AND e.description LIKE o.order_number || ' — %';

-- add missing "Logistics" expense to already-submitted orders
INSERT INTO public.expenses (date, category, amount, description, order_id, created_by)
SELECT CURRENT_DATE, 'manufacturing', logi.total, o.order_number || ' — Logistics', o.id, o.created_by
FROM public.orders o
JOIN (SELECT order_id, SUM((data->>'logistic_cost')::numeric) AS total FROM public.stage_data
      WHERE (data->>'logistic_cost') ~ '^[0-9]+(\.[0-9]+)?$' GROUP BY order_id) logi ON logi.order_id = o.id
WHERE o.current_stage IN ('submitted','received') AND logi.total > 0
  AND NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.description = o.order_number || ' — Logistics');

-- reflect received revenue for orders already at "Received"
UPDATE public.revenue r
SET amount = (sd.data->>'total_received_revenue')::numeric,
    date = COALESCE(NULLIF(sd.data->>'received_date','')::date, r.date)
FROM public.orders o JOIN public.stage_data sd ON sd.order_id = o.id AND sd.stage = 'received'
WHERE r.order_id = o.id AND o.current_stage = 'received' AND (sd.data->>'total_received_revenue')::numeric > 0;

INSERT INTO public.revenue (date, type, amount, description, order_id, created_by)
SELECT COALESCE(NULLIF(sd.data->>'received_date','')::date, CURRENT_DATE), 'sales',
  (sd.data->>'total_received_revenue')::numeric, o.order_number || ' — ' || o.customer_name, o.id, o.created_by
FROM public.orders o JOIN public.stage_data sd ON sd.order_id = o.id AND sd.stage = 'received'
WHERE o.current_stage = 'received' AND (sd.data->>'total_received_revenue')::numeric > 0
  AND NOT EXISTS (SELECT 1 FROM public.revenue r WHERE r.order_id = o.id);

NOTIFY pgrst, 'reload schema';
-- Done. Refresh the app; numbers reconcile and the Audit Log is ready.
