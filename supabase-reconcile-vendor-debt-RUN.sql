-- ============================================================
-- ADAM STORE — RECONCILE VENDOR DEBT TO MATERIALS SUPPLIED
--
-- Purpose: make each vendor's recorded debt equal the FULL value of
-- the materials they supplied (you buy on credit, so every purchase
-- is owed). Uses the SAME valuation the app shows in "Materials
-- Supplied": total_cost when recorded, else quantity x cost_per_unit.
--
-- It rebuilds ONLY the auto-generated purchase lines. Your PAYMENTS
-- and any hand-typed purchase notes are kept. Then it recomputes the
-- balance from what remains.
--
-- Run in Supabase -> SQL Editor. Backup first (Backup page).
--
-- ---- PART A: PREVIEW (read-only). Run this first. ----
-- Shows, per vendor: materials-supplied value vs current recorded debt.
select
  v.name as vendor,
  round(coalesce(sum(coalesce(sm.total_cost, sm.quantity * m.cost_per_unit)), 0)::numeric, 2) as materials_supplied_value,
  round(coalesce((
    select sum(case when t.type = 'purchase' then t.amount else 0 end)
    from public.vendor_transactions t where t.vendor_id = v.id
  ), 0)::numeric, 2) as recorded_purchase_debt,
  round(coalesce((
    select sum(case when t.type = 'payment' then t.amount else 0 end)
    from public.vendor_transactions t where t.vendor_id = v.id
  ), 0)::numeric, 2) as payments
from public.vendors v
left join public.materials m on m.vendor_id = v.id
left join public.stock_movements sm on sm.material_id = m.id and sm.type = 'in'
group by v.id, v.name
order by materials_supplied_value desc;


-- ============================================================
-- ---- PART B: FIX (writes). Uncomment (remove /* and */) to run. ----
-- Rebuilds auto-generated purchase lines so recorded debt == materials
-- supplied, keeps payments, recomputes balances.
-- ============================================================
begin;

-- 1) Remove ONLY the auto-generated purchase lines (safe to rebuild).
--    Hand-typed purchases and all payments are untouched.
delete from public.vendor_transactions
where type = 'purchase'
  and (
        notes like 'Purchase:%'
     or notes like 'Reorder:%'
     or notes like '% @ %/%'
     or notes like '%(linked to supplier)%'
  );

-- 2) Rebuild ONE purchase line per material, valued exactly like the app's
--    "Materials Supplied" total (total_cost when present, else qty*cost/unit).
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

-- 3) Recompute every vendor balance from what remains (purchases - payments).
update public.vendors v
set balance = coalesce((
      select sum(case when t.type = 'purchase' then t.amount else -t.amount end)
      from public.vendor_transactions t
      where t.vendor_id = v.id
    ), 0),
    updated_at = now();

commit;
notify pgrst, 'reload schema';
-- Done. After PART B, refresh Vendors: debt == materials supplied.
