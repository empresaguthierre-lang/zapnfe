begin;

-- =============================================================
-- AUDIT FIX: M2/Item 7 — Product Fiscal Profiles + Readiness
-- =============================================================

create table if not exists public.product_fiscal_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  
  ncm text,
  cest text,
  origin text,
  
  default_cfop_in_state text,
  default_cfop_out_state text,
  
  updated_at timestamptz not null default now(),
  unique(organization_id, product_id)
);

alter table public.product_fiscal_profiles enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'prod_fisc_prof_org' and tablename = 'product_fiscal_profiles') then
    create policy prod_fisc_prof_org on public.product_fiscal_profiles 
      for all to authenticated using (public.is_organization_member(organization_id));
  end if;
end
$$;

-- Update Readiness RPC to validate NCM
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
      jsonb_build_object('code', 'ORDER_NOT_FOUND', 'severity', 'error', 'message', 'Pedido nao encontrado.')
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
      and status not in ('draft', 'superseded', 'canceled', 'rejected', 'denied')
  ) into v_invoice_exists;

  if v_invoice_exists then
    v_issues := v_issues || jsonb_build_object(
      'code', 'INVOICE_ALREADY_EXISTS',
      'severity', 'error',
      'message', 'Ja existe um documento fiscal ativo (autorizado ou em processamento) para este pedido.'
    );
    v_errors := v_errors + 1;
  end if;

  if v_order.status not in ('approved', 'completed') then
    v_issues := v_issues || jsonb_build_object(
      'code', 'ORDER_NOT_ELIGIBLE_FOR_INVOICE',
      'severity', 'error',
      'message', 'Pedido precisa estar aprovado para emissao fiscal.'
    );
    v_errors := v_errors + 1;
  end if;

  -- 3. Check Issuer (Organization)
  select * into v_org_profile from public.organization_fiscal_profiles where organization_id = v_org_id;
  if not found then
    v_issues := v_issues || jsonb_build_object(
      'code', 'ISSUER_PROFILE_MISSING', 'severity', 'error', 'entity', 'organization',
      'message', 'Perfil fiscal da empresa emissora nao configurado.',
      'action', jsonb_build_object('label', 'Configurar Fiscal', 'href', '/fiscal/configuracoes')
    );
    v_errors := v_errors + 1;
  else
    if coalesce(v_org_profile.cpf_cnpj, '') = '' then
      v_issues := v_issues || jsonb_build_object('code', 'ISSUER_DOCUMENT_MISSING', 'severity', 'error', 'entity', 'organization', 'message', 'CNPJ do emitente ausente.', 'action', jsonb_build_object('label', 'Corrigir', 'href', '/fiscal/configuracoes'));
      v_errors := v_errors + 1;
    end if;
    if v_org_profile.tax_regime is null then
      v_issues := v_issues || jsonb_build_object('code', 'ISSUER_TAX_REGIME_MISSING', 'severity', 'error', 'entity', 'organization', 'message', 'Regime tributario do emitente nao informado.', 'action', jsonb_build_object('label', 'Corrigir', 'href', '/fiscal/configuracoes'));
      v_errors := v_errors + 1;
    end if;
    if v_org_profile.fiscal_address is null then
      v_issues := v_issues || jsonb_build_object('code', 'ISSUER_FISCAL_ADDRESS_MISSING', 'severity', 'error', 'entity', 'organization', 'message', 'Endereco fiscal do emitente nao informado.', 'action', jsonb_build_object('label', 'Corrigir', 'href', '/fiscal/configuracoes'));
      v_errors := v_errors + 1;
    end if;
  end if;

  -- 4. Check Customer
  v_restrictions := public.customer_get_operation_restrictions(v_order.customer_id, 'invoice_issue');
  if not (v_restrictions->>'allowed')::boolean then
    v_issues := v_issues || jsonb_build_object(
      'code', 'CUSTOMER_OPERATION_BLOCKED', 'severity', 'error', 'entity', 'customer', 'entity_id', v_order.customer_id,
      'message', 'Cliente possui restricao fiscal bloqueante ativa.',
      'action', jsonb_build_object('label', 'Ver restricoes', 'href', '/clientes/' || v_order.customer_id || '?tab=restricoes')
    );
    v_errors := v_errors + 1;
  end if;

  select * into v_customer_profile from public.customer_fiscal_profiles where customer_id = v_order.customer_id;
  if not found then
    v_issues := v_issues || jsonb_build_object(
      'code', 'CUSTOMER_FISCAL_PROFILE_MISSING', 'severity', 'error', 'entity', 'customer', 'entity_id', v_order.customer_id,
      'message', 'Perfil fiscal do cliente nao configurado.',
      'action', jsonb_build_object('label', 'Configurar Cliente', 'href', '/clientes/' || v_order.customer_id || '?tab=fiscal')
    );
    v_errors := v_errors + 1;
  else
    if coalesce(v_customer_profile.cpf_cnpj, '') = '' then
      v_issues := v_issues || jsonb_build_object('code', 'CUSTOMER_DOCUMENT_MISSING', 'severity', 'error', 'entity', 'customer', 'entity_id', v_order.customer_id, 'message', 'CPF/CNPJ do cliente ausente.', 'action', jsonb_build_object('label', 'Corrigir', 'href', '/clientes/' || v_order.customer_id || '?tab=fiscal'));
      v_errors := v_errors + 1;
    end if;
    if v_customer_profile.fiscal_address_id is null then
      v_issues := v_issues || jsonb_build_object('code', 'CUSTOMER_FISCAL_ADDRESS_MISSING', 'severity', 'error', 'entity', 'customer', 'entity_id', v_order.customer_id, 'message', 'Endereco fiscal do cliente nao informado.', 'action', jsonb_build_object('label', 'Corrigir', 'href', '/clientes/' || v_order.customer_id || '?tab=fiscal'));
      v_errors := v_errors + 1;
    end if;
  end if;

  -- 5. Check Products (UPDATED FOR M2 - product_fiscal_profiles)
  for v_item in 
    select i.*, p.name, pfp.ncm 
    from public.order_items i 
    join public.products p on i.product_id = p.id 
    left join public.product_fiscal_profiles pfp on p.id = pfp.product_id
    where i.order_id = p_order_id
  loop
    if v_item.product_id is null then
      v_issues := v_issues || jsonb_build_object(
        'code', 'PRODUCT_MISSING', 'severity', 'error', 'entity', 'product', 'order_item_id', v_item.id,
        'message', 'Item do pedido invalido ou sem vinculo com produto.',
        'action', null
      );
      v_errors := v_errors + 1;
    elsif coalesce(v_item.ncm, '') = '' then
      v_issues := v_issues || jsonb_build_object(
        'code', 'PRODUCT_NCM_MISSING', 'severity', 'error', 'entity', 'product', 'order_item_id', v_item.id,
        'message', 'Produto "' || v_item.name || '" sem NCM configurado.',
        'action', jsonb_build_object('label', 'Configurar Fiscal', 'href', '/estoque/produtos/' || v_item.product_id || '?tab=fiscal')
      );
      v_errors := v_errors + 1;
    end if;
  end loop;

  if not exists (select 1 from public.order_items where order_id = p_order_id) then
    v_issues := v_issues || jsonb_build_object('code', 'ORDER_HAS_NO_ITEMS', 'severity', 'error', 'message', 'Pedido nao possui itens.');
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

commit;