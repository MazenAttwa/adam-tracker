-- ============================================================
-- Migration: material_photos table + material-photos bucket
-- Run in Supabase SQL Editor
-- ============================================================

-- ── TABLE ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.material_photos (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id  uuid REFERENCES public.materials(id) ON DELETE CASCADE NOT NULL,
  file_path    text NOT NULL,
  file_name    text NOT NULL,
  uploaded_by  uuid REFERENCES public.profiles(id),
  uploaded_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.material_photos ENABLE ROW LEVEL SECURITY;

-- ── ROW LEVEL SECURITY ────────────────────────────────────

CREATE POLICY "material_photos: manager all" ON public.material_photos
  FOR ALL USING (public.get_my_role() = 'manager');

CREATE POLICY "material_photos: worker read" ON public.material_photos
  FOR SELECT USING (public.get_my_role() = 'worker');

-- ── STORAGE BUCKET ────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('material-photos', 'material-photos', false)
ON CONFLICT (id) DO NOTHING;

-- ── STORAGE POLICIES ──────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'material-photos: authenticated upload'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "material-photos: authenticated upload"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'material-photos')
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'material-photos: authenticated read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "material-photos: authenticated read"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'material-photos')
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'material-photos: manager delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "material-photos: manager delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'material-photos'
        AND (
          public.get_my_role() = 'manager'
          OR owner = auth.uid()
        )
      )
    $policy$;
  END IF;
END $$;
