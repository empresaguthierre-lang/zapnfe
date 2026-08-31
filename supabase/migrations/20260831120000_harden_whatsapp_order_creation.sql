create or replace function public.create_order_from_whatsapp(
  target_message_id uuid,
  extracted_customer_name text,
  extracted_notes text,
  extracted_confidence numeric,
  extracted_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inbound public.whatsapp_inbound_messages;
  existing_order_id uuid;
  resolved_customer_id uuid;
  created_order_id uuid;
  item jsonb;
  resolved_product public.products;
  candidate_product_id text;
  candidate_product_uuid uuid;
  item_quantity numeric;
  item_price numeric;
  item_confidence numeric;
  safe_customer_name text;
begin
  select * into inbound from public.whatsapp_inbound_messages where id = target_message_id for update;
  if not found then raise exception 'Inbound message not found'; end if;

  select id into existing_order_id from public.orders where inbound_message_id = inbound.id;
  if existing_order_id is not null then return existing_order_id; end if;
  if jsonb_typeof(extracted_items) <> 'array' then raise exception 'Extracted items must be an array'; end if;

  update public.whatsapp_inbound_messages set processing_status = 'processing', processing_error = null where id = inbound.id;
  safe_customer_name := left(coalesce(nullif(trim(extracted_customer_name), ''), nullif(trim(inbound.sender_name), ''), inbound.sender_phone), 160);
  if char_length(trim(safe_customer_name)) < 2 then safe_customer_name := inbound.sender_phone; end if;

  insert into public.customers (organization_id, name, phone)
  values (inbound.organization_id, safe_customer_name, inbound.sender_phone)
  on conflict (organization_id, phone) do update
    set name = case when public.customers.name = public.customers.phone then excluded.name else public.customers.name end,
        updated_at = now()
  returning id into resolved_customer_id;

  insert into public.orders (organization_id, customer_id, inbound_message_id, raw_message, notes, extraction_confidence)
  values (
    inbound.organization_id,
    resolved_customer_id,
    inbound.id,
    left(coalesce(inbound.body, ''), 5000),
    left(coalesce(extracted_notes, ''), 1000),
    least(greatest(coalesce(extracted_confidence, 0), 0), 1)
  )
  returning id into created_order_id;

  for item in select value from jsonb_array_elements(extracted_items) loop
    resolved_product := null;
    candidate_product_uuid := null;
    candidate_product_id := nullif(item->>'product_id', '');

    if candidate_product_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      candidate_product_uuid := candidate_product_id::uuid;
      select * into resolved_product
      from public.products
      where id = candidate_product_uuid and organization_id = inbound.organization_id and active;
    end if;

    item_quantity := case when jsonb_typeof(item->'quantity') = 'number' then greatest((item->>'quantity')::numeric, 0) else 0 end;
    if item_quantity = 0 then continue; end if;
    item_quantity := least(item_quantity, 99999999999.999);
    item_price := coalesce(resolved_product.price, 0);
    item_confidence := case when jsonb_typeof(item->'match_confidence') = 'number' then least(greatest((item->>'match_confidence')::numeric, 0), 1) else 0 end;

    insert into public.order_items (organization_id, order_id, product_id, description, quantity, unit, unit_price, total, match_confidence, needs_review)
    values (
      inbound.organization_id,
      created_order_id,
      resolved_product.id,
      left(coalesce(nullif(item->>'description', ''), resolved_product.name, 'Item não identificado'), 300),
      item_quantity,
      left(coalesce(nullif(item->>'unit', ''), resolved_product.unit, 'UN'), 20),
      item_price,
      round(item_quantity * item_price, 2),
      item_confidence,
      resolved_product.id is null or item_confidence < 0.85
    );
  end loop;

  update public.orders target
  set subtotal = totals.value, total = totals.value
  from (select coalesce(sum(total), 0) value from public.order_items where order_id = created_order_id) totals
  where target.id = created_order_id;

  update public.whatsapp_inbound_messages set processing_status = 'processed', processed_at = now() where id = inbound.id;
  return created_order_id;
end;
$$;

revoke all on function public.create_order_from_whatsapp(uuid, text, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_from_whatsapp(uuid, text, text, numeric, jsonb) to service_role;

comment on function public.create_order_from_whatsapp is 'Creates an idempotent review order from a persisted WhatsApp message. Invalid or cross-organization product identifiers are treated as unmatched. Service role only.';
