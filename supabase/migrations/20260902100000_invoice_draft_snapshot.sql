begin;

-- 1. Update Invoice Status Enum (must be done outside transaction in some PG versions, but Supabase Postgres 15 handles it fine usually, or we can use a workaround)
alter type public.invoice_status add value if not exists 'superseded';

-- 2. Expand Invoices table for Snapshots and Versioning
alter table public.invoices
  add column draft_revision integer not null default 1,
  add column supersedes_invoice_id uuid references public.invoices(id) on delete set null,
  add column source_snapshot_hash text,
  
  -- Issuer Snapshots
  add column issuer_fiscal_profile_id uuid references public.organization_fiscal_profiles(organization_id) on delete set null,
  add column issuer_legal_name_snapshot text,
  add column issuer_trade_name_snapshot text,
  add column issuer_cnpj_snapshot text,
  add column issuer_ie_snapshot text,
  add column issuer_im_snapshot text,
  add column issuer_tax_regime_snapshot text,
  add column issuer_address_snapshot jsonb,
  
  -- Recipient Snapshots
  add column customer_fiscal_profile_id uuid references public.customer_fiscal_profiles(id) on delete set null,
  add column recipient_name_snapshot text,
  add column recipient_document_snapshot text,
  add column recipient_ie_snapshot text,
  add column recipient_ie_indicator_snapshot text,
  add column recipient_im_snapshot text,
  add column recipient_final_consumer_snapshot boolean,
  add column recipient_address_snapshot jsonb,
  
  -- Detailed Totals
  add column subtotal_amount numeric not null default 0,
  add column products_amount numeric not null default 0,
  add column other_amount numeric not null default 0;

-- 3. The Grand RPC for creating Draft and Snapshot
create or replace function public.fiscal_create_invoice_draft_from_order(p_order_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_order record;
  v_org_id uuid;
  v_org_profile record;
  v_customer_profile record;
  v_customer record;
  v_item record;
  v_diag jsonb;
  
  v_hash_text text;
  v_snapshot_hash text;
  
  v_existing_draft record;
  v_new_invoice_id uuid;
  v_new_revision int := 1;
  
  v_total_products numeric := 0;
  v_total_freight numeric := 0;
  v_total_discount numeric := 0;
  v_total_other numeric := 0;
  v_total_invoice numeric := 0;
begin
  -- 1. Resolve and lock order
  select o.* into v_order from public.orders o where o.id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  v_org_id := v_order.organization_id;
  if not public.is_organization_member(v_org_id) then raise exception 'UNAUTHORIZED'; end if;
  
  -- 2. Assert Operations Allowed (Security)
  perform public.customer_assert_operation_allowed(v_order.customer_id, 'invoice_issue');
  
  -- 3. Assert Fiscal Readiness
  v_diag := public.fiscal_validate_order_readiness(p_order_id);
  if not (v_diag->>'ready')::boolean then
    raise exception 'FISCAL_READINESS_FAILED';
  end if;
  
  -- 4. Load Profiles for Snapshots
  select * into v_org_profile from public.organization_fiscal_profiles where organization_id = v_org_id;
  select * into v_customer_profile from public.customer_fiscal_profiles where customer_id = v_order.customer_id;
  select * into v_customer from public.customers where id = v_order.customer_id;
  
  -- 5. Compute deterministic Snapshot Hash (Order, Profiles, Items)
  -- For MVP hash, we combine the order updated_at and profiles updated_at. If any changes, hash changes.
  -- To be 100% accurate on items, we hash the items too.
  v_hash_text := v_order.id::text || '_' || coalesce(v_order.updated_at::text, '') || '_' || 
                 coalesce(v_org_profile.updated_at::text, '') || '_' || 
                 coalesce(v_customer_profile.updated_at::text, '') || '_' ||
                 (select md5(string_agg(id::text || product_id::text || quantity::text || unit_price::text, '')) from public.order_items where order_id = p_order_id);
  v_snapshot_hash := md5(v_hash_text);
  
  -- 6. Check Idempotency (Existing Draft)
  -- Find the active draft for this order
  select * into v_existing_draft from public.invoices 
  where order_id = p_order_id 
    and status = 'draft'
  order by draft_revision desc limit 1;
  
  if found then
    if v_existing_draft.source_snapshot_hash = v_snapshot_hash then
      -- Unchanged, return existing draft id
      return v_existing_draft.id;
    else
      -- Changed, supersede the old draft
      update public.invoices set status = 'superseded' where id = v_existing_draft.id;
      insert into public.invoice_events (organization_id, invoice_id, event_type, description, created_by)
      values (v_org_id, v_existing_draft.id, 'draft_superseded', 'Draft substitudo por nova revisǜo devido a alteraǜo nos dados fiscais ou do pedido.', auth.uid());
      
      v_new_revision := v_existing_draft.draft_revision + 1;
    end if;
  end if;
  
  -- Calculate Totals
  select coalesce(sum(quantity * unit_price), 0) into v_total_products
  from public.order_items where order_id = p_order_id;
  
  v_total_freight := coalesce(v_order.freight_amount, 0);
  v_total_discount := coalesce(v_order.discount_amount, 0);
  v_total_other := 0; -- Future use
  
  v_total_invoice := v_total_products + v_total_freight + v_total_other - v_total_discount;
  
  -- 7. Create New Invoice Draft (Snapshot Header)
  insert into public.invoices (
    organization_id, order_id, customer_id, status, draft_revision, supersedes_invoice_id, source_snapshot_hash,
    
    issuer_fiscal_profile_id, issuer_legal_name_snapshot, issuer_trade_name_snapshot,
    issuer_cnpj_snapshot, issuer_ie_snapshot, issuer_im_snapshot, issuer_tax_regime_snapshot, issuer_address_snapshot,
    
    customer_fiscal_profile_id, recipient_name_snapshot, recipient_document_snapshot,
    recipient_ie_snapshot, recipient_ie_indicator_snapshot, recipient_im_snapshot,
    recipient_final_consumer_snapshot, recipient_address_snapshot,
    
    total_amount, products_amount, total_products, total_freight, total_discounts, other_amount, subtotal_amount,
    created_by
  ) values (
    v_org_id, p_order_id, v_order.customer_id, 'draft', v_new_revision, v_existing_draft.id, v_snapshot_hash,
    
    v_org_profile.organization_id, (select name from public.organizations where id = v_org_id), null,
    v_org_profile.cpf_cnpj, v_org_profile.state_registration, v_org_profile.municipal_registration, v_org_profile.tax_regime::text, v_org_profile.fiscal_address,
    
    v_customer_profile.id, v_customer.name, v_customer_profile.cpf_cnpj,
    v_customer_profile.state_registration, v_customer_profile.state_registration_indicator::text, v_customer_profile.municipal_registration,
    v_customer_profile.final_consumer,
    (select jsonb_build_object('street', street, 'number', number, 'district', district, 'city', city, 'state', state, 'postal_code', postal_code, 'complement', complement) from public.customer_addresses where id = v_customer_profile.fiscal_address_id),
    
    v_total_invoice, v_total_products, v_total_products, v_total_freight, v_total_discount, v_total_other, v_total_products,
    auth.uid()
  ) returning id into v_new_invoice_id;
  
  -- 8. Create Invoice Items (Snapshots)
  for v_item in select i.*, p.name, p.sku from public.order_items i join public.products p on i.product_id = p.id where i.order_id = p_order_id
  loop
    insert into public.invoice_items (
      organization_id, invoice_id, product_id, item_sequence,
      sku_snapshot, description_snapshot, cfop_snapshot, ncm_snapshot, unit_snapshot, cest_snapshot,
      quantity, unit_price, total_price, discount_amount
    ) values (
      v_org_id, v_new_invoice_id, v_item.product_id, v_item.sequence,
      v_item.sku, v_item.name, null, null, null, null, -- CFOP/NCM/Unit will be fetched from product fiscal profile later
      v_item.quantity, v_item.unit_price, (v_item.quantity * v_item.unit_price), 0
    );
  end loop;
  
  -- 9. Record Invoice Event
  insert into public.invoice_events (organization_id, invoice_id, event_type, description, created_by)
  values (v_org_id, v_new_invoice_id, 'draft_created', 'Draft fiscal preparado (Revisǜo ' || v_new_revision || ').', auth.uid());
  
  return v_new_invoice_id;
end;
$$;

commit;
