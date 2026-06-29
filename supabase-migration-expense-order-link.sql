-- ============================================================
-- Fix: link manufacturing expenses to their order so deleting
-- an order also removes its costs (no more phantom P&L losses).
-- Safe to re-run. Run in Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
