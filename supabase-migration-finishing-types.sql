-- ============================================================
-- Migration: finishing_types table
-- Lets users pick an existing finishing type OR add a new one.
-- Run in Supabase SQL Editor.
-- ============================================================

-- -- TABLE ---------------------------------------------------

CREATE TABLE IF NOT EXISTS public.finishing_types (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  created_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.finishing_types ENABLE ROW LEVEL SECURITY;

-- -- ROW LEVEL SECURITY --------------------------------------
-- Everyone signed in can read the list and add a new type.
-- Only managers can edit/delete existing ones.

CREATE POLICY "finishing_types: authenticated read" ON public.finishing_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "finishing_types: authenticated insert" ON public.finishing_types
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "finishing_types: manager update" ON public.finishing_types
  FOR UPDATE USING (public.get_my_role() = 'manager');

CREATE POLICY "finishing_types: manager delete" ON public.finishing_types
  FOR DELETE USING (public.get_my_role() = 'manager');

-- -- SEED DEFAULTS -------------------------------------------

INSERT INTO public.finishing_types (name) VALUES
  ('Machine Finished'),
  ('Hand Finished'),
  ('Ironing Only'),
  ('Steam Finished'),
  ('Folding + Packaging')
ON CONFLICT (name) DO NOTHING;

-- -- REFRESH SCHEMA CACHE ------------------------------------
NOTIFY pgrst, 'reload schema';
