-- ============================================================
-- Migration: finishing_types table
-- Lets users pick an existing finishing type OR add a new one.
-- Safe to re-run (idempotent). Run in Supabase SQL Editor.
-- ============================================================

-- Drop any existing policies so we can recreate cleanly
DROP POLICY IF EXISTS "finishing_types: authenticated read" ON public.finishing_types;
DROP POLICY IF EXISTS "finishing_types: authenticated insert" ON public.finishing_types;
DROP POLICY IF EXISTS "finishing_types: manager update" ON public.finishing_types;
DROP POLICY IF EXISTS "finishing_types: manager delete" ON public.finishing_types;

-- Make sure the table exists (skips if already there)
CREATE TABLE IF NOT EXISTS public.finishing_types (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  created_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.finishing_types ENABLE ROW LEVEL SECURITY;

-- Recreate the policies
CREATE POLICY "finishing_types: authenticated read" ON public.finishing_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "finishing_types: authenticated insert" ON public.finishing_types
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "finishing_types: manager update" ON public.finishing_types
  FOR UPDATE USING (public.get_my_role() = 'manager');

CREATE POLICY "finishing_types: manager delete" ON public.finishing_types
  FOR DELETE USING (public.get_my_role() = 'manager');

-- Seed the starter types (skips any that already exist)
INSERT INTO public.finishing_types (name) VALUES
  ('Machine Finished'),
  ('Hand Finished'),
  ('Ironing Only'),
  ('Steam Finished'),
  ('Folding + Packaging')
ON CONFLICT (name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
