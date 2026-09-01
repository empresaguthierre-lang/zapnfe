begin;

drop function if exists public.inventory_reallocate_reservation(uuid, uuid, numeric, text);

create or replace function public.inventory_reallocate_reservation(
  source_reservation_id uuid,
  target_order_item_id uuid,
  reallocate_quantity numeric,
  reallocation_reason text,
  source_priority numeric default null,
  target_priority numeric default null,
  policy_snapshot jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_res public.stock_reservations%rowtype;
  v_source_item public.order_items%rowtype;
  v_source_order public.orders%rowtype;

  v_target_item public.order_items%rowtype;
  v_target_order public.orders%rowtype;
  v_target_res public.stock_reservations%rowtype;

  v_user_id uuid;
  v_new_target_res_id uuid;
  v_target_qty_before numeric := 0;
  v_target_qty_after numeric := 0;

  v_source_order_status public.order_stock_status;
  v_target_order_status public.order_stock_status;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if reallocate_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;
  if length(trim(coalesce(reallocation_reason, ''))) < 5 then raise exception 'REASON_TOO_SHORT'; end if;

  -- lock source reservation
  select * into v_source_res from public.stock_reservations where id = source_reservation_id and status = 'active' for update;
  if not found then raise exception 'SOURCE_RESERVATION_NOT_FOUND_OR_INACTIVE'; end if;
  if not public.is_organization_member(v_source_res.organization_id) then raise exception 'ACCESS_DENIED'; end if;
  if reallocate_quantity > v_source_res.quantity then raise exception 'QUANTITY_EXCEEDS_RESERVATION'; end if;

  select * into v_source_item from public.order_items where id = v_source_res.source_id for update;
  select * into v_source_order from public.orders where id = v_source_item.order_id for update;

  -- lock target item and order
  select * into v_target_item from public.order_items where id = target_order_item_id for update;
  if not found then raise exception 'TARGET_ITEM_NOT_FOUND'; end if;
  if v_target_item.product_id != v_source_res.product_id then raise exception 'PRODUCT_MISMATCH'; end if;

  select * into v_target_order from public.orders where id = v_target_item.order_id for update;
  if v_target_order.organization_id != v_source_res.organization_id then raise exception 'ORGANIZATION_MISMATCH'; end if;
  if v_target_order.status not in ('review', 'approved') then raise exception 'TARGET_ORDER_LOCKED'; end if;

  -- find existing target reservation if any
  select * into v_target_res from public.stock_reservations
  where source_type = 'order_item' and source_id = target_order_item_id and status = 'active' for update;

  if found then
    v_target_qty_before := v_target_res.quantity;
    v_new_target_res_id := v_target_res.id;
  end if;

  if v_target_qty_before + reallocate_quantity > v_target_item.quantity then
    raise exception 'REALLOCATION_EXCEEDS_TARGET_NEEDS';
  end if;

  if v_source_res.quantity = reallocate_quantity then
    update public.stock_reservations set status = 'released', updated_at = now() where id = source_reservation_id;
  else
    update public.stock_reservations set quantity = quantity - reallocate_quantity, updated_at = now() where id = source_reservation_id;
  end if;

  if found then
    update public.stock_reservations set quantity = quantity + reallocate_quantity, updated_at = now() where id = v_new_target_res_id;
    v_target_qty_after := v_target_qty_before + reallocate_quantity;
  else
    insert into public.stock_reservations (
      organization_id, warehouse_id, product_id, source_type, source_id, quantity, status
    ) values (
      v_source_res.organization_id, v_source_res.warehouse_id, v_source_res.product_id, 'order_item', target_order_item_id, reallocate_quantity, 'active'
    ) returning id into v_new_target_res_id;
    v_target_qty_after := reallocate_quantity;
  end if;

  if (select coalesce(sum(r.quantity), 0) from public.stock_reservations r join public.order_items i on i.id = r.source_id where i.order_id = v_source_order.id and r.status = 'active') = 0 then
    v_source_order_status := 'unreserved';
  elsif (select count(*) from public.order_items i left join public.stock_reservations r on r.source_id = i.id and r.status = 'active' and r.quantity = i.quantity where i.order_id = v_source_order.id and r.id is null) > 0 then
    v_source_order_status := 'partial';
  else
    v_source_order_status := 'reserved';
  end if;
  update public.orders set stock_status = v_source_order_status where id = v_source_order.id;

  if (select coalesce(sum(r.quantity), 0) from public.stock_reservations r join public.order_items i on i.id = r.source_id where i.order_id = v_target_order.id and r.status = 'active') = 0 then
    v_target_order_status := 'unreserved';
  elsif (select count(*) from public.order_items i left join public.stock_reservations r on r.source_id = i.id and r.status = 'active' and r.quantity = i.quantity where i.order_id = v_target_order.id and r.id is null) > 0 then
    v_target_order_status := 'partial';
  else
    v_target_order_status := 'reserved';
  end if;
  update public.orders set stock_status = v_target_order_status where id = v_target_order.id;

  insert into public.stock_reservation_audits (
    organization_id, product_id, warehouse_id,
    source_reservation_id, source_order_id, source_order_item_id, source_customer_id,
    target_reservation_id, target_order_id, target_order_item_id, target_customer_id,
    quantity,
    source_quantity_before, source_quantity_after,
    target_quantity_before, target_quantity_after,
    reason, created_by,
    source_priority_score, target_priority_score, priority_policy_snapshot
  ) values (
    v_source_res.organization_id, v_source_res.product_id, v_source_res.warehouse_id,
    source_reservation_id, v_source_order.id, v_source_item.id, v_source_order.customer_id,
    v_new_target_res_id, v_target_order.id, v_target_item.id, v_target_order.customer_id,
    reallocate_quantity,
    v_source_res.quantity, v_source_res.quantity - reallocate_quantity,
    v_target_qty_before, v_target_qty_after,
    trim(reallocation_reason), v_user_id,
    source_priority, target_priority, policy_snapshot
  );

  insert into public.business_events (
    organization_id, event_type, entity_type, entity_id, actor_id, payload
  ) values (
    v_source_res.organization_id,
    'inventory.reservation_reallocated',
    'stock_reservation',
    source_reservation_id,
    v_user_id,
    jsonb_build_object(
      'product_id', v_source_res.product_id,
      'quantity', reallocate_quantity,
      'from_order_id', v_source_order.id,
      'to_order_id', v_target_order.id,
      'reason', trim(reallocation_reason)
    )
  );
end;
$$;
revoke all on function public.inventory_reallocate_reservation(uuid, uuid, numeric, text, numeric, numeric, jsonb) from public, anon;
grant execute on function public.inventory_reallocate_reservation(uuid, uuid, numeric, text, numeric, numeric, jsonb) to authenticated, service_role;

commit;
