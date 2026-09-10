-- Migration: 20260831155000_core_erp_baseline.sql
-- Description: Baseline schema for core ERP entities (branches, warehouses, suppliers, customer_addresses,
-- stock_movements, stock_balances, stock_reservations, inventory_overview, business_events, audit_logs)
-- to ensure self-contained, reproducible fresh installs (Gate 0).

create table if not exists public.branches (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    code text not null,
    name text not null check (char_length(trim(name)) between 2 and 120),
    trade_name text,
    document text,
    email text,
    phone text,
    is_headquarters boolean not null default false,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, id),
    unique (organization_id, code)
);

alter table public.branches enable row level security;
create policy "Users can view branches of their organization" on public.branches
    for select using (organization_id = (select auth.jwt() ->> 'org_id')::uuid);

create table if not exists public.warehouses (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    branch_id uuid references public.branches(id) on delete set null,
    code text not null,
    name text not null check (char_length(trim(name)) between 2 and 120),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, id),
    unique (organization_id, code)
);

alter table public.warehouses enable row level security;
create policy "Users can view warehouses of their organization" on public.warehouses
    for select using (organization_id = (select auth.jwt() ->> 'org_id')::uuid);

create table if not exists public.suppliers (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    name text not null check (char_length(trim(name)) between 2 and 180),
    trade_name text,
    document text,
    email text,
    phone text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, id)
);

alter table public.suppliers enable row level security;
create policy "Users can view suppliers of their organization" on public.suppliers
    for select using (organization_id = (select auth.jwt() ->> 'org_id')::uuid);

create table if not exists public.customer_addresses (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    customer_id uuid not null references public.customers(id) on delete cascade,
    street text not null,
    number text not null,
    district text,
    city text not null,
    state text not null check (char_length(state) = 2),
    postal_code text not null,
    complement text,
    is_default boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, id)
);

alter table public.customer_addresses enable row level security;
create policy "Users can view addresses of their organization" on public.customer_addresses
    for select using (organization_id = (select auth.jwt() ->> 'org_id')::uuid);

create table if not exists public.stock_movements (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    warehouse_id uuid not null references public.warehouses(id) on delete restrict,
    product_id uuid not null references public.products(id) on delete restrict,
    movement_type text not null,
    quantity_delta numeric(14,3) not null,
    unit_cost numeric(14,2),
    source_type text,
    source_id uuid,
    notes text,
    reversal_of_id uuid references public.stock_movements(id),
    occurred_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    unique (organization_id, id)
);

alter table public.stock_movements enable row level security;
create policy "Users can view stock movements of their organization" on public.stock_movements
    for select using (organization_id = (select auth.jwt() ->> 'org_id')::uuid);

create table if not exists public.stock_balances (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    warehouse_id uuid not null references public.warehouses(id) on delete restrict,
    product_id uuid not null references public.products(id) on delete restrict,
    quantity_on_hand numeric(14,3) not null default 0,
    updated_at timestamptz not null default now(),
    unique (organization_id, warehouse_id, product_id)
);

alter table public.stock_balances enable row level security;
create policy "Users can view stock balances of their organization" on public.stock_balances
    for select using (organization_id = (select auth.jwt() ->> 'org_id')::uuid);

create table if not exists public.stock_reservations (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    warehouse_id uuid references public.warehouses(id) on delete restrict,
    product_id uuid not null references public.products(id) on delete restrict,
    source_type text not null,
    source_id uuid not null,
    quantity numeric(14,3) not null check (quantity > 0),
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, id)
);

alter table public.stock_reservations enable row level security;
create policy "Users can view stock reservations of their organization" on public.stock_reservations
    for select using (organization_id = (select auth.jwt() ->> 'org_id')::uuid);

create or replace view public.inventory_overview with (security_invoker = true) as
select
    p.id as product_id,
    p.organization_id,
    p.sku,
    p.name,
    null::text as category_name,
    p.unit as unit_code,
    coalesce(sum(m.quantity_delta), 0)::numeric(14,3) as quantity_on_hand,
    coalesce(r.reserved, 0)::numeric(14,3) as quantity_reserved,
    (coalesce(sum(m.quantity_delta), 0) - coalesce(r.reserved, 0))::numeric(14,3) as quantity_available,
    0::numeric(14,3) as minimum_stock,
    case
        when (coalesce(sum(m.quantity_delta), 0) - coalesce(r.reserved, 0)) <= 0 then 'out_of_stock'
        when (coalesce(sum(m.quantity_delta), 0) - coalesce(r.reserved, 0)) <= 5 then 'low_stock'
        else 'in_stock'
    end as stock_status,
    p.active
from public.products p
left join public.stock_movements m on m.product_id = p.id and m.organization_id = p.organization_id
left join (
    select organization_id, product_id, sum(quantity) as reserved
    from public.stock_reservations
    where status = 'active'
    group by organization_id, product_id
) r on r.product_id = p.id and r.organization_id = p.organization_id
group by p.id, p.organization_id, p.sku, p.name, p.unit, p.active, r.reserved;

grant select on public.inventory_overview to authenticated;

create or replace function public.erp_can_manage_org(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.organization_members
        where organization_id = target_org_id
          and user_id = auth.uid()
          and role in ('admin', 'manager')
    ) or (
        current_setting('request.jwt.claim.role', true) = 'service_role'
    );
$$;

grant execute on function public.erp_can_manage_org(uuid) to authenticated, service_role;

create or replace function public.inventory_post_movement(
    p_organization_id uuid,
    p_warehouse_id uuid,
    p_product_id uuid,
    p_movement_type text,
    p_quantity_delta numeric,
    p_source_type text default null,
    p_source_id uuid default null,
    p_unit_cost numeric default null,
    p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_movement_id uuid;
begin
    insert into public.stock_movements (
        organization_id, warehouse_id, product_id, movement_type,
        quantity_delta, source_type, source_id, unit_cost, notes
    ) values (
        p_organization_id, p_warehouse_id, p_product_id, p_movement_type,
        p_quantity_delta, p_source_type, p_source_id, p_unit_cost, p_notes
    ) returning id into v_movement_id;

    insert into public.stock_balances (organization_id, warehouse_id, product_id, quantity_on_hand, updated_at)
    values (p_organization_id, p_warehouse_id, p_product_id, p_quantity_delta, now())
    on conflict (organization_id, warehouse_id, product_id)
    do update set quantity_on_hand = public.stock_balances.quantity_on_hand + excluded.quantity_on_hand,
                  updated_at = now();

    return v_movement_id;
end;
$$;

create table if not exists public.business_events (
    id uuid primary key default gen_random_uuid(),
    event_type text not null,
    schema_version int not null default 1,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    actor_id uuid,
    entity_type text,
    entity_id uuid,
    occurred_at timestamptz not null default now(),
    payload jsonb not null default '{}',
    created_by uuid,
    created_at timestamptz not null default now()
);

alter table public.business_events enable row level security;
create policy "Users can view business events of their organization" on public.business_events
    for select using (organization_id = (select auth.jwt() ->> 'org_id')::uuid);

create table if not exists public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete cascade,
    table_name text not null,
    record_id uuid,
    action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
    old_data jsonb,
    new_data jsonb,
    performed_by uuid,
    performed_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;
create policy "Admins and managers can view audit logs" on public.audit_logs
    for select using (
        exists (
            select 1 from public.organization_members
            where organization_id = public.audit_logs.organization_id
              and user_id = auth.uid()
              and role in ('admin', 'manager')
        )
    );
