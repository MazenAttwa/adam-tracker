-- ============================================================
-- Migration: allow direct-customer sales (no retailer)
-- Lets an order be auto-recorded as a Sale when marked "Received",
-- using the order's customer name instead of a retailer.
-- Safe to re-run. Run in Supabase SQL Editor.
-- ============================================================

-- Make retailer optional on sales
ALTER TABLE public.sales ALTER COLUMN retailer_id DROP NOT NULL;

-- Hold the customer name for retailer-less (direct customer) sales
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS customer_name text;

NOTIFY pgrst, 'reload schema';
