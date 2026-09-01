begin;

-- 1. Add promised_date to orders
alter table public.orders
add column if not exists promised_date timestamptz;

-- 2. Create inventory_priority_policies
create table if not exists public.inventory_priority_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  enabled boolean not null default true,

  fifo_weight numeric not null default 20,
  promised_date_weight numeric not null default 25,
  order_value_weight numeric not null default 10,
  customer_relationship_weight numeric not null default 15,
  customer_revenue_weight numeric not null default 20,
  strategic_customer_weight numeric not null default 10,
  financial_risk_weight numeric not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id)
);

alter table public.inventory_priority_policies enable row level security;
grant select, insert, update on public.inventory_priority_policies to authenticated;
create policy priority_policies_select on public.inventory_priority_policies for select to authenticated using (public.is_organization_member(organization_id));
create policy priority_policies_update on public.inventory_priority_policies for update to authenticated using (public.is_organization_member(organization_id));
create policy priority_policies_insert on public.inventory_priority_policies for insert to authenticated with check (public.is_organization_member(organization_id));

-- Trigger to auto-create policy on new organization? We can just insert it if missing in RPC.

-- 3. Create customer_priority_overrides
create type public.customer_priority_level as enum ('normal', 'high', 'critical');

create table if not exists public.customer_priority_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,

  priority_level public.customer_priority_level not null default 'normal',
  reason text,

  starts_at timestamptz not null default now(),
  expires_at timestamptz,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, customer_id)
);

alter table public.customer_priority_overrides enable row level security;
grant select, insert, update, delete on public.customer_priority_overrides to authenticated;
create policy priority_overrides_select on public.customer_priority_overrides for select to authenticated using (public.is_organization_member(organization_id));
create policy priority_overrides_all on public.customer_priority_overrides for all to authenticated using (public.is_organization_member(organization_id));

-- 4. Alter stock_reservation_audits
alter table public.stock_reservation_audits
add column if not exists source_priority_score numeric,
add column if not exists target_priority_score numeric,
add column if not exists priority_policy_snapshot jsonb;

-- 5. Create customer_commercial_metrics view
create or replace view public.customer_commercial_metrics as
select
  customer_id,
  organization_id,
  min(created_at) as customer_since,
  count(id) filter (where status in ('approved', 'invoiced', 'completed')) as orders_count,
  coalesce(sum(total) filter (where status in ('approved', 'invoiced', 'completed')), 0) as lifetime_revenue,
  coalesce(sum(total) filter (where status in ('approved', 'invoiced', 'completed') and created_at >= now() - interval '365 days'), 0) as revenue_365d,
  coalesce(sum(total) filter (where status in ('approved', 'invoiced', 'completed') and created_at >= now() - interval '90 days'), 0) as revenue_90d,
  coalesce(avg(total) filter (where status in ('approved', 'invoiced', 'completed')), 0) as average_ticket,
  max(created_at) as last_order_at
from public.orders
group by customer_id, organization_id;

grant select on public.customer_commercial_metrics to authenticated;

-- 6. Create RPC calculate_order_service_priority
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

  -- variables for factor calculations
  v_days_old numeric;
  v_fifo_points numeric := 0;

  v_days_until_promised numeric;
  v_promised_points numeric := 0;

  v_order_value_points numeric := 0;

  v_relationship_years numeric;
  v_relationship_points numeric := 0;

  v_revenue_points numeric := 0;

  v_strategic_points numeric := 0;

  v_financial_points numeric := 0; -- currently always 100 or neutral since weight is 0

  v_level text;
begin
  -- 1. Load context
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  -- ensure policy exists
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

  -- 2. Calculate sum of active weights
  v_total_weight := v_policy.fifo_weight + v_policy.promised_date_weight + v_policy.order_value_weight +
                    v_policy.customer_relationship_weight + v_policy.customer_revenue_weight +
                    v_policy.strategic_customer_weight + v_policy.financial_risk_weight;

  if v_total_weight <= 0 then
    -- Fallback to default weights if everything is 0
    v_total_weight := 100;
    v_policy.fifo_weight := 100;
  end if;

  -- 3. Calculate Factors (0 to 100 each)

  -- 3.1 FIFO (older orders get higher points. e.g., 30 days old = 100, 0 days old = 0)
  v_days_old := extract(epoch from (now() - v_order.created_at)) / 86400;
  v_fifo_points := least(100, greatest(0, (v_days_old / 30) * 100));
  if v_policy.fifo_weight > 0 then
    v_final_score := v_final_score + (v_fifo_points * v_policy.fifo_weight / v_total_weight);
    v_factors := v_factors || jsonb_build_object('code', 'fifo', 'label', 'Ordem de chegada (' || round(v_days_old, 1) || ' dias)', 'points', round(v_fifo_points, 1));
  end if;

  -- 3.2 Promised Date (closer promised date = higher points. e.g., overdue = 100, >30 days away = 0)
  if v_order.promised_date is not null then
    v_days_until_promised := extract(epoch from (v_order.promised_date - now())) / 86400;
    -- if negative (overdue), 100. If 30 days, 0.
    v_promised_points := least(100, greatest(0, ((30 - v_days_until_promised) / 30) * 100));
    if v_policy.promised_date_weight > 0 then
      v_final_score := v_final_score + (v_promised_points * v_policy.promised_date_weight / v_total_weight);
      v_factors := v_factors || jsonb_build_object('code', 'promised_date', 'label', 'Data prometida (' || to_char(v_order.promised_date, 'DD/MM/YYYY') || ')', 'points', round(v_promised_points, 1));
    end if;
  end if;

  -- 3.3 Order Value (max 100k = 100 points)
  v_order_value_points := least(100, greatest(0, (v_order.total / 100000) * 100));
  if v_policy.order_value_weight > 0 then
    v_final_score := v_final_score + (v_order_value_points * v_policy.order_value_weight / v_total_weight);
    v_factors := v_factors || jsonb_build_object('code', 'order_value', 'label', 'Valor do pedido', 'points', round(v_order_value_points, 1));
  end if;

  -- 3.4 Customer Relationship (max 5 years = 100 points)
  if v_metrics.customer_since is not null then
    v_relationship_years := extract(epoch from (now() - v_metrics.customer_since)) / 31536000;
    v_relationship_points := least(100, greatest(0, (v_relationship_years / 5) * 100));
    if v_policy.customer_relationship_weight > 0 then
      v_final_score := v_final_score + (v_relationship_points * v_policy.customer_relationship_weight / v_total_weight);
      v_factors := v_factors || jsonb_build_object('code', 'customer_relationship', 'label', 'Relacionamento (' || round(v_relationship_years, 1) || ' anos)', 'points', round(v_relationship_points, 1));
    end if;
  end if;

  -- 3.5 Customer Revenue (max 500k = 100 points)
  if v_metrics.lifetime_revenue is not null then
    v_revenue_points := least(100, greatest(0, (v_metrics.lifetime_revenue / 500000) * 100));
    if v_policy.customer_revenue_weight > 0 then
      v_final_score := v_final_score + (v_revenue_points * v_policy.customer_revenue_weight / v_total_weight);
      v_factors := v_factors || jsonb_build_object('code', 'customer_revenue', 'label', 'Receita histórica', 'points', round(v_revenue_points, 1));
    end if;
  end if;

  -- 3.6 Strategic Override
  if v_override.priority_level is not null then
    if v_override.priority_level = 'critical' then v_strategic_points := 100;
    elsif v_override.priority_level = 'high' then v_strategic_points := 75;
    else v_strategic_points := 50; end if;

    if v_policy.strategic_customer_weight > 0 then
      v_final_score := v_final_score + (v_strategic_points * v_policy.strategic_customer_weight / v_total_weight);
      v_factors := v_factors || jsonb_build_object('code', 'strategic_customer', 'label', 'Cliente Estratégico (' || v_override.priority_level || ')', 'points', round(v_strategic_points, 1));
    end if;
  end if;

  -- 3.7 Financial Risk (currently weight is 0, so neutral)
  v_financial_points := 100; -- Assume good standing until implemented
  if v_policy.financial_risk_weight > 0 then
    v_final_score := v_final_score + (v_financial_points * v_policy.financial_risk_weight / v_total_weight);
    v_factors := v_factors || jsonb_build_object('code', 'financial_risk', 'label', 'Risco Financeiro (Bom)', 'points', round(v_financial_points, 1));
  end if;

  -- 4. Level Classification
  if v_final_score >= 80 then v_level := 'critical';
  elsif v_final_score >= 60 then v_level := 'high';
  elsif v_final_score >= 35 then v_level := 'normal';
  else v_level := 'low'; end if;

  return jsonb_build_object(
    'score', round(v_final_score, 1),
    'level', v_level,
    'factors', v_factors,
    'policy_snapshot', jsonb_build_object(
      'fifo_weight', v_policy.fifo_weight,
      'promised_date_weight', v_policy.promised_date_weight,
      'order_value_weight', v_policy.order_value_weight,
      'customer_relationship_weight', v_policy.customer_relationship_weight,
      'customer_revenue_weight', v_policy.customer_revenue_weight,
      'strategic_customer_weight', v_policy.strategic_customer_weight,
      'financial_risk_weight', v_policy.financial_risk_weight
    )
  );
end;
$$;
revoke all on function public.calculate_order_service_priority(uuid) from public, anon;
grant execute on function public.calculate_order_service_priority(uuid) to authenticated, service_role;

commit;
