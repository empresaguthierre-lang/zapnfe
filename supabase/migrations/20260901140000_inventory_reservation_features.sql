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

-- Function to atomically approve order and reserve stock
create or replace function public.approve_order_and_reserve_stock(order_id_param uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_record public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_available numeric;
  v_warehouse_id uuid;
  v_user_id uuid;
  v_track_stock boolean;
begin
  -- 1. Get the current user
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- 2. Lock the order row (atomic)
  select * into v_order_record
  from public.orders
  where id = order_id_param
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  -- 3. Validate status
  if v_order_record.status = 'approved' then
    raise exception 'ORDER_ALREADY_APPROVED';
  end if;

  if v_order_record.status != 'reviewed' then
    raise exception 'ORDER_MUST_BE_REVIEWED';
  end if;

  -- Get default warehouse for the organization (assuming the first active one)
  select id into v_warehouse_id
  from public.warehouses
  where organization_id = v_order_record.organization_id and active = true
  order by name asc
  limit 1;

  if v_warehouse_id is null then
    raise exception 'NO_ACTIVE_WAREHOUSE';
  end if;

  -- 4. Process items
  for v_item in
    select * from public.order_items where order_id = order_id_param
  loop
    -- Only reserve if the product tracks stock
    select track_stock into v_track_stock from public.products where id = v_item.product_id;

    if v_track_stock = true then

      -- Check availability
      select quantity_available into v_available
      from public.inventory_overview
      where product_id = v_item.product_id and organization_id = v_order_record.organization_id;

      if v_available is null or v_available < v_item.quantity then
        raise exception 'INSUFFICIENT_STOCK_FOR_PRODUCT:%', v_item.product_id;
      end if;

      -- Check for existing reservation (idempotency)
      if exists (
        select 1 from public.stock_reservations
        where source_type = 'order_item' and source_id = v_item.id and status = 'active'
      ) then
        raise exception 'RESERVATION_ALREADY_EXISTS_FOR_ITEM:%', v_item.id;
      end if;

      -- Create reservation
      insert into public.stock_reservations (
        organization_id, warehouse_id, product_id, source_type, source_id, quantity, status
      ) values (
        v_order_record.organization_id, v_warehouse_id, v_item.product_id, 'order_item', v_item.id, v_item.quantity, 'active'
      );

    end if;
  end loop;

  -- 5. Update order status
  update public.orders
  set status = 'approved',
      approved_at = now(),
      approved_by = v_user_id
  where id = order_id_param;

  -- 6. Log business event
  insert into public.business_events (
    organization_id, event_type, entity_type, entity_id, actor_id, payload
  ) values (
    v_order_record.organization_id,
    'order.approved',
    'order',
    order_id_param,
    v_user_id,
    jsonb_build_object('order_number', v_order_record.number)
  );
end;
$$;

revoke all on function public.approve_order_and_reserve_stock(uuid) from public, anon;
grant execute on function public.approve_order_and_reserve_stock(uuid) to authenticated, service_role;

-- Function to atomically cancel order and release stock
create or replace function public.cancel_order_and_release_stock(order_id_param uuid)
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

  select * into v_order_record
  from public.orders
  where id = order_id_param
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_order_record.status = 'cancelled' then
    raise exception 'ORDER_ALREADY_CANCELLED';
  end if;

  -- Release reservations (mark as released, do not delete)
  update public.stock_reservations
  set status = 'released', updated_at = now()
  where source_type = 'order_item'
    and status = 'active'
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

revoke all on function public.cancel_order_and_release_stock(uuid) from public, anon;
grant execute on function public.cancel_order_and_release_stock(uuid) to authenticated, service_role;

commit;
