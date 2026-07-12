-- ============================================================
-- ADAM STORE — FIX: sales.date column is missing
--
-- The app writes/reads sales.date everywhere (Sales page, order
-- "Received", retailer statements) but the column does not exist,
-- so creating a sale has been FAILING (silently on the Sales page).
--
-- This adds it and backfills existing rows from created_at.
-- Run in Supabase -> SQL Editor. Safe to re-run.
-- ============================================================

alter table public.sales add column if not exists date date;

-- Existing sales: use the day they were created
update public.sales set date = created_at::date where date is null;

alter table public.sales alter column date set default current_date;
alter table public.sales alter column date set not null;

create index if not exists idx_sales_date on public.sales(date);

-- Make sure revenue exists for every manual sale (now that date is real)
insert into public.revenue (date, type, amount, description, sale_id, brand_id)
select s.date, 'sales', s.total_amount, 'Invoice ' || s.invoice_number, s.id, s.brand_id
from public.sales s
where s.order_id is null
  and s.total_amount > 0
  and not exists (select 1 from public.revenue r where r.sale_id = s.id);

notify pgrst, 'reload schema';
-- Done. Sales can be created again, and they count toward revenue.