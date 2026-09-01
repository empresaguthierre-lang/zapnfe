begin;

-- 1. Replace view with table for customer_commercial_metrics
drop view if exists public.customer_commercial_metrics;

create table public.customer_commercial_metrics (
  customer_id uuid not null references public.customers(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,

  customer_since timestamptz,
  orders_count integer not null default 0,
  lifetime_revenue numeric not null default 0,
  revenue_365d numeric not null default 0,
  revenue_90d numeric not null default 0,
  average_ticket numeric not null default 0,
  last_order_at timestamptz,

  updated_at timestamptz not null default now(),

  primary key (organization_id, customer_id)
);

alter table public.customer_commercial_metrics enable row level security;
grant select on public.customer_commercial_metrics to authenticated;
create policy metrics_select on public.customer_commercial_metrics for select to authenticated using (public.is_organization_member(organization_id));

-- Function to refresh customer metrics asynchronously or via trigger
create or replace function public.refresh_customer_commercial_metrics(p_customer_id uuid, p_org_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_count int;
  v_lifetime numeric;
  v_avg numeric;
  v_first timestamptz;
  v_last timestamptz;
  v_r365 numeric;
  v_r90 numeric;
begin
  select
    count(id), coalesce(sum(total), 0), coalesce(avg(total), 0), min(created_at), max(created_at)
  into v_count, v_lifetime, v_avg, v_first, v_last
  from public.orders
  where customer_id = p_customer_id and organization_id = p_org_id and status in ('approved', 'invoiced', 'completed');

  select coalesce(sum(total), 0) into v_r365
  from public.orders
  where customer_id = p_customer_id and organization_id = p_org_id and status in ('approved', 'invoiced', 'completed')
  and created_at >= now() - interval '365 days';

  select coalesce(sum(total), 0) into v_r90
  from public.orders
  where customer_id = p_customer_id and organization_id = p_org_id and status in ('approved', 'invoiced', 'completed')
  and created_at >= now() - interval '90 days';

  insert into public.customer_commercial_metrics (
    customer_id, organization_id, customer_since, orders_count, lifetime_revenue, revenue_365d, revenue_90d, average_ticket, last_order_at, updated_at
  ) values (
    p_customer_id, p_org_id, v_first, v_count, v_lifetime, v_r365, v_r90, v_avg, v_last, now()
  ) on conflict (organization_id, customer_id) do update set
    customer_since = excluded.customer_since,
    orders_count = excluded.orders_count,
    lifetime_revenue = excluded.lifetime_revenue,
    revenue_365d = excluded.revenue_365d,
    revenue_90d = excluded.revenue_90d,
    average_ticket = excluded.average_ticket,
    last_order_at = excluded.last_order_at,
    updated_at = now();
end;
$$;

create or replace function public.trg_refresh_customer_metrics()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.status in ('approved', 'invoiced', 'completed') then
      perform public.refresh_customer_commercial_metrics(NEW.customer_id, NEW.organization_id);
    end if;
  elsif TG_OP = 'UPDATE' then
    if NEW.status is distinct from OLD.status or NEW.total is distinct from OLD.total then
      perform public.refresh_customer_commercial_metrics(NEW.customer_id, NEW.organization_id);
    end if;
  elsif TG_OP = 'DELETE' then
    perform public.refresh_customer_commercial_metrics(OLD.customer_id, OLD.organization_id);
  end if;
  return null;
end;
$$;

drop trigger if exists on_order_status_change_metrics on public.orders;
create trigger on_order_status_change_metrics
after insert or update or delete on public.orders
for each row execute function public.trg_refresh_customer_metrics();

do $$
declare
  r record;
begin
  for r in select distinct customer_id, organization_id from public.orders loop
    perform public.refresh_customer_commercial_metrics(r.customer_id, r.organization_id);
  end loop;
end;
$$;

-- 2. Modify calculate_order_service_priority to output engine_version inside snapshot
create or replace function public.calculate_order_service_priority(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_policy public.inventory_priority_policies%rowtype;
  v_override public.customer_priority_overrides%rowtype;
  v_metrics public.customer_commercial_metrics%rowtype;

  v_total_weight numeric := 0;
  v_final_score numeric := 0;
  v_factors jsonb := '[]'::jsonb;
  v_days_old numeric;
  v_fifo_points numeric := 0;
  v_days_until_promised numeric;
  v_promised_points numeric := 0;
  v_order_value_points numeric := 0;
  v_relationship_years numeric;
  v_relationship_points numeric := 0;
  v_revenue_points numeric := 0;
  v_strategic_points numeric := 0;
  v_financial_points numeric := 0;
  v_level text;
  v_engine_version int := 1;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  select * into v_policy from public.inventory_priority_policies where organization_id = v_order.organization_id;
  if not found then
    insert into public.inventory_priority_policies (organization_id) values (v_order.organization_id) returning * into v_policy;
  end if;

  select * into v_override from public.customer_priority_overrides
  where customer_id = v_order.customer_id
    and organization_id = v_order.organization_id
    and starts_at <= now()
    and (expires_at is null or expires_at > now());

  select * into v_metrics from public.customer_commercial_metrics
  where customer_id = v_order.customer_id
    and organization_id = v_order.organization_id;

  v_total_weight := v_policy.fifo_weight + v_policy.promised_date_weight + v_policy.order_value_weight +
                    v_policy.customer_relationship_weight + v_policy.customer_revenue_weight +
                    v_policy.strategic_customer_weight + v_policy.financial_risk_weight;

  if v_total_weight <= 0 then
    v_total_weight := 100;
    v_policy.fifo_weight := 100;
  end if;

  v_days_old := extract(epoch from (now() - v_order.created_at)) / 86400;
  v_fifo_points := least(100, greatest(0, (v_days_old / 30) * 100));
  if v_policy.fifo_weight > 0 then
    v_final_score := v_final_score + (v_fifo_points * v_policy.fifo_weight / v_total_weight);
    v_factors := v_factors || jsonb_build_object('code', 'fifo', 'label', 'Criado há ' || round(v_days_old, 0) || ' dias', 'points', round(v_fifo_points, 1));
  end if;

  if v_order.promised_date is not null then
    v_days_until_promised := extract(epoch from (v_order.promised_date - now())) / 86400;
    v_promised_points := least(100, greatest(0, ((30 - v_days_until_promised) / 30) * 100));
    if v_policy.promised_date_weight > 0 then
      v_final_score := v_final_score + (v_promised_points * v_policy.promised_date_weight / v_total_weight);
      v_factors := v_factors || jsonb_build_object('code', 'promised_date', 'label', 'Entrega em ' || to_char(v_order.promised_date, 'DD/MM/YYYY'), 'points', round(v_promised_points, 1));
    end if;
  end if;

  v_order_value_points := least(100, greatest(0, (v_order.total / 100000) * 100));
  if v_policy.order_value_weight > 0 then
    v_final_score := v_final_score + (v_order_value_points * v_policy.order_value_weight / v_total_weight);
    v_factors := v_factors || jsonb_build_object('code', 'order_value', 'label', 'Pedido de R$ ' || round(v_order.total, 2), 'points', round(v_order_value_points, 1));
  end if;

  if v_metrics.customer_since is not null then
    v_relationship_years := extract(epoch from (now() - v_metrics.customer_since)) / 31536000;
    v_relationship_points := least(100, greatest(0, (v_relationship_years / 5) * 100));
    if v_policy.customer_relationship_weight > 0 then
      v_final_score := v_final_score + (v_relationship_points * v_policy.customer_relationship_weight / v_total_weight);
      v_factors := v_factors || jsonb_build_object('code', 'customer_relationship', 'label', 'Cliente há ' || round(v_relationship_years, 1) || ' anos', 'points', round(v_relationship_points, 1));
    end if;
  end if;

  if v_metrics.lifetime_revenue is not null then
    v_revenue_points := least(100, greatest(0, (v_metrics.lifetime_revenue / 500000) * 100));
    if v_policy.customer_revenue_weight > 0 then
      v_final_score := v_final_score + (v_revenue_points * v_policy.customer_revenue_weight / v_total_weight);
      v_factors := v_factors || jsonb_build_object('code', 'customer_revenue', 'label', 'R$ ' || round(v_metrics.lifetime_revenue, 2) || ' comprados em histórico', 'points', round(v_revenue_points, 1));
    end if;
  end if;

  if v_override is not null and v_override.priority_level is not null then
    if v_override.priority_level = 'critical' then v_strategic_points := 100;
    elsif v_override.priority_level = 'high' then v_strategic_points := 75;
    else v_strategic_points := 50; end if;

    if v_policy.strategic_customer_weight > 0 then
      v_final_score := v_final_score + (v_strategic_points * v_policy.strategic_customer_weight / v_total_weight);
      v_factors := v_factors || jsonb_build_object('code', 'strategic_customer', 'label', 'Cliente Estratégico', 'points', round(v_strategic_points, 1));
    end if;
  end if;

  v_financial_points := 100;
  if v_policy.financial_risk_weight > 0 then
    v_final_score := v_final_score + (v_financial_points * v_policy.financial_risk_weight / v_total_weight);
    v_factors := v_factors || jsonb_build_object('code', 'financial_risk', 'label', 'Risco Financeiro (Bom)', 'points', round(v_financial_points, 1));
  end if;

  if v_final_score >= 80 then v_level := 'critical';
  elsif v_final_score >= 60 then v_level := 'high';
  elsif v_final_score >= 35 then v_level := 'normal';
  else v_level := 'low'; end if;

  return jsonb_build_object(
    'score', round(v_final_score, 1),
    'level', v_level,
    'factors', v_factors,
    'policy_snapshot', jsonb_build_object(
      'engine_version', v_engine_version,
      'weights', jsonb_build_object(
        'fifo', v_policy.fifo_weight,
        'promised_date', v_policy.promised_date_weight,
        'order_value', v_policy.order_value_weight,
        'customer_relationship', v_policy.customer_relationship_weight,
        'customer_revenue', v_policy.customer_revenue_weight,
        'strategic_customer', v_policy.strategic_customer_weight,
        'financial_risk', v_policy.financial_risk_weight
      )
    )
  );
end;
$$;

-- 3. Modify inventory_reallocate_reservation to discard frontend arguments and calculate them internally
drop function if exists public.inventory_reallocate_reservation(uuid, uuid, numeric, text, numeric, numeric, jsonb);

create or replace function public.inventory_reallocate_reservation(
  source_reservation_id uuid,
  target_order_item_id uuid,
  reallocate_quantity numeric,
  reallocation_reason text
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

  v_source_priority_data jsonb;
  v_target_priority_data jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if reallocate_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;
  if length(trim(coalesce(reallocation_reason, ''))) < 5 then raise exception 'REASON_TOO_SHORT'; end if;

  select * into v_source_res from public.stock_reservations where id = source_reservation_id and status = 'active' for update;
  if not found then raise exception 'SOURCE_RESERVATION_NOT_FOUND_OR_INACTIVE'; end if;
  if not public.is_organization_member(v_source_res.organization_id) then raise exception 'ACCESS_DENIED'; end if;
  if reallocate_quantity > v_source_res.quantity then raise exception 'QUANTITY_EXCEEDS_RESERVATION'; end if;

  select * into v_source_item from public.order_items where id = v_source_res.source_id for update;
  select * into v_source_order from public.orders where id = v_source_item.order_id for update;

  select * into v_target_item from public.order_items where id = target_order_item_id for update;
  if not found then raise exception 'TARGET_ITEM_NOT_FOUND'; end if;
  if v_target_item.product_id != v_source_res.product_id then raise exception 'PRODUCT_MISMATCH'; end if;

  select * into v_target_order from public.orders where id = v_target_item.order_id for update;
  if v_target_order.organization_id != v_source_res.organization_id then raise exception 'ORGANIZATION_MISMATCH'; end if;
  if v_target_order.status not in ('review', 'approved') then raise exception 'TARGET_ORDER_LOCKED'; end if;

  -- Calculate Scores & Engine Snapshot INSIDE the locked transaction!
  v_source_priority_data := public.calculate_order_service_priority(v_source_order.id);
  v_target_priority_data := public.calculate_order_service_priority(v_target_order.id);

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
    (v_source_priority_data->>'score')::numeric,
    (v_target_priority_data->>'score')::numeric,
    v_source_priority_data->'policy_snapshot'
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
revoke all on function public.inventory_reallocate_reservation(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.inventory_reallocate_reservation(uuid, uuid, numeric, text) to authenticated, service_role;

commit;
