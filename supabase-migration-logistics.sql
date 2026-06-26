-- ============================================================
-- Migration: logistic (transport) cost on material purchases
-- Order-stage logistics are stored in stage_data JSON (no DB change).
-- Safe to re-run. Run in Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS logistic_cost numeric;

NOTIFY pgrst, 'reload schema';
