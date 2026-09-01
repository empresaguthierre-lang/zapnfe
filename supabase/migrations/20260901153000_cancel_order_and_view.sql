begin;

-- Create a view for reservation details (Fixed schema)
create or replace view public.inventory_reservation_details as
select
  r.id as reservation_id,
  r.organization_id,
  r.product_id,
  r.warehouse_id,
  r.source_type,
  r.source_id,
  r.quantity,
  r.status as reservation_status,
  r.created_at as reserved_at,
  o.id as order_id,
  o.number as order_number,
  o.status as order_status,
  o.total as order_total,
  o.created_at as order_date,
  c.name as customer_name
from public.stock_reservations r
left join public.order_items oi on oi.id = r.source_id and r.source_type = 'order_item'
left join public.orders o on o.id = oi.order_id
left join public.customers c on c.id = o.customer_id
where r.status = 'active';

grant select on public.inventory_reservation_details to authenticated;

-- Function to atomically cancel order and release stock
create or replace function public.cancel_order_and_release_stock(
  order_id_param uuid,
  expected_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_record public.orders%rowtype;
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not public.is_organization_member(expected_organization_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  select * into v_order_record
  from public.orders
  where id = order_id_param and organization_id = expected_organization_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_order_record.status = 'cancelled' then
    raise exception 'ORDER_ALREADY_CANCELLED';
  end if;

  if v_order_record.status in ('invoiced', 'completed') then
    raise exception 'ORDER_LOCKED';
  end if;

  -- Release reservations (mark as released, do not delete)
  update public.stock_reservations
  set status = 'released', updated_at = now()
  where source_type = 'order_item'
    and status = 'active'
    and organization_id = expected_organization_id
    and source_id in (select id from public.order_items where order_id = order_id_param);

  -- Update order status
  update public.orders
  set status = 'cancelled'
  where id = order_id_param;

  -- Log business event
  insert into public.business_events (
    organization_id, event_type, entity_type, entity_id, actor_id, payload
  ) values (
    v_order_record.organization_id,
    'order.cancelled',
    'order',
    order_id_param,
    v_user_id,
    jsonb_build_object('order_number', v_order_record.number)
  );
end;
$$;

revoke all on function public.cancel_order_and_release_stock(uuid, uuid) from public, anon;
grant execute on function public.cancel_order_and_release_stock(uuid, uuid) to authenticated, service_role;

commit;
