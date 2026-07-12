-- ================================================================
-- ADAM STORE — RUN THIS ONCE (all pending migrations, in order)
-- Safe to re-run. Paste the whole file into Supabase -> SQL Editor.
--
-- IMPORTANT: Take a Backup first (Backup page in the app).
--
--   1. Brand safeguard  -> un-hides missing orders/stock, prevents recurrence
--   2. Manufacturer payments table
--   3. Retailer payments table
--   4. materials.vendor_id  -> lets a material remember its supplier
--   5. Rebuild vendor purchases -> removes duplicates, counts used material
-- ================================================================


-- ================================================================
-- 1) BRAND SAFEGUARD
--    Re-tags any row missing a brand, then makes brand_id automatic
--    and required so rows can never be "hidden" again.
-- ================================================================
DO $$
DECLARE
  main_brand uuid;
  t text;
  tables text[] := ARRAY[
    'orders','stage_data','materials','material_photos','order_materials','stock_movements',
    'manufacturers','finishing_manufacturers','vendors','vendor_transactions','expenses',
    'revenue','month_closes','retailers','sales','order_photos','production_lines',
    'production_assignments','finishing_types','audit_log'
  ];
BEGIN
  SELECT id INTO main_brand FROM public.brands ORDER BY created_at LIMIT 1;
  IF main_brand IS NULL THEN
    RAISE EXCEPTION 'No brand found in public.brands - cannot continue.';
  END IF;

  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name=t AND column_name='brand_id') THEN
      EXECUTE format('UPDATE public.%I SET brand_id = %L WHERE brand_id IS NULL', t, main_brand);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN brand_id SET DEFAULT public.current_brand()', t);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN brand_id SET NOT NULL', t);
    END IF;
  END LOOP;
END $$;


-- ================================================================
-- 2) MANUFACTURER PAYMENTS (money paid to manufacturers)
-- ================================================================
create table if not exists public.manufacturer_payments (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  amount numeric not null check (amount > 0),
  date date not null default current_date,
  method text,
  notes text,
  brand_id uuid not null default public.current_brand(),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_mfr_payments_mfr   on public.manufacturer_payments(manufacturer_id);
create index if not exists idx_mfr_payments_brand on public.manufacturer_payments(brand_id);

alter table public.manufacturer_payments enable row level security;
drop policy if exists brand_isolation on public.manufacturer_payments;
create policy brand_isolation on public.manufacturer_payments
  using (brand_id = public.current_brand())
  with check (brand_id = public.current_brand());

drop trigger if exists trg_set_brand on public.manufacturer_payments;
create trigger trg_set_brand before insert on public.manufacturer_payments
  for each row execute function public.set_brand_id();


-- ================================================================
-- 3) RETAILER PAYMENTS (money received from retailers)
-- ================================================================
create table if not exists public.retailer_payments (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.retailers(id) on delete cascade,
  amount numeric not null check (amount > 0),
  date date not null default current_date,
  method text,
  notes text,
  brand_id uuid not null default public.current_brand(),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_ret_payments_ret   on public.retailer_payments(retailer_id);
create index if not exists idx_ret_payments_brand on public.retailer_payments(brand_id);

alter table public.retailer_payments enable row level security;
drop policy if exists brand_isolation on public.retailer_payments;
create policy brand_isolation on public.retailer_payments
  using (brand_id = public.current_brand())
  with check (brand_id = public.current_brand());

drop trigger if exists trg_set_brand on public.retailer_payments;
create trigger trg_set_brand before insert on public.retailer_payments
  for each row execute function public.set_brand_id();


-- ================================================================
-- 4) MATERIAL SUPPLIER (so the vendor choice actually persists)
-- ================================================================
alter table public.materials
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null;

create index if not exists idx_materials_vendor on public.materials(vendor_id);

-- Adopt a supplier already implied by past purchases
update public.materials m
set vendor_id = sub.vendor_id
from (
  select distinct on (material_id) material_id, vendor_id
  from public.stock_movements
  where vendor_id is not null and type = 'in'
  order by material_id, created_at desc
) sub
where m.id = sub.material_id
  and m.vendor_id is null;


-- ================================================================
-- 5) REBUILD VENDOR PURCHASES
--    Removes the duplicated auto-generated purchase lines and
--    rebuilds ONE correct purchase per material, valued on the FULL
--    quantity ever bought (so material already used in orders counts).
--    Your PAYMENTS and hand-typed purchases are kept.
-- ================================================================
delete from public.vendor_transactions
where type = 'purchase'
  and (
        notes like 'Purchase:%'
     or notes like 'Reorder:%'
     or notes like '% @ %/%'
  );

insert into public.vendor_transactions (vendor_id, type, amount, notes, brand_id)
select
  m.vendor_id,
  'purchase',
  round(sum(coalesce(sm.total_cost, sm.quantity * m.cost_per_unit))::numeric, 2),
  m.name || ' — ' || sum(sm.quantity) || ' ' || m.unit || ' @ ' || m.cost_per_unit || '/' || m.unit,
  m.brand_id
from public.materials m
join public.stock_movements sm
  on sm.material_id = m.id and sm.type = 'in'
where m.vendor_id is not null
group by m.id, m.vendor_id, m.name, m.unit, m.cost_per_unit, m.brand_id
having sum(coalesce(sm.total_cost, sm.quantity * m.cost_per_unit)) > 0;

-- Recompute every vendor balance from the remaining transactions
update public.vendors v
set balance = coalesce((
      select sum(case when t.type = 'purchase' then t.amount else -t.amount end)
      from public.vendor_transactions t
      where t.vendor_id = v.id
    ), 0),
    updated_at = now();


notify pgrst, 'reload schema';
-- ================================================================
-- DONE. Hard-refresh the app (Ctrl+Shift+R), then take a fresh Backup.
-- ================================================================


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

-- Backfill: create the missing revenue for past manual sales.
-- Detects whichever date column the sales table actually uses.
DO $outer$
DECLARE
  datecol text;
BEGIN
  SELECT column_name INTO datecol
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'sales'
    AND column_name IN ('date', 'sale_date', 'invoice_date', 'created_at')
  ORDER BY CASE column_name
             WHEN 'date' THEN 1
             WHEN 'sale_date' THEN 2
             WHEN 'invoice_date' THEN 3
             ELSE 4
           END
  LIMIT 1;

  IF datecol IS NULL THEN
    RAISE EXCEPTION 'No usable date column found on public.sales';
  END IF;

  RAISE NOTICE 'Using sales date column: %', datecol;

  EXECUTE format($f$
    INSERT INTO public.revenue (date, type, amount, description, sale_id, brand_id)
    SELECT s.%I::date, 'sales', s.total_amount,
           'Invoice ' || s.invoice_number, s.id, s.brand_id
    FROM public.sales s
    WHERE s.order_id IS NULL
      AND s.total_amount > 0
      AND NOT EXISTS (SELECT 1 FROM public.revenue r WHERE r.sale_id = s.id)
  $f$, datecol);
END $outer$;

notify pgrst, 'reload schema';
-- Done. Dashboard / Finance / Reports profit now includes sales.