-- ============================================================
-- Migration 002 — Run in Supabase SQL Editor
-- Adds the order_photos table for product photo uploads
-- ============================================================

-- ── TABLE: order_photos ───────────────────────────────────

create table if not exists public.order_photos (
  id           uuid default gen_random_uuid() primary key,
  order_id     uuid references public.orders(id) on delete cascade not null,
  file_path    text not null,
  file_name    text not null,
  uploaded_by  uuid references public.profiles(id),
  uploaded_at  timestamptz default now() not null
);

alter table public.order_photos enable row level security;

-- Managers can do everything
create policy "order_photos: manager all" on public.order_photos
  for all using (public.get_my_role() = 'manager');

-- Workers can read all photos
create policy "order_photos: worker read" on public.order_photos
  for select using (public.get_my_role() = 'worker');

-- Workers can insert new photos
create policy "order_photos: worker insert" on public.order_photos
  for insert with check (public.get_my_role() = 'worker');

-- Workers can delete photos they uploaded
create policy "order_photos: worker delete own" on public.order_photos
  for delete using (
    public.get_my_role() = 'worker' and uploaded_by = auth.uid()
  );

-- Customers can read photos for their own orders
create policy "order_photos: customer read own" on public.order_photos
  for select using (
    public.get_my_role() = 'customer' and
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.customer_id = auth.uid()
    )
  );

-- ── STORAGE: allow photo uploader to delete their own photos ─

-- Allows workers (and others) to delete photos they uploaded.
-- The existing "product-photos: manager delete" policy already
-- covers manager-initiated deletes.
create policy "product-photos: owner delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'product-photos'
  and owner = auth.uid()
);
