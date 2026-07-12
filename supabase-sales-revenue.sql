-- ============================================================
-- ADAM STORE — SALES REVENUE (P&L correctness fix)
--
-- Sales created on the Sales page never recorded revenue, so they
-- were missing from Dashboard / Finance / Reports profit figures.
--
-- This links a revenue row to its sale and backfills the ones missed.
-- Sales that came from an order are SKIPPED (the order already
-- recorded that revenue) so nothing is double-counted.
--
-- Run in Supabase -> SQL Editor. Safe to re-run.
-- ============================================================

alter table public.revenue
  add column if not exists sale_id uuid references public.sales(id) on delete cascade;

create index if not exists idx_revenue_sale on public.revenue(sale_id);

-- Backfill: create the missing revenue for past manual sales
insert into public.revenue (date, type, amount, description, sale_id, brand_id)
select
  s.date,
  'sales',
  s.total_amount,
  'Invoice ' || s.invoice_number,
  s.id,
  s.brand_id
from public.sales s
where s.order_id is null                       -- order sales already have revenue
  and s.total_amount > 0
  and not exists (
    select 1 from public.revenue r where r.sale_id = s.id
  );

notify pgrst, 'reload schema';
-- Done. Your Dashboard / Finance / Reports profit now includes sales.
