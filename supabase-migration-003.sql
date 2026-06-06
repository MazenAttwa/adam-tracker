-- ============================================================
-- Migration 003 — Run in Supabase SQL Editor
-- Drops and recreates order_photos with the exact column names
-- the PhotoUpload component expects.
-- ============================================================

-- Drop existing table and all its policies
DROP TABLE IF EXISTS public.order_photos CASCADE;

-- ── TABLE ─────────────────────────────────────────────────

CREATE TABLE public.order_photos (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id    uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  file_path   text NOT NULL,
  file_name   text NOT NULL,
  uploaded_by uuid REFERENCES public.profiles(id),
  uploaded_at timestamptz DEFAULT now() NOT NULL
);

-- ── ROW LEVEL SECURITY ────────────────────────────────────

ALTER TABLE public.order_photos ENABLE ROW LEVEL SECURITY;

-- Managers can do everything
CREATE POLICY "order_photos: manager all" ON public.order_photos
  FOR ALL USING (public.get_my_role() = 'manager');

-- Workers can read all photos
CREATE POLICY "order_photos: worker read" ON public.order_photos
  FOR SELECT USING (public.get_my_role() = 'worker');

-- Workers can insert photos
CREATE POLICY "order_photos: worker insert" ON public.order_photos
  FOR INSERT WITH CHECK (public.get_my_role() = 'worker');

-- Workers can delete their own photos
CREATE POLICY "order_photos: worker delete own" ON public.order_photos
  FOR DELETE USING (
    public.get_my_role() = 'worker' AND uploaded_by = auth.uid()
  );

-- Customers can read photos for their own orders
CREATE POLICY "order_photos: customer read own" ON public.order_photos
  FOR SELECT USING (
    public.get_my_role() = 'customer' AND
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND o.customer_id = auth.uid()
    )
  );

-- ── STORAGE: allow uploader to delete their own photos ────
-- (safe to run again — DO NOTHING if policy already exists)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'product-photos: owner delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "product-photos: owner delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'product-photos'
        AND owner = auth.uid()
      )
    $policy$;
  END IF;
END
$$;
