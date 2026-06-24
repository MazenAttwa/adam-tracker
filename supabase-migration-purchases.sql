-- ============================================================
-- Migration: material purchases (receipts, cost, date) + stock ledger
-- Adds receipt/cost/date to stock_movements and seeds an opening
-- balance so current stock = SUM(in) - SUM(out) matches today's value.
-- Safe to re-run (idempotent). Run in Supabase SQL Editor.
-- ============================================================

-- 1) New columns on the stock ledger
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS receipt_path  text;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS receipt_name  text;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS total_cost    numeric;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS purchase_date date;

-- 2) Opening balance backfill
-- For each material, insert an 'in' movement equal to
-- (stored current_quantity) - (current ledger net) so that
-- SUM(in) - SUM(out) equals the quantity shown today.
-- Difference of 0 is skipped, so this is safe to re-run.
INSERT INTO public.stock_movements (material_id, type, quantity, notes, created_at)
SELECT m.id,
       'in',
       m.current_quantity - COALESCE((
         SELECT SUM(CASE WHEN sm.type = 'in' THEN sm.quantity ELSE -sm.quantity END)
         FROM public.stock_movements sm
         WHERE sm.material_id = m.id
       ), 0),
       'Opening balance',
       now()
FROM public.materials m
WHERE m.current_quantity - COALESCE((
         SELECT SUM(CASE WHEN sm.type = 'in' THEN sm.quantity ELSE -sm.quantity END)
         FROM public.stock_movements sm
         WHERE sm.material_id = m.id
       ), 0) <> 0;

NOTIFY pgrst, 'reload schema';
