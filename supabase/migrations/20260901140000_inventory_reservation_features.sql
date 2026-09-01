begin;

-- Create a view for reservation details
create or replace view public.inventory_reservation_details as
select
  r.id as reservation_id,
  r.organization_id,
  r.product_id,
  r.warehouse_id,
  r.order_id,
  r.quantity,
  r.status as reservation_status,
  r.created_at as reserved_at,
  o.number as order_number,
  o.status as order_status,
  o.total as order_total,
  o.created_at as order_date,
  c.name as customer_name
from public.stock_reservations r
join public.orders o on o.id = r.order_id
left join public.customers c on c.id = o.customer_id
where r.status = 'active';

grant select on public.inventory_reservation_details to authenticated;

-- Create audit table for manual reallocation
create table if not exists public.stock_reservation_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reservation_id uuid not null references public.stock_reservations(id) on delete cascade,
  from_order_id uuid references public.orders(id) on delete set null,
  to_order_id uuid references public.orders(id) on delete set null,
  quantity numeric not null,
  reason text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.stock_reservation_audits enable row level security;
grant select on public.stock_reservation_audits to authenticated;

create policy reservation_audits_select on public.stock_reservation_audits for select to authenticated using (public.is_organization_member(organization_id));

-- RPC for reallocation
create or replace function public.inventory_reallocate_reservation(
  target_reservation_id uuid,
  new_order_id uuid,
  reallocation_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$$
declare
  res_record record;
  org_id uuid;
begin
  select * into res_record from public.stock_reservations where id = target_reservation_id and status = 'active' for update;
  if not found then
    raise exception 'RESERVATION_NOT_FOUND_OR_INACTIVE';
  end if;

  org_id := res_record.organization_id;

  if auth.uid() is null or not public.erp_can_manage_org(org_id) then
    raise exception 'INVENTORY_ACCESS_DENIED';
  end if;

  if reallocation_reason is null or length(trim(reallocation_reason)) < 5 then
    raise exception 'REALLOCATION_REASON_TOO_SHORT';
  end if;

  -- Record audit
  insert into public.stock_reservation_audits (
    organization_id,
    reservation_id,
    from_order_id,
    to_order_id,
    quantity,
    reason,
    created_by
  ) values (
    org_id,
    res_record.id,
    res_record.order_id,
    new_order_id,
    res_record.quantity,
    trim(reallocation_reason),
    auth.uid()
  );

  -- Update reservation
  update public.stock_reservations
  set order_id = new_order_id, updated_at = now()
  where id = target_reservation_id;
end;
$$$;

revoke all on function public.inventory_reallocate_reservation(uuid, uuid, text) from public, anon;
grant execute on function public.inventory_reallocate_reservation(uuid, uuid, text) to authenticated, service_role;

commit;
