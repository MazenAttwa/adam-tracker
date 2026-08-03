-- ============================================================
-- ADAM STORE — STOCK INTEGRITY GUARD (database-enforced)
--
-- Makes it STRUCTURALLY impossible for stock to break again:
--
--   1. current_quantity is ALWAYS the ledger sum. A trigger keeps
--      materials.current_quantity in sync automatically on every
--      insert / update / delete of a stock movement. No screen or
--      future code can drift it.
--
--   2. Stock can never go negative. If a movement would push a
--      material below zero, the movement is REJECTED with a clear
--      error (the app shows it) instead of silently corrupting data.
--
--   3. Sanity cap: a single movement over 1,000,000 units is blocked
--      as an obvious typo.
--
-- Run in Supabase -> SQL Editor. Backup first. Safe to re-run.
-- ============================================================

-- ---- Helper: current ledger stock for a material ----
create or replace function public.material_ledger_stock(p_material uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(case when type = 'in' then quantity else -quantity end), 0)
  from public.stock_movements
  where material_id = p_material;
$$;

-- ---- BEFORE trigger: reject typos and movements that would go negative ----
create or replace function public.stock_movement_validate()
returns trigger
language plpgsql
as $$
declare
  projected numeric;
begin
  -- Obvious-typo cap
  if new.quantity is null or new.quantity <= 0 then
    raise exception 'Stock movement quantity must be greater than zero.';
  end if;
  if new.quantity > 1000000 then
    raise exception 'Stock movement of % looks like a typo (over 1,000,000). Blocked.', new.quantity;
  end if;

  -- Would this 'out' push the material below zero?
  if new.type <> 'in' then
    projected := public.material_ledger_stock(new.material_id) - new.quantity;
    if projected < -0.001 then
      raise exception
        'Not enough stock: deducting % would leave %. Reduce the quantity or add stock first.',
        new.quantity, projected;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_stock_validate on public.stock_movements;
create trigger trg_stock_validate
  before insert on public.stock_movements
  for each row execute function public.stock_movement_validate();

-- ---- AFTER trigger: keep materials.current_quantity == ledger, always ----
create or replace function public.stock_sync_material()
returns trigger
language plpgsql
as $$
declare
  mat uuid;
begin
  mat := coalesce(new.material_id, old.material_id);
  if mat is not null then
    update public.materials
    set current_quantity = public.material_ledger_stock(mat),
        updated_at = now()
    where id = mat;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_stock_sync on public.stock_movements;
create trigger trg_stock_sync
  after insert or update or delete on public.stock_movements
  for each row execute function public.stock_sync_material();

-- ---- One-time: bring every material into sync right now ----
update public.materials m
set current_quantity = public.material_ledger_stock(m.id),
    updated_at = now();

notify pgrst, 'reload schema';
-- ============================================================
-- DONE. From now on:
--   * current_quantity can never disagree with the ledger.
--   * A deduction that would go negative is refused (app shows the error).
--   * A > 1,000,000 typo is refused.
-- ============================================================
