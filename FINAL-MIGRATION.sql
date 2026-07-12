-- ================================================================
-- ADAM STORE — FINAL MIGRATION (run this whole file once)
-- Correct dependency order. Safe to re-run.
--
--  0. sales.date        -> restores the missing column (sales were failing!)
--  1. Brand safeguard   -> un-hides missing orders/stock, prevents recurrence
--  2. manufacturer_payments table
--  3. retailer_payments table
--  4. materials.vendor_id -> supplier choice persists
--  5. revenue.sale_id   -> links a sale to its revenue
--  6. Rebuild vendor purchases (removes duplicates, counts used material)
--  7. Backfill sales revenue (fixes the P&L)
-- ================================================================


-- ========== 0) SALES.DATE (must come first) ==========
alter table public.sales add column if not exists date date;
update public.sales set date = created_at::date where date is null;
alter table public.sales alter column date set default current_date;
alter table public.sales alter column date set not null;
create index if not exists idx_sales_date on public.sales(date);


-- ========== 1) BRAND SAFEGUARD ==========
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


-- ========== 2) MANUFACTURER PAYMENTS ==========
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


-- ========== 3) RETAILER PAYMENTS ==========
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


-- ========== 4) MATERIAL SUPPLIER ==========
alter table public.materials
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null;
create index if not exists idx_materials_vendor on public.materials(vendor_id);

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


-- ========== 5) REVENUE.SALE_ID ==========
alter table public.revenue
  add column if not exists sale_id uuid references public.sales(id) on delete cascade;
create index if not exists idx_revenue_sale on public.revenue(sale_id);


-- ========== 6) REBUILD VENDOR PURCHASES ==========
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
  m.name || ' - ' || sum(sm.quantity) || ' ' || m.unit || ' @ ' || m.cost_per_unit || '/' || m.unit,
  m.brand_id
from public.materials m
join public.stock_movements sm
  on sm.material_id = m.id and sm.type = 'in'
where m.vendor_id is not null
group by m.id, m.vendor_id, m.name, m.unit, m.cost_per_unit, m.brand_id
having sum(coalesce(sm.total_cost, sm.quantity * m.cost_per_unit)) > 0;

update public.vendors v
set balance = coalesce((
      select sum(case when t.type = 'purchase' then t.amount else -t.amount end)
      from public.vendor_transactions t
      where t.vendor_id = v.id
    ), 0),
    updated_at = now();


-- ========== 7) SALES -> REVENUE (P&L fix) ==========
insert into public.revenue (date, type, amount, description, sale_id, brand_id)
select s.date, 'sales', s.total_amount, 'Invoice ' || s.invoice_number, s.id, s.brand_id
from public.sales s
where s.order_id is null
  and s.total_amount > 0
  and not exists (select 1 from public.revenue r where r.sale_id = s.id);


notify pgrst, 'reload schema';
-- ================================================================
-- DONE. Hard-refresh the app (Ctrl+Shift+R), then take a fresh Backup.
-- ================================================================
