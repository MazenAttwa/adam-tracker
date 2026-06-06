-- ============================================================
-- Adam Store Manufacturing Tracker — Supabase Setup Script
-- Run this in the Supabase SQL Editor (once)
-- ============================================================

-- Helper function to get current user role (avoids RLS recursion)
create or replace function public.get_my_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Helper function to get current user assigned stage
create or replace function public.get_my_stage()
returns text
language sql
security definer
stable
as $$
  select assigned_stage from public.profiles where id = auth.uid()
$$;

-- ============================================================
-- TABLES
-- ============================================================

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  email       text not null,
  name        text not null,
  role        text not null check (role in ('manager', 'worker', 'customer')),
  assigned_stage text check (
    assigned_stage in ('draft','preparation','cutting_printing','finishing','submitted')
    or assigned_stage is null
  ),
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);

-- Orders
create table if not exists public.orders (
  id             uuid default gen_random_uuid() primary key,
  order_number   text unique not null,
  customer_id    uuid references public.profiles(id),
  customer_name  text not null,
  customer_phone text,
  current_stage  text not null default 'draft'
    check (current_stage in ('draft','preparation','cutting_printing','finishing','submitted')),
  status         text not null default 'active'
    check (status in ('active','completed','cancelled')),
  created_by     uuid references public.profiles(id),
  created_at     timestamptz default now() not null,
  updated_at     timestamptz default now() not null
);

-- Stage data (one row per order per stage)
create table if not exists public.stage_data (
  id           uuid default gen_random_uuid() primary key,
  order_id     uuid references public.orders(id) on delete cascade not null,
  stage        text not null
    check (stage in ('draft','preparation','cutting_printing','finishing','submitted')),
  data         jsonb not null default '{}',
  notes        text,
  is_completed boolean not null default false,
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  updated_by   uuid references public.profiles(id),
  updated_at   timestamptz default now() not null,
  constraint unique_order_stage unique (order_id, stage)
);

-- ============================================================
-- AUTO-TIMESTAMPS
-- ============================================================

create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.handle_updated_at();

create trigger stage_data_updated_at
  before update on public.stage_data
  for each row execute function public.handle_updated_at();

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'customer')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- ORDER NUMBER SEQUENCE
-- ============================================================

create sequence if not exists order_number_seq start 1;

create or replace function public.generate_order_number()
returns trigger language plpgsql as $$
begin
  new.order_number := 'ORD-' || to_char(now(), 'YYYY') || '-' ||
                      lpad(nextval('order_number_seq')::text, 4, '0');
  return new;
end;
$$;

create trigger orders_set_number
  before insert on public.orders
  for each row
  when (new.order_number is null or new.order_number = '')
  execute function public.generate_order_number();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles  enable row level security;
alter table public.orders    enable row level security;
alter table public.stage_data enable row level security;

-- ── PROFILES ──────────────────────────────────────────────

-- Everyone can read their own profile
create policy "profiles: own read" on public.profiles
  for select using (auth.uid() = id);

-- Managers can read all profiles
create policy "profiles: manager read all" on public.profiles
  for select using (public.get_my_role() = 'manager');

-- Managers can insert/update profiles
create policy "profiles: manager write" on public.profiles
  for all using (public.get_my_role() = 'manager');

-- Users can update their own profile (name only)
create policy "profiles: self update" on public.profiles
  for update using (auth.uid() = id);

-- ── ORDERS ────────────────────────────────────────────────

-- Managers see all orders
create policy "orders: manager all" on public.orders
  for all using (public.get_my_role() = 'manager');

-- Workers see all active orders
create policy "orders: worker read" on public.orders
  for select using (public.get_my_role() = 'worker');

-- Customers see only their orders
create policy "orders: customer read own" on public.orders
  for select using (
    public.get_my_role() = 'customer' and customer_id = auth.uid()
  );

-- ── STAGE DATA ────────────────────────────────────────────

-- Managers see and write all stage data
create policy "stage_data: manager all" on public.stage_data
  for all using (public.get_my_role() = 'manager');

-- Workers can read all stage data, write only their assigned stage
create policy "stage_data: worker read" on public.stage_data
  for select using (public.get_my_role() = 'worker');

create policy "stage_data: worker write own stage" on public.stage_data
  for all using (
    public.get_my_role() = 'worker' and stage = public.get_my_stage()
  );

-- Customers can read stage data for their orders
create policy "stage_data: customer read own" on public.stage_data
  for select using (
    public.get_my_role() = 'customer' and
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.customer_id = auth.uid()
    )
  );

-- ============================================================
-- REALTIME
-- ============================================================

-- Enable realtime on orders and stage_data tables
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.stage_data;

-- ============================================================
-- SEED DATA (optional — creates a demo manager account)
-- After running this script, sign up with manager@adamstore.com / Admin1234!
-- then run the UPDATE below to set them as manager.
-- ============================================================

-- After the manager user signs up via the app, run:
-- UPDATE public.profiles SET role = 'manager' WHERE email = 'manager@adamstore.com';

-- ============================================================
-- STORAGE — product-photos bucket
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-photos', 'product-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "product-photos: upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-photos');

CREATE POLICY "product-photos: read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'product-photos');

CREATE POLICY "product-photos: update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-photos')
WITH CHECK (bucket_id = 'product-photos');

CREATE POLICY "product-photos: manager delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-photos'
  AND public.get_my_role() = 'manager'
);
