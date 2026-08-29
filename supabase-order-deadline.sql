-- ============================================================
-- ADAM STORE — ORDER DEADLINES (overdue tracking)
--
-- The deadline is buried inside the Draft stage's JSON, so it can't
-- be listed or sorted across orders. This promotes it to a real
-- column on `orders`, backfills from existing Draft data, and keeps
-- it in sync automatically whenever the Draft stage is saved.
--
-- Run in Supabase -> SQL Editor. Safe to re-run.
-- ============================================================

alter table public.orders add column if not exists deadline date;
create index if not exists idx_orders_deadline on public.orders(deadline);

-- Backfill from the Draft stage data (only valid, non-empty dates)
update public.orders o
set deadline = (sd.data->>'deadline')::date
from public.stage_data sd
where sd.order_id = o.id
  and sd.stage = 'draft'
  and coalesce(sd.data->>'deadline', '') <> ''
  and (sd.data->>'deadline') ~ '^\d{4}-\d{2}-\d{2}$'
  and o.deadline is distinct from (sd.data->>'deadline')::date;

-- Keep orders.deadline in sync when the Draft stage is saved
create or replace function public.sync_order_deadline()
returns trigger
language plpgsql
as $$
declare
  d text;
begin
  if new.stage = 'draft' then
    d := new.data->>'deadline';
    if d is not null and d ~ '^\d{4}-\d{2}-\d{2}$' then
      update public.orders set deadline = d::date where id = new.order_id;
    elsif d is null or d = '' then
      update public.orders set deadline = null where id = new.order_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_order_deadline on public.stage_data;
create trigger trg_sync_order_deadline
  after insert or update on public.stage_data
  for each row execute function public.sync_order_deadline();

notify pgrst, 'reload schema';
-- Done. orders.deadline is now a real, sortable field kept in sync.
