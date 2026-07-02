-- ============================================================
-- ADAM STORE — DIAGNOSE + CLEAN orphaned data from deleted orders
-- Run PART 1 first (just SELECTs, changes nothing) to SEE what's orphaned.
-- Then run PART 2 to DELETE the orphaned rows. Safe to re-run.
-- ============================================================

-- ---------- PART 1: DIAGNOSE (read-only) ----------
SELECT 'stage_data'              AS table, COUNT(*) AS orphaned_rows FROM public.stage_data sd            WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = sd.order_id)
UNION ALL SELECT 'order_materials',        COUNT(*) FROM public.order_materials om                          WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = om.order_id)
UNION ALL SELECT 'stock_movements',        COUNT(*) FROM public.stock_movements sm                          WHERE sm.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = sm.order_id)
UNION ALL SELECT 'order_photos',           COUNT(*) FROM public.order_photos op                             WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = op.order_id)
UNION ALL SELECT 'finishing_manufacturers',COUNT(*) FROM public.finishing_manufacturers fm                 WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = fm.order_id)
UNION ALL SELECT 'production_assignments', COUNT(*) FROM public.production_assignments pa                   WHERE pa.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = pa.order_id)
UNION ALL SELECT 'revenue',                COUNT(*) FROM public.revenue rv                                  WHERE rv.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = rv.order_id)
UNION ALL SELECT 'sales',                  COUNT(*) FROM public.sales s                                     WHERE s.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = s.order_id)
UNION ALL SELECT 'expenses(by order_id)',  COUNT(*) FROM public.expenses e                                  WHERE e.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = e.order_id);


-- ---------- PART 2: CLEAN (deletes orphaned rows) ----------
DELETE FROM public.stage_data sd             WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = sd.order_id);
DELETE FROM public.order_materials om        WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = om.order_id);
DELETE FROM public.stock_movements sm        WHERE sm.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = sm.order_id);
DELETE FROM public.order_photos op           WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = op.order_id);
DELETE FROM public.finishing_manufacturers fm WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = fm.order_id);
DELETE FROM public.production_assignments pa WHERE pa.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = pa.order_id);
DELETE FROM public.revenue rv                WHERE rv.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = rv.order_id);
DELETE FROM public.sales s                   WHERE s.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = s.order_id);

-- expenses linked by order_id
DELETE FROM public.expenses e                WHERE e.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = e.order_id);
-- old expenses (no order_id) whose order number no longer exists
DELETE FROM public.expenses e
WHERE e.order_id IS NULL AND e.category = 'manufacturing'
  AND (e.description LIKE '% — Materials' OR e.description LIKE '% — Fabric' OR e.description LIKE '% — Cutting'
       OR e.description LIKE '% — Printing' OR e.description LIKE '% — Finishing' OR e.description LIKE '% — Logistics')
  AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE e.description LIKE o.order_number || ' — %');

NOTIFY pgrst, 'reload schema';
