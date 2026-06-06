-- ============================================================
-- Migration 001 — Run in Supabase SQL Editor
-- 1. Promote mazen.attwaa@gmail.com to manager
-- 2. Storage policies for product-photos bucket
-- ============================================================

-- ── 1. PROMOTE USER TO MANAGER ────────────────────────────

UPDATE public.profiles
SET role = 'manager'
WHERE email = 'mazen.attwaa@gmail.com';

-- ── 2. PRODUCT-PHOTOS STORAGE BUCKET & POLICIES ───────────

-- Create the bucket if it doesn't exist yet
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-photos', 'product-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload photos
CREATE POLICY "product-photos: upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-photos');

-- Authenticated users can view / download photos
CREATE POLICY "product-photos: read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'product-photos');

-- Authenticated users can replace / update their own uploads
CREATE POLICY "product-photos: update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-photos')
WITH CHECK (bucket_id = 'product-photos');

-- Only managers can delete photos
CREATE POLICY "product-photos: manager delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-photos'
  AND public.get_my_role() = 'manager'
);
