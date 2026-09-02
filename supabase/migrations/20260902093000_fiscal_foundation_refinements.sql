begin;

-- 1. Refine Customer Restrictions RPCs (Replace check with get and assert)

drop function if exists public.customer_check_operation_allowed;

create or replace function public.customer_get_operation_restrictions(
  p_customer_id uuid,
  p_scope public.restriction_scope
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_org_id uuid;
  v_restrictions jsonb;
  v_has_block boolean := false;
  v_has_warning boolean := false;
  v_has_approval boolean := false;
begin
  -- Resolve organization from customer to not trust client org_id
  select organization_id into v_org_id from public.customers where id = p_customer_id;
  if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  if not public.is_organization_member(v_org_id) then raise exception 'UNAUTHORIZED'; end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', cr.id,
      'module', cr.module,
      'severity', cr.severity,
      'reason', cr.reason,
      'created_at', cr.created_at,
      'created_by_name', (select email from auth.users where id = cr.created_by)
    )
  ) into v_restrictions
  from public.customer_restrictions cr
  where cr.customer_id = p_customer_id
    and cr.released_at is null
    and (cr.expires_at is null or cr.expires_at > now())
    and cr.scope in (p_scope, 'all_operations');

  if v_restrictions is null then
    return jsonb_build_object('allowed', true, 'requires_approval', false, 'restrictions', '[]'::jsonb);
  end if;

  -- Determine state based on severities
  if v_restrictions @> '[{"severity": "block"}]' then
    v_has_block := true;
  end if;
  
  if v_restrictions @> '[{"severity": "requires_approval"}]' then
    v_has_approval := true;
  end if;

  return jsonb_build_object(
    'allowed', not v_has_block,
    'requires_approval', v_has_approval,
    'restrictions', v_restrictions
  );
end;
$$;


create or replace function public.customer_assert_operation_allowed(
  p_customer_id uuid,
  p_scope public.restriction_scope
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_org_id uuid;
begin
  -- Resolve organization from customer
  select organization_id into v_org_id from public.customers where id = p_customer_id;
  if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  if not public.is_organization_member(v_org_id) then raise exception 'UNAUTHORIZED'; end if;

  if exists (
    select 1 from public.customer_restrictions
    where customer_id = p_customer_id
      and released_at is null
      and (expires_at is null or expires_at > now())
      and scope in (p_scope, 'all_operations')
      and severity = 'block'
  ) then
    raise exception 'CUSTOMER_OPERATION_BLOCKED';
  end if;
end;
$$;


-- 2. Refine Customer Fiscal Profiles
alter table public.customer_fiscal_profiles drop column tax_regime;
alter table public.customer_fiscal_profiles drop column fiscal_address;
alter table public.customer_fiscal_profiles add column fiscal_address_id uuid references public.customer_addresses(id) on delete set null;

-- 3. Create Organization Fiscal Profiles
create table public.organization_fiscal_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  
  cpf_cnpj text not null,
  state_registration text,
  municipal_registration text,
  tax_regime public.tax_regime not null,
  
  fiscal_address jsonb, -- Since organizations don't have an address table yet, jsonb is fine for issuer
  
  updated_at timestamptz not null default now()
);

alter table public.organization_fiscal_profiles enable row level security;
create policy org_fisc_prof_org on public.organization_fiscal_profiles for all to authenticated using (public.is_organization_member(organization_id));

-- 4. Refine Invoice Items (Snapshots)
alter table public.invoice_items rename column sku to sku_snapshot;
alter table public.invoice_items rename column name to description_snapshot;
alter table public.invoice_items rename column cfop to cfop_snapshot;
alter table public.invoice_items rename column ncm to ncm_snapshot;
alter table public.invoice_items rename column unit to unit_snapshot;
alter table public.invoice_items add column cest_snapshot text;
alter table public.invoice_items add column discount_amount numeric not null default 0;

-- 5. Prevent Deletion of Ledgers via Row Level Security (No DELETE policy)
-- First, revoke all DELETE policies on critical tables if any exist. We will just add explicit RLS to block deletes.

create policy no_delete_stock_movements on public.stock_movements for delete to authenticated using (false);
create policy no_delete_stock_reservations on public.stock_reservations for delete to authenticated using (false);
create policy no_delete_receivable_payments on public.receivable_payments for delete to authenticated using (false);
create policy no_delete_bank_transactions on public.bank_transactions for delete to authenticated using (false);
create policy no_delete_bank_reconciliations on public.bank_reconciliations for delete to authenticated using (false);
create policy no_delete_invoice_events on public.invoice_events for delete to authenticated using (false);

commit;
