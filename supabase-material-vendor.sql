-- ============================================================
-- ADAM STORE — MATERIAL SUPPLIER
-- Stores the supplying vendor directly on the material, so the
-- choice always persists (independent of purchase movements).
-- Run in Supabase -> SQL Editor.
-- ============================================================
alter table public.materials
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null;

create index if not exists idx_materials_vendor on public.materials(vendor_id);

-- Backfill: if a material's purchases already point at a vendor, adopt it.
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

notify pgrst, 'reload schema';
-- Done.
