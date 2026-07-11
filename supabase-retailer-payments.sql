-- ============================================================
-- ADAM STORE — RETAILER PAYMENTS (money received from retailers)
-- Retailers owe us from sales; this records what they've paid,
-- so we can track owed vs received vs remaining. Run in Supabase.
-- ============================================================
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
  using (brand_id = public.current_brand()) with check (brand_id = public.current_brand());

drop trigger if exists trg_set_brand on public.retailer_payments;
create trigger trg_set_brand before insert on public.retailer_payments
  for each row execute function public.set_brand_id();

notify pgrst, 'reload schema';
-- Done.
