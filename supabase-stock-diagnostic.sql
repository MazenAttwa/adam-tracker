-- ============================================================
-- ADAM STORE — STOCK DIAGNOSTIC + REPAIR
--
-- Recomputes every material's true stock from its movement ledger
-- (in = +, everything else = -), shows the negatives and which
-- orders over-deducted, then syncs materials.current_quantity to match.
--
-- Run in Supabase -> SQL Editor. Backup first (Backup page).
-- Run PART A to LOOK. Run PART B to FIX.
-- ============================================================


-- ========== PART A — LOOK (read-only, run this first) ==========

-- A1. Every material's ledger stock vs the stored field. Negatives on top.
select
  m.name,
  m.code,
  m.unit,
  coalesce(sum(case when sm.type = 'in' then sm.quantity else -sm.quantity end), 0) as ledger_stock,
  m.current_quantity as stored_field
from public.materials m
left join public.stock_movements sm on sm.material_id = m.id
group by m.id, m.name, m.code, m.unit, m.current_quantity
order by ledger_stock asc;

-- A2. Which orders over-deducted (big 'out' movements) — helps spot the typo.
--     Shows out-movements bigger than 100 units, newest first.
select
  o.order_number,
  m.name as material,
  sm.quantity,
  sm.type,
  sm.notes,
  sm.created_at
from public.stock_movements sm
join public.materials m on m.id = sm.material_id
left join public.orders o on o.id = sm.order_id
where sm.type <> 'in' and sm.quantity > 100
order by sm.quantity desc, sm.created_at desc;


-- ========== PART B — FIX (writes) ==========
-- Uncomment the block below (remove the /* and */) ONLY after you've
-- looked at PART A and are happy. It sets each material's current_quantity
-- to its true ledger value. It does NOT delete any movement — it just
-- makes the stored number honest.

/*
update public.materials m
set current_quantity = coalesce((
      select sum(case when sm.type = 'in' then sm.quantity else -sm.quantity end)
      from public.stock_movements sm
      where sm.material_id = m.id
    ), 0),
    updated_at = now();

notify pgrst, 'reload schema';
*/

-- NOTE: PART B makes the STORED field match the LEDGER. If the ledger itself
-- is wrong (because a typo like 546 instead of 54.6 was deducted), the ledger
-- still holds that bad -546. The cleanest correction for those is in the app:
-- open the order -> Preparation -> re-enter the correct quantity (the new code
-- returns the over-deducted stock), OR use Stock page -> Adjust to set the real
-- physical count. Use PART B to clean up the stored field afterwards.
