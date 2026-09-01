begin;

revoke all on function public.inventory_post_movement(uuid, uuid, uuid, text, numeric, text, uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.inventory_post_movement(uuid, uuid, uuid, text, numeric, text, uuid, numeric, text)
  to service_role;

create or replace function public.inventory_adjust_stock(
  organization_id uuid,
  warehouse_id uuid,
  product_id uuid,
  adjustment_type text,
  quantity numeric,
  unit_cost numeric default null,
  notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_type text := lower(trim(adjustment_type));
  movement_quantity numeric;
begin
  if auth.uid() is null or not public.erp_can_manage_org(organization_id) then
    raise exception 'INVENTORY_ACCESS_DENIED';
  end if;

  if normalized_type not in ('opening_balance', 'adjustment_in', 'adjustment_out') then
    raise exception 'INVENTORY_INVALID_ADJUSTMENT_TYPE';
  end if;

  if quantity is null or quantity <= 0 or quantity > 999999999 then
    raise exception 'INVENTORY_INVALID_QUANTITY';
  end if;

  if unit_cost is not null and (unit_cost < 0 or unit_cost > 999999999999) then
    raise exception 'INVENTORY_INVALID_UNIT_COST';
  end if;

  if notes is not null and length(notes) > 1000 then
    raise exception 'INVENTORY_NOTES_TOO_LONG';
  end if;

  movement_quantity := case when normalized_type = 'adjustment_out' then -quantity else quantity end;

  return public.inventory_post_movement(
    organization_id,
    warehouse_id,
    product_id,
    normalized_type,
    movement_quantity,
    'manual_adjustment',
    null,
    unit_cost,
    nullif(trim(notes), '')
  );
end;
$$;

revoke all on function public.inventory_adjust_stock(uuid, uuid, uuid, text, numeric, numeric, text)
  from public, anon;
grant execute on function public.inventory_adjust_stock(uuid, uuid, uuid, text, numeric, numeric, text)
  to authenticated, service_role;

comment on function public.inventory_adjust_stock(uuid, uuid, uuid, text, numeric, numeric, text)
  is 'Public inventory adjustment boundary. Requires an active admin or manager membership and delegates ledger updates to inventory_post_movement.';

commit;
