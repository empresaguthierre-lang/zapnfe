begin;

-- 1. Restriction Enums
create type public.restriction_module as enum ('fiscal', 'financial', 'commercial', 'compliance', 'system');
create type public.restriction_scope as enum ('new_order', 'order_approval', 'invoice_issue', 'credit_sale', 'shipment', 'document_delivery', 'all_operations');
create type public.restriction_severity as enum ('warning', 'requires_approval', 'block');

-- 2. Customer Restrictions
create table public.customer_restrictions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  
  module public.restriction_module not null,
  restriction_type text not null,
  scope public.restriction_scope not null,
  severity public.restriction_severity not null,
  
  reason_code text,
  reason text not null,
  
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  
  released_by uuid references auth.users(id) on delete set null,
  released_at timestamptz,
  release_reason text,
  
  expires_at timestamptz,
  metadata jsonb
);

alter table public.customer_restrictions enable row level security;
create policy cust_rest_org on public.customer_restrictions for all to authenticated using (public.is_organization_member(organization_id));

-- 3. Customer Fiscal Profiles
create type public.state_registration_indicator as enum ('contribuinte', 'isento', 'nao_contribuinte');
create type public.tax_regime as enum ('simples_nacional', 'lucro_presumido', 'lucro_real');

create table public.customer_fiscal_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  
  cpf_cnpj text,
  state_registration text,
  state_registration_indicator public.state_registration_indicator,
  municipal_registration text,
  tax_regime public.tax_regime,
  
  fiscal_address jsonb, -- Storing full address inside jsonb for now
  final_consumer boolean not null default false,
  
  updated_at timestamptz not null default now(),
  unique(organization_id, customer_id)
);

alter table public.customer_fiscal_profiles enable row level security;
create policy cust_fisc_prof_org on public.customer_fiscal_profiles for all to authenticated using (public.is_organization_member(organization_id));


-- 4. Fiscal Provider & Settings
create table public.fiscal_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null, -- focusnfe, tecnospeed, etc.
  environment text not null, -- homologation, production
  credentials jsonb, -- encrypted or structured creds
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.fiscal_provider_accounts enable row level security;
create policy fisc_prov_org on public.fiscal_provider_accounts for all to authenticated using (public.is_organization_member(organization_id));

create table public.fiscal_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  default_provider_id uuid references public.fiscal_provider_accounts(id) on delete set null,
  tax_regime public.tax_regime,
  digital_certificate_id text, -- ID of the cert in the provider
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.fiscal_settings enable row level security;
create policy fisc_set_org on public.fiscal_settings for all to authenticated using (public.is_organization_member(organization_id));

-- 5. Invoices (NF-e Base)
create type public.invoice_status as enum ('draft', 'pending_authorization', 'authorized', 'rejected', 'denied', 'canceled');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  
  invoice_type text not null default 'nfe', -- nfe, nfce, nfse
  operation_nature text,
  
  series text,
  number text,
  access_key text,
  
  total_amount numeric not null default 0,
  total_products numeric not null default 0,
  total_freight numeric not null default 0,
  total_discounts numeric not null default 0,
  total_taxes numeric not null default 0,
  
  status public.invoice_status not null default 'draft',
  
  issued_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.invoices enable row level security;
create policy inv_org on public.invoices for all to authenticated using (public.is_organization_member(organization_id));

-- 6. Invoice Items
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  
  item_sequence int not null,
  
  sku text,
  name text not null,
  cfop text,
  ncm text,
  unit text,
  
  quantity numeric not null,
  unit_price numeric not null,
  total_price numeric not null,
  
  tax_details jsonb, -- ICMS, PIS, COFINS, IPI
  
  created_at timestamptz not null default now()
);

alter table public.invoice_items enable row level security;
create policy inv_items_org on public.invoice_items for all to authenticated using (public.is_organization_member(organization_id));

-- 7. Invoice Events (Immutable History)
create table public.invoice_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  
  event_type text not null, -- created, sent, authorized, rejected, canceled, cce
  event_date timestamptz not null default now(),
  
  description text,
  provider_response jsonb,
  
  created_by uuid references auth.users(id) on delete set null
);

alter table public.invoice_events enable row level security;
create policy inv_evt_org on public.invoice_events for all to authenticated using (public.is_organization_member(organization_id));


-- 8. Customer Restriction RPCs
create or replace function public.customer_apply_restriction(
  p_org_id uuid,
  p_customer_id uuid,
  p_module public.restriction_module,
  p_type text,
  p_scope public.restriction_scope,
  p_severity public.restriction_severity,
  p_reason text,
  p_reason_code text default null
)
returns void
language plpgsql
security definer
as $$
begin
  if not public.is_organization_member(p_org_id) then raise exception 'UNAUTHORIZED'; end if;

  insert into public.customer_restrictions (
    organization_id, customer_id, module, restriction_type, scope, severity, reason, reason_code, created_by
  ) values (
    p_org_id, p_customer_id, p_module, p_type, p_scope, p_severity, p_reason, p_reason_code, auth.uid()
  );
end;
$$;

create or replace function public.customer_release_restriction(
  p_org_id uuid,
  p_restriction_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
as $$
begin
  if not public.is_organization_member(p_org_id) then raise exception 'UNAUTHORIZED'; end if;

  update public.customer_restrictions
  set released_at = now(),
      released_by = auth.uid(),
      release_reason = p_reason
  where id = p_restriction_id 
    and organization_id = p_org_id 
    and released_at is null;
end;
$$;

create or replace function public.customer_check_operation_allowed(
  p_org_id uuid,
  p_customer_id uuid,
  p_scope public.restriction_scope
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_block record;
begin
  if not public.is_organization_member(p_org_id) then raise exception 'UNAUTHORIZED'; end if;

  -- Verify if there are active blocks matching the scope or 'all_operations'
  select id, module, reason, severity into v_block
  from public.customer_restrictions
  where organization_id = p_org_id 
    and customer_id = p_customer_id
    and released_at is null
    and (expires_at is null or expires_at > now())
    and scope in (p_scope, 'all_operations')
    and severity = 'block'
  limit 1;

  if found then
    return jsonb_build_object(
      'allowed', false, 
      'block_id', v_block.id, 
      'module', v_block.module, 
      'reason', v_block.reason
    );
  end if;

  return jsonb_build_object('allowed', true);
end;
$$;

commit;
