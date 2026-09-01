begin;
create or replace function public.save_order_review(
  target_order_id uuid,
  expected_organization_id uuid,
  expected_order_updated_at timestamptz,
  review_items jsonb,
  review_discount numeric,
  review_freight numeric,
  review_notes text,
  mark_approved boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders;
  target_item public.order_items;
  resolved_product public.products;
  item jsonb;
  candidate_product_id text;
  candidate_product_uuid uuid;
  item_quantity numeric;
  item_price numeric;
  confirmed boolean;
  existing_count integer;
  submitted_count integer;
  current_user_id uuid;
  resulting_status public.order_status;
  calculated_subtotal numeric;
  calculated_total numeric;
  saved_updated_at timestamptz;
  v_available numeric;
  v_warehouse_id uuid;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if expected_organization_id is null then raise exception 'ORGANIZATION_REQUIRED'; end if;
  if not public.is_organization_member(expected_organization_id) then raise exception 'ORDER_ACCESS_DENIED'; end if;

  select * into target_order
  from public.orders
  where id = target_order_id
    and organization_id = expected_organization_id
  for update;

  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if expected_order_updated_at is null or target_order.updated_at is distinct from expected_order_updated_at then raise exception 'ORDER_CONFLICT'; end if;
  if target_order.status in ('approved', 'invoiced', 'completed', 'cancelled') then raise exception 'ORDER_LOCKED'; end if;
  if jsonb_typeof(review_items) <> 'array' or jsonb_array_length(review_items) = 0 then raise exception 'REVIEW_ITEMS_REQUIRED'; end if;
  if jsonb_array_length(review_items) > 100 then raise exception 'REVIEW_TOO_LARGE'; end if;
  if review_discount is null or review_discount < 0 or review_discount > 999999999999 then raise exception 'INVALID_DISCOUNT'; end if;
  if review_freight is null or review_freight < 0 or review_freight > 999999999999 then raise exception 'INVALID_FREIGHT'; end if;

  select count(*) into existing_count
  from public.order_items
  where order_id = target_order.id
    and organization_id = expected_organization_id;

  select count(distinct value->>'id') into submitted_count
  from jsonb_array_elements(review_items);

  if existing_count <> jsonb_array_length(review_items) or existing_count <> submitted_count then
    raise exception 'REVIEW_ITEM_SET_MISMATCH';
  end if;

  -- Warehouse resolution if approving
  if mark_approved then
    select id into v_warehouse_id
    from public.warehouses
    where organization_id = expected_organization_id and active = true
    order by name asc
    limit 1;
    if v_warehouse_id is null then
      raise exception 'NO_ACTIVE_WAREHOUSE';
    end if;
  end if;

  for item in select value from jsonb_array_elements(review_items) loop
    if coalesce(item->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'INVALID_ORDER_ITEM_ID';
    end if;

    select * into target_item
    from public.order_items
    where id = (item->>'id')::uuid
      and order_id = target_order.id
      and organization_id = expected_organization_id
    for update;
    if not found then raise exception 'ORDER_ITEM_NOT_FOUND'; end if;

    item_quantity := case when jsonb_typeof(item->'quantity') = 'number' then (item->>'quantity')::numeric else null end;
    item_price := case when jsonb_typeof(item->'unit_price') = 'number' then (item->>'unit_price')::numeric else null end;
    confirmed := case when jsonb_typeof(item->'confirmed') = 'boolean' then (item->>'confirmed')::boolean else false end;
    if item_quantity is null or item_quantity <= 0 or item_quantity > 99999999 then raise exception 'INVALID_ITEM_QUANTITY'; end if;
    if item_price is null or item_price < 0 or item_price > 999999999999 then raise exception 'INVALID_ITEM_PRICE'; end if;
    if item_quantity * item_price > 999999999999.99 then raise exception 'ITEM_TOTAL_LIMIT'; end if;

    candidate_product_id := nullif(item->>'product_id', '');
    candidate_product_uuid := null;
    resolved_product := null;
    if candidate_product_id is not null then
      if candidate_product_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'INVALID_PRODUCT_ID'; end if;
      candidate_product_uuid := candidate_product_id::uuid;
      select * into resolved_product
      from public.products
      where id = candidate_product_uuid
        and organization_id = expected_organization_id
        and active;
      if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    end if;

    if mark_approved and (resolved_product.id is null or not confirmed) then
      raise exception 'REVIEW_INCOMPLETE';
    end if;

    update public.order_items
    set product_id = resolved_product.id,
        description = coalesce(resolved_product.name, target_item.description),
        quantity = item_quantity,
        unit = coalesce(resolved_product.unit, target_item.unit),
        unit_price = round(item_price, 2),
        total = round(item_quantity * item_price, 2),
        match_confidence = case when resolved_product.id is not null and confirmed then 1 else target_item.match_confidence end,
        needs_review = not (resolved_product.id is not null and confirmed)
    where id = target_item.id;

    -- Reserve stock if approving
    if mark_approved and resolved_product.track_stock then
      select quantity_available into v_available
      from public.inventory_overview
      where product_id = resolved_product.id and organization_id = expected_organization_id;

      if v_available is null or v_available < item_quantity then
        raise exception 'INSUFFICIENT_STOCK:%', resolved_product.name;
      end if;

      if exists (
        select 1 from public.stock_reservations
        where source_type = 'order_item' and source_id = target_item.id and status = 'active'
      ) then
        raise exception 'RESERVATION_ALREADY_EXISTS_FOR_ITEM:%', target_item.id;
      end if;

      insert into public.stock_reservations (
        organization_id, warehouse_id, product_id, source_type, source_id, quantity, status
      ) values (
        expected_organization_id, v_warehouse_id, resolved_product.id, 'order_item', target_item.id, item_quantity, 'active'
      );
    end if;

  end loop;

  select coalesce(sum(total), 0) into calculated_subtotal
  from public.order_items
  where order_id = target_order.id
    and organization_id = expected_organization_id;

  calculated_total := greatest(0, calculated_subtotal - round(review_discount, 2) + round(review_freight, 2));
  if calculated_subtotal > 999999999999.99 or calculated_total > 999999999999.99 then raise exception 'ORDER_TOTAL_LIMIT'; end if;

  resulting_status := case when mark_approved then 'approved'::public.order_status else 'review'::public.order_status end;

  update public.orders target
  set discount = round(review_discount, 2),
      freight = round(review_freight, 2),
      notes = left(coalesce(review_notes, ''), 1000),
      subtotal = calculated_subtotal,
      total = calculated_total,
      status = resulting_status,
      reviewed_at = now(),
      reviewed_by = current_user_id,
      approved_at = case when mark_approved then now() else null end,
      approved_by = case when mark_approved then current_user_id else null end
  where target.id = target_order.id
    and target.organization_id = expected_organization_id
  returning target.updated_at into saved_updated_at;

  if mark_approved then
    insert into public.business_events (
      organization_id, event_type, entity_type, entity_id, actor_id, payload
    ) values (
      expected_organization_id,
      'order.approved',
      'order',
      target_order.id,
      current_user_id,
      jsonb_build_object('order_number', target_order.number)
    );
  end if;

  return jsonb_build_object('status', resulting_status, 'updated_at', saved_updated_at);
end;
$$;
commit;
