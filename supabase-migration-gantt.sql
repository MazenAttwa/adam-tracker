-- ============================================================
-- Adam Store — Production Planning Gantt Chart Migration
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Production lines (rows in the Gantt chart)
CREATE TABLE IF NOT EXISTS public.production_lines (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name          text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES public.profiles(id),
  created_at    timestamptz DEFAULT now() NOT NULL
);

-- Production assignments (bars in the Gantt chart)
CREATE TABLE IF NOT EXISTS public.production_assignments (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  line_id          uuid REFERENCES public.production_lines(id) ON DELETE CASCADE NOT NULL,
  order_id         uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  order_name       text NOT NULL DEFAULT '',
  start_date       date NOT NULL,
  end_date         date NOT NULL,
  estimated_hours  numeric(8,2) NOT NULL DEFAULT 0,
  quantity         integer NOT NULL DEFAULT 0,
  created_by       uuid REFERENCES public.profiles(id),
  created_at       timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- Enable Row Level Security
ALTER TABLE public.production_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_assignments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES: all authenticated users read; managers + workers write
-- ============================================================

-- production_lines: read
CREATE POLICY "production_lines_read"
  ON public.production_lines FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- production_lines: insert (managers + workers only)
CREATE POLICY "production_lines_insert"
  ON public.production_lines FOR INSERT
  WITH CHECK (public.get_my_role() IN ('manager', 'worker'));

-- production_lines: update (managers + workers only)
CREATE POLICY "production_lines_update"
  ON public.production_lines FOR UPDATE
  USING (public.get_my_role() IN ('manager', 'worker'));

-- production_lines: delete (managers + workers only)
CREATE POLICY "production_lines_delete"
  ON public.production_lines FOR DELETE
  USING (public.get_my_role() IN ('manager', 'worker'));

-- production_assignments: read
CREATE POLICY "production_assignments_read"
  ON public.production_assignments FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- production_assignments: insert (managers + workers only)
CREATE POLICY "production_assignments_insert"
  ON public.production_assignments FOR INSERT
  WITH CHECK (public.get_my_role() IN ('manager', 'worker'));

-- production_assignments: update (managers + workers only)
CREATE POLICY "production_assignments_update"
  ON public.production_assignments FOR UPDATE
  USING (public.get_my_role() IN ('manager', 'worker'));

-- production_assignments: delete (managers + workers only)
CREATE POLICY "production_assignments_delete"
  ON public.production_assignments FOR DELETE
  USING (public.get_my_role() IN ('manager', 'worker'));

-- Enable realtime for both tables (run in Supabase dashboard under Realtime settings,
-- or execute the following if using supabase CLI / direct SQL access):
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.production_lines;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.production_assignments;
