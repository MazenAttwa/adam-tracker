-- ============================================================
-- ADAM STORE — REBUILD VENDOR PURCHASES (fixes duplicates + counts used material)
--
-- What it does:
--   1. Deletes the auto-generated purchase lines (the duplicates).
--      -> Your PAYMENTS are kept. Manually-typed purchases are kept.
--   2. Rebuilds ONE correct purchase per material that has a supplier,
--      valued from the FULL purchased quantity (including material
--      already consumed by orders).
--   3. Recomputes every vendor balance from the remaining transactions.
--
-- Run in Supabase -> SQL Editor. Safe to re-run (it always rebuilds clean).
-- TIP: take a Backup (Backup page) first if you want a safety net.
-- ============================================================

-- ---------- PREVIEW (optional): what will be rebuilt ----------
-- select m.name, v.name as vendor, sum(sm.quantity) as total_qty, m.unit,
--        round(sum(coalesce(sm.total_cost, sm.quantity * m.cost_per_unit))::numeric, 2) as amount
-- from public.materials m
-- join public.vendors v on v.id = m.vendor_id
-- join public.stock_movements sm on sm.material_id = m.id and sm.type = 'in'
-- where m.vendor_id is not null
-- group by m.id, m.name, v.name, m.unit, m.cost_per_unit
-- order by v.name, m.name;

begin;

-- 1) Remove ONLY the auto-generated purchase lines (duplicates live here).
--    Payments and any purchase you typed yourself are left untouched.
delete from public.vendor_transactions
where type = 'purchase'
  and (
        notes like 'Purchase:%'
     or notes like 'Reorder:%'
     or notes like '% @ %/%'
  );

-- 2) Rebuild one clean purchase per material that has a supplier.
--    Amount = every 'in' movement ever (so material already used in
--    orders IS counted), priced by its recorded cost or cost/unit.
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

-- 3) Recompute every vendor balance from what's left.
update public.vendors v
set balance = coalesce((
      select sum(case when t.type = 'purchase' then t.amount else -t.amount end)
      from public.vendor_transactions t
      where t.vendor_id = v.id
    ), 0),
    updated_at = now();

commit;

notify pgrst, 'reload schema';
-- Done. Refresh the Vendors page.
