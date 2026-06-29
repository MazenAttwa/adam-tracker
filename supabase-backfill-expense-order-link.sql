-- ============================================================
-- One-time backfill: link EXISTING manufacturing expenses to
-- their order (for orders submitted before the expense-link fix).
-- Matches the order number at the start of the description
-- (e.g. "ORD-2026-0024 — Materials").
-- Safe to re-run. Run AFTER the expense-order-link migration.
-- ============================================================

UPDATE public.expenses e
SET order_id = o.id
FROM public.orders o
WHERE e.order_id IS NULL
  AND e.category = 'manufacturing'
  AND e.description LIKE o.order_number || ' — %';

NOTIFY pgrst, 'reload schema';
