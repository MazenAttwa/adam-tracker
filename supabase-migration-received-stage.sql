-- ============================================================
-- Migration: add 'received' stage (Received by Customer)
-- Updates the stage CHECK constraints to allow the new 7th stage.
-- Safe to re-run (idempotent). Run in Supabase SQL Editor.
-- ============================================================

-- orders.current_stage
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_current_stage_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_current_stage_check
  CHECK (current_stage IN ('draft','preparation','cutting','printing','finishing','submitted','received'));

-- stage_data.stage
ALTER TABLE public.stage_data DROP CONSTRAINT IF EXISTS stage_data_stage_check;
ALTER TABLE public.stage_data ADD CONSTRAINT stage_data_stage_check
  CHECK (stage IN ('draft','preparation','cutting','printing','finishing','submitted','received'));

-- profiles.assigned_stage
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_assigned_stage_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_assigned_stage_check
  CHECK (
    assigned_stage IN ('draft','preparation','cutting','printing','finishing','submitted','received')
    OR assigned_stage IS NULL
  );

NOTIFY pgrst, 'reload schema';
