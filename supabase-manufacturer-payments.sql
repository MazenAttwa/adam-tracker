-- ============================================================
-- ADAM STORE — MANUFACTURER PAYMENTS (accounts payable)
-- Records money paid to a manufacturer so we can track
-- owed vs paid vs remaining. Run in Supabase -> SQL Editor.
-- ============================================================
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

-- Brand isolation (same model as every other table)
alter table public.manufacturer_payments enable row level security;
drop policy if exists brand_isolation on public.manufacturer_payments;
create policy brand_isolation on public.manufacturer_payments
  using (brand_id = public.current_brand())
  with check (brand_id = public.current_brand());

-- Auto-tag the brand on insert
drop trigger if exists trg_set_brand on public.manufacturer_payments;
create trigger trg_set_brand before insert on public.manufacturer_payments
  for each row execute function public.set_brand_id();

notify pgrst, 'reload schema';
-- Done.
