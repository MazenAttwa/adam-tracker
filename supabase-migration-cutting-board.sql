-- ============================================================
-- Migration: stage-scoped production planning boards
-- Adds a `stage` column to production_lines and production_assignments
-- so Cutting and Finishing each get their own separate board.
-- Existing rows default to 'finishing' (current board unchanged).
-- Safe to re-run. Run in Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.production_lines
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'finishing';

ALTER TABLE public.production_assignments
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'finishing';

-- Make sure any pre-existing rows are tagged as finishing
UPDATE public.production_lines       SET stage = 'finishing' WHERE stage IS NULL;
UPDATE public.production_assignments SET stage = 'finishing' WHERE stage IS NULL;

NOTIFY pgrst, 'reload schema';
