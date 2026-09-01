begin;

-- 1. Enums and Tables
create type public.order_financial_status as enum (
  'not_generated',
  'generated',
  'partially_paid',
  'paid',
  'cancelled',
  'reversed'
);

alter table public.orders add column financial_status public.order_financial_status not null default 'not_generated';

create table public.organization_financial_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  receivable_generation_event text not null default 'order_invoiced',
  receivable_base_date text not null default 'invoiced_at',
  credit_limit_behavior text not null default 'warn',
  credit_exposure_scope text not null default 'receivables_only',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id)
);
alter table public.organization_financial_settings enable row level security;
create policy org_fin_set_org on public.organization_financial_settings for all to authenticated using (public.is_organization_member(organization_id));

create table public.financial_approval_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  approved_by uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  amount_approved numeric not null,
  created_at timestamptz not null default now()
);
alter table public.financial_approval_events enable row level security;
create policy fin_apprv_evts_org on public.financial_approval_events for all to authenticated using (public.is_organization_member(organization_id));

-- 2. Idempotency Index
create unique index unq_active_receivable_source
on public.accounts_receivable(organization_id, source_type, source_id)
where source_type = 'order' and status <> 'cancelled';

-- 3. RPC: Risk Calculation
create or replace function public.calculate_customer_financial_risk(p_org_id uuid, p_customer_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_metrics public.customer_financial_metrics%rowtype;
  v_policy public.financial_risk_policies%rowtype;
  v_factors jsonb := '[]'::jsonb;
  v_level text := 'regular';

  v_current_oldest_open_date date;
  v_current_max_delay int := 0;
begin
  select * into v_metrics from public.customer_financial_metrics where organization_id = p_org_id and customer_id = p_customer_id;
  select * into v_policy from public.financial_risk_policies where organization_id = p_org_id;

  if not found then
    return jsonb_build_object('level', 'regular', 'factors', '[]'::jsonb);
  end if;

  -- temporal reading for active delays
  select min(due_on) into v_current_oldest_open_date
  from public.receivable_installments i
  join public.accounts_receivable r on r.id = i.receivable_id
  where r.organization_id = p_org_id and r.customer_id = p_customer_id and i.status in ('open', 'partially_paid');

  if v_current_oldest_open_date is not null and v_current_oldest_open_date < current_date then
    v_current_max_delay := current_date - v_current_oldest_open_date;
  end if;

  if v_current_max_delay >= v_policy.critical_min_overdue_days then
    v_level := 'critical';
    v_factors := v_factors || jsonb_build_object('label', 'Título vencido há mais de ' || v_policy.critical_min_overdue_days || ' dias (' || v_current_max_delay || ' dias).');
  end if;

  if v_metrics.overdue_amount > 0 then
    if v_level = 'regular' then v_level := 'attention'; end if;
    v_factors := v_factors || jsonb_build_object('label', 'R$ ' || v_metrics.overdue_amount || ' atualmente vencidos.');
  end if;

  if v_metrics.late_installments >= v_policy.critical_late_installments then
    if v_level = 'regular' then v_level := 'critical'; end if;
    v_factors := v_factors || jsonb_build_object('label', v_metrics.late_installments || ' parcelas recentes tiveram atraso.');
  elsif v_metrics.late_installments >= v_policy.warning_late_installments then
    if v_level = 'regular' then v_level := 'attention'; end if;
    v_factors := v_factors || jsonb_build_object('label', v_metrics.late_installments || ' parcelas recentes tiveram atraso.');
  end if;

  if v_metrics.average_delay_days >= v_policy.warning_average_delay_days then
    if v_level = 'regular' then v_level := 'attention'; end if;
    v_factors := v_factors || jsonb_build_object('label', 'Atraso médio recente: ' || round(v_metrics.average_delay_days, 1) || ' dias.');
  end if;

  return jsonb_build_object('level', v_level, 'factors', v_factors);
end;
$$;

-- 4. RPC: Credit Exposure
create or replace function public.finance_get_customer_credit_exposure(
  p_org_id uuid, p_customer_id uuid, p_current_order_id uuid, p_new_amount numeric
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_cust public.customers%rowtype;
  v_open_recv numeric := 0;
  v_overdue_recv numeric := 0;
  v_proj numeric := 0;
  v_excess numeric := 0;
  v_has_recv_for_this_order boolean := false;
  v_risk jsonb;
begin
  select * into v_cust from public.customers where id = p_customer_id;
  if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;

  if p_current_order_id is not null then
    select exists(select 1 from public.accounts_receivable where source_type = 'order' and source_id = p_current_order_id and status <> 'cancelled')
    into v_has_recv_for_this_order;
  end if;

  select coalesce(sum(i.open_amount), 0), coalesce(sum(i.open_amount) filter (where i.due_on < current_date), 0)
  into v_open_recv, v_overdue_recv
  from public.receivable_installments i
  join public.accounts_receivable r on r.id = i.receivable_id
  where r.organization_id = p_org_id and r.customer_id = p_customer_id and i.status in ('open', 'partially_paid');

  v_proj := v_open_recv;
  if not v_has_recv_for_this_order then
    v_proj := v_proj + coalesce(p_new_amount, 0);
  end if;

  if v_cust.credit_limit is not null and v_proj > v_cust.credit_limit then
    v_excess := v_proj - v_cust.credit_limit;
  end if;

  v_risk := public.calculate_customer_financial_risk(p_org_id, p_customer_id);

  return jsonb_build_object(
    'credit_limit', v_cust.credit_limit,
    'open_receivables', v_open_recv,
    'overdue_receivables', v_overdue_recv,
    'current_order_amount', coalesce(p_new_amount, 0),
    'projected_exposure', v_proj,
    'excess_amount', v_excess,
    'risk', v_risk,
    'is_duplicate_avoided', v_has_recv_for_this_order
  );
end;
$$;

-- 5. RPC: Sync Status
create or replace function public.finance_sync_order_status(p_order_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_recv public.accounts_receivable%rowtype;
  v_new_status public.order_financial_status;
begin
  select * into v_recv from public.accounts_receivable where source_type = 'order' and source_id = p_order_id order by created_at desc limit 1;

  if not found then
    v_new_status := 'not_generated';
  elsif v_recv.status = 'cancelled' then
    v_new_status := 'cancelled';
  elsif v_recv.status = 'open' then
    v_new_status := 'generated';
  elsif v_recv.status = 'partially_paid' then
    v_new_status := 'partially_paid';
  elsif v_recv.status = 'paid' then
    v_new_status := 'paid';
  else
    v_new_status := 'generated';
  end if;

  update public.orders set financial_status = v_new_status where id = p_order_id;
end;
$$;

-- 6. RPC: Generate Receivable
create or replace function public.finance_generate_receivable_from_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_order public.orders%rowtype;
  v_settings public.organization_financial_settings%rowtype;
  v_term public.payment_terms%rowtype;
  v_recv_id uuid;
  v_total numeric;
  v_base_date date;

  v_inst_rec record;
  v_sum_generated numeric := 0;
  v_inst_amount numeric;
  v_count int;
  v_current int := 0;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  select * into v_settings from public.organization_financial_settings where organization_id = v_order.organization_id;
  if not found then
    insert into public.organization_financial_settings (organization_id) values (v_order.organization_id) returning * into v_settings;
  end if;

  select id into v_recv_id from public.accounts_receivable where source_type = 'order' and source_id = p_order_id and status <> 'cancelled';
  if found then return v_recv_id; end if;

  if v_order.payment_method_id is null or v_order.payment_term_id is null then
    raise exception 'PAYMENT_TERMS_MISSING';
  end if;

  select * into v_term from public.payment_terms where id = v_order.payment_term_id;

  v_total := v_order.total;
  if v_settings.receivable_base_date = 'invoiced_at' then
    v_base_date := coalesce((v_order.metadata->>'invoiced_at')::date, current_date);
  else
    v_base_date := v_order.created_at::date;
  end if;

  insert into public.accounts_receivable (
    organization_id, customer_id, source_type, source_id, document_number, description,
    original_amount, current_amount, payment_method_id, payment_term_id, status, issued_on, competence_date, created_by
  ) values (
    v_order.organization_id, v_order.customer_id, 'order', p_order_id, v_order.number::text, 'Faturamento Pedido ' || v_order.number,
    v_total, v_total, v_order.payment_method_id, v_term.id, 'open', v_base_date, v_base_date, auth.uid()
  ) returning id into v_recv_id;

  select count(*) into v_count from public.payment_term_installments where payment_term_id = v_term.id;

  for v_inst_rec in select * from public.payment_term_installments where payment_term_id = v_term.id order by installment_number
  loop
    v_current := v_current + 1;
    if v_current = v_count then
      v_inst_amount := v_total - v_sum_generated;
    else
      v_inst_amount := round((v_total * (v_inst_rec.percentage / 100))::numeric, 2);
      v_sum_generated := v_sum_generated + v_inst_amount;
    end if;

    insert into public.receivable_installments (
      organization_id, receivable_id, installment_number, original_amount, open_amount, due_on, status
    ) values (
      v_order.organization_id, v_recv_id, v_inst_rec.installment_number, v_inst_amount, v_inst_amount, v_base_date + v_inst_rec.days_after_origin, 'open'
    );
  end loop;

  perform public.finance_sync_order_status(p_order_id);

  insert into public.business_events (organization_id, event_type, entity_type, entity_id, actor_id, payload)
  values (v_order.organization_id, 'finance.receivable_generated_from_order', 'accounts_receivable', v_recv_id, auth.uid(),
    jsonb_build_object('order_id', p_order_id, 'amount', v_total, 'payment_term_id', v_term.id));

  return v_recv_id;
end;
$$;

-- 7. RPC: Cancel Receivable
create or replace function public.finance_cancel_receivable(p_receivable_id uuid, p_reason text)
returns void
language plpgsql
security definer
as $$
declare
  v_recv public.accounts_receivable%rowtype;
begin
  select * into v_recv from public.accounts_receivable where id = p_receivable_id for update;
  if not found then raise exception 'RECEIVABLE_NOT_FOUND'; end if;
  if v_recv.status = 'cancelled' then return; end if;

  if exists(select 1 from public.receivable_installments i join public.receivable_payments p on p.installment_id = i.id where i.receivable_id = p_receivable_id and p.reversal_of_id is null and p.amount > 0) then
    raise exception 'FINANCIAL_SETTLEMENT_EXISTS';
  end if;

  update public.receivable_installments set status = 'cancelled', open_amount = 0, updated_at = now() where receivable_id = p_receivable_id;
  update public.accounts_receivable set status = 'cancelled', updated_at = now() where id = p_receivable_id;

  if v_recv.source_type = 'order' and v_recv.source_id is not null then
    perform public.finance_sync_order_status(v_recv.source_id);
  end if;

  insert into public.business_events (organization_id, event_type, entity_type, entity_id, actor_id, payload)
  values (v_recv.organization_id, 'finance.receivable_cancelled', 'accounts_receivable', p_receivable_id, auth.uid(), jsonb_build_object('reason', p_reason));

  perform public.finance_recalculate_customer_metrics(v_recv.organization_id, v_recv.customer_id);
end;
$$;

commit;
