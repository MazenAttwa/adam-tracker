-- ============================================================
-- One-time cleanup: remove orphaned manufacturing expenses that
-- belong to orders which no longer exist (deleted before the
-- expense-order link was in place).
--
-- SAFE: only deletes auto-created order expenses (description like
-- "ORD-... — Materials/Fabric/Cutting/Printing/Finishing") whose
-- order number does NOT match any existing order. Manual expenses
-- and expenses for existing orders are never touched.
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================

DELETE FROM public.expenses e
WHERE e.category = 'manufacturing'
  AND (
        e.description LIKE '% — Materials'
     OR e.description LIKE '% — Fabric'
     OR e.description LIKE '% — Cutting'
     OR e.description LIKE '% — Printing'
     OR e.description LIKE '% — Finishing'
     OR e.description LIKE '% — Logistics'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE e.description LIKE o.order_number || ' — %'
  );
