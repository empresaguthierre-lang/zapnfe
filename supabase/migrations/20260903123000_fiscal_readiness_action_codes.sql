begin;

begin;

create or replace function public.fiscal_validate_order_readiness(p_order_id uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_order record;
  v_org_id uuid;
  v_org_profile record;
  v_customer_profile record;
  v_item record;
  v_restrictions jsonb;
  v_issues jsonb := '[]'::jsonb;
  v_errors int := 0;
  v_warnings int := 0;
  v_invoice_exists boolean;
begin
  -- 1. Load Order
  select o.id, o.organization_id, o.customer_id, o.status, o.total
  into v_order
  from public.orders o
  where o.id = p_order_id;
  
  if not found then
    return jsonb_build_object('ready', false, 'errors', 1, 'warnings', 0, 'issues', jsonb_build_array(
      jsonb_build_object('code', 'ORDER_NOT_FOUND', 'severity', 'error', 'message', 'Pedido nǜo encontrado.')
    ));
  end if;
  
  v_org_id := v_order.organization_id;

  if not public.is_organization_member(v_org_id) then
    raise exception 'UNAUTHORIZED';
  end if;

  -- 2. Check existing invoices
  select exists(
    select 1 from public.invoices 
    where order_id = p_order_id 
      and status not in ('canceled', 'rejected', 'denied')
  ) into v_invoice_exists;

  if v_invoice_exists then
    v_issues := v_issues || jsonb_build_object(
      'code', 'INVOICE_ALREADY_EXISTS',
      'severity', 'error',
      'message', 'Jǭ existe um documento fiscal ativo para este pedido.'
    );
    v_errors := v_errors + 1;
  end if;
  
  if v_order.status not in ('approved', 'completed') then
    v_issues := v_issues || jsonb_build_object(
      'code', 'ORDER_NOT_ELIGIBLE_FOR_INVOICE',
      'severity', 'error',
      'message', 'Pedido precisa estar aprovado para emissǜo fiscal.'
    );
    v_errors := v_errors + 1;
  end if;

  -- 3. Check Issuer (Organization)
  select * into v_org_profile from public.organization_fiscal_profiles where organization_id = v_org_id;
  if not found then
    v_issues := v_issues || jsonb_build_object(
      'code', 'ISSUER_PROFILE_MISSING', 'severity', 'error', 'entity', 'organization',
      'message', 'Perfil fiscal da empresa emissora nǜo configurado.',
      'action_code', 'CONFIGURE_FISCAL'
    );
    v_errors := v_errors + 1;
  else
    if coalesce(v_org_profile.cpf_cnpj, '') = '' then
      v_issues := v_issues || jsonb_build_object('code', 'ISSUER_DOCUMENT_MISSING', 'severity', 'error', 'entity', 'organization', 'message', 'CNPJ do emitente ausente.', 'action_code', 'CONFIGURE_FISCAL');
      v_errors := v_errors + 1;
    end if;
    if v_org_profile.tax_regime is null then
      v_issues := v_issues || jsonb_build_object('code', 'ISSUER_TAX_REGIME_MISSING', 'severity', 'error', 'entity', 'organization', 'message', 'Regime tributǭrio do emitente nǜo informado.', 'action_code', 'CONFIGURE_FISCAL');
      v_errors := v_errors + 1;
    end if;
    if v_org_profile.fiscal_address is null then
      v_issues := v_issues || jsonb_build_object('code', 'ISSUER_FISCAL_ADDRESS_MISSING', 'severity', 'error', 'entity', 'organization', 'message', 'Endereo fiscal do emitente nǜo informado.', 'action_code', 'CONFIGURE_FISCAL');
      v_errors := v_errors + 1;
    end if;
  end if;

  -- 4. Check Customer
  v_restrictions := public.customer_get_operation_restrictions(v_order.customer_id, 'invoice_issue');
  if not (v_restrictions->>'allowed')::boolean then
    v_issues := v_issues || jsonb_build_object(
      'code', 'CUSTOMER_OPERATION_BLOCKED', 'severity', 'error', 'entity', 'customer', 'entity_id', v_order.customer_id,
      'message', 'Cliente possui restriǜo fiscal bloqueante ativa.',
      'action_code', 'VIEW_CUSTOMER_RESTRICTIONS'
    );
    v_errors := v_errors + 1;
  end if;

  select * into v_customer_profile from public.customer_fiscal_profiles where customer_id = v_order.customer_id;
  if not found then
    v_issues := v_issues || jsonb_build_object(
      'code', 'CUSTOMER_FISCAL_PROFILE_MISSING', 'severity', 'error', 'entity', 'customer', 'entity_id', v_order.customer_id,
      'message', 'Perfil fiscal do cliente nǜo configurado.',
      'action_code', 'CONFIGURE_CUSTOMER_FISCAL'
    );
    v_errors := v_errors + 1;
  else
    if coalesce(v_customer_profile.cpf_cnpj, '') = '' then
      v_issues := v_issues || jsonb_build_object('code', 'CUSTOMER_DOCUMENT_MISSING', 'severity', 'error', 'entity', 'customer', 'entity_id', v_order.customer_id, 'message', 'CPF/CNPJ do cliente ausente.', 'action_code', 'CONFIGURE_CUSTOMER_FISCAL');
      v_errors := v_errors + 1;
    end if;
    if v_customer_profile.fiscal_address_id is null then
      v_issues := v_issues || jsonb_build_object('code', 'CUSTOMER_FISCAL_ADDRESS_MISSING', 'severity', 'error', 'entity', 'customer', 'entity_id', v_order.customer_id, 'message', 'Endereo fiscal do cliente nǜo informado.', 'action_code', 'CONFIGURE_CUSTOMER_FISCAL');
      v_errors := v_errors + 1;
    end if;
  end if;

  -- 5. Check Products
  for v_item in select i.*, p.name from public.order_items i join public.products p on i.product_id = p.id where i.order_id = p_order_id
  loop
    -- Later we can join with product_fiscal_profiles, but for now we simulate product NCM checking.
    -- (As we have not created a product_fiscal_profiles table yet, we just add a mock check for demonstration or rely on product core table if NCM is there).
    -- I will assume NCM will be validated later, or I'll just check if product exists.
    if v_item.product_id is null then
      v_issues := v_issues || jsonb_build_object(
        'code', 'PRODUCT_MISSING', 'severity', 'error', 'entity', 'product', 'order_item_id', v_item.id,
        'message', 'Item do pedido invǭlido ou sem vnculo com produto.',
        'action', null
      );
      v_errors := v_errors + 1;
    end if;
    
    -- Future: check NCM, CFOP etc.
  end loop;

  if not exists (select 1 from public.order_items where order_id = p_order_id) then
    v_issues := v_issues || jsonb_build_object('code', 'ORDER_HAS_NO_ITEMS', 'severity', 'error', 'message', 'Pedido nǜo possui itens.');
    v_errors := v_errors + 1;
  end if;

  return jsonb_build_object(
    'ready', (v_errors = 0),
    'errors', v_errors,
    'warnings', v_warnings,
    'issues', v_issues
  );
end;
$$;


create or replace function public.fiscal_assert_order_readiness(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_diag jsonb;
begin
  v_diag := public.fiscal_validate_order_readiness(p_order_id);
  if not (v_diag->>'ready')::boolean then
    raise exception 'FISCAL_READINESS_FAILED';
  end if;
end;
$$;

commit;


commit;

