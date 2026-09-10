begin;

-- Internal/trigger functions still need an immutable name resolution path.
alter function public.refresh_customer_commercial_metrics(uuid, uuid)
  set search_path = '';
alter function public.trg_refresh_customer_metrics()
  set search_path = '';
alter function public.finance_recalculate_customer_metrics(uuid, uuid)
  set search_path = '';
alter function public.calculate_customer_financial_risk(uuid, uuid)
  set search_path = '';
alter function public.finance_sync_order_status(uuid)
  set search_path = '';
alter function public.customer_check_operation_allowed(uuid, uuid, public.restriction_scope)
  set search_path = '';

revoke all on function public.refresh_customer_commercial_metrics(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.trg_refresh_customer_metrics()
  from public, anon, authenticated;
revoke all on function public.finance_recalculate_customer_metrics(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.calculate_customer_financial_risk(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.finance_sync_order_status(uuid)
  from public, anon, authenticated;
revoke all on function public.customer_check_operation_allowed(uuid, uuid, public.restriction_scope)
  from public, anon, authenticated;

create or replace function public.finance_get_customer_credit_exposure(
  p_org_id uuid,
  p_customer_id uuid,
  p_current_order_id uuid,
  p_new_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers%rowtype;
  v_open_receivables numeric := 0;
  v_overdue_receivables numeric := 0;
  v_projected_exposure numeric := 0;
  v_excess_amount numeric := 0;
  v_has_receivable_for_order boolean := false;
  v_risk jsonb;
begin
  if not public.has_organization_role(p_org_id, array['admin', 'manager']) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if p_customer_id is null
    or p_new_amount is null
    or p_new_amount < 0
    or p_new_amount > 999999999999 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select c.*
    into v_customer
  from public.customers c
  where c.id = p_customer_id
    and c.organization_id = p_org_id;

  if not found then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;

  if p_current_order_id is not null then
    perform 1
    from public.orders o
    where o.id = p_current_order_id
      and o.organization_id = p_org_id
      and o.customer_id = p_customer_id;

    if not found then
      raise exception 'order_not_found' using errcode = 'P0002';
    end if;

    select exists (
      select 1
      from public.accounts_receivable ar
      where ar.organization_id = p_org_id
        and ar.customer_id = p_customer_id
        and ar.source_type = 'order'
        and ar.source_id = p_current_order_id
        and ar.status <> 'cancelled'
    ) into v_has_receivable_for_order;
  end if;

  select
    coalesce(sum(ri.open_amount), 0),
    coalesce(sum(ri.open_amount) filter (where ri.due_on < current_date), 0)
    into v_open_receivables, v_overdue_receivables
  from public.receivable_installments ri
  join public.accounts_receivable ar on ar.id = ri.receivable_id
  where ar.organization_id = p_org_id
    and ar.customer_id = p_customer_id
    and ri.status in ('open', 'partially_paid');

  v_projected_exposure := v_open_receivables;
  if not v_has_receivable_for_order then
    v_projected_exposure := v_projected_exposure + p_new_amount;
  end if;

  if v_customer.credit_limit is not null
    and v_projected_exposure > v_customer.credit_limit then
    v_excess_amount := v_projected_exposure - v_customer.credit_limit;
  end if;

  v_risk := public.calculate_customer_financial_risk(p_org_id, p_customer_id);

  return jsonb_build_object(
    'credit_limit', v_customer.credit_limit,
    'open_receivables', v_open_receivables,
    'overdue_receivables', v_overdue_receivables,
    'current_order_amount', p_new_amount,
    'projected_exposure', v_projected_exposure,
    'excess_amount', v_excess_amount,
    'risk', v_risk,
    'is_duplicate_avoided', v_has_receivable_for_order
  );
end;
$$;

create or replace function public.finance_cancel_receivable(
  p_receivable_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receivable public.accounts_receivable;
begin
  if p_receivable_id is null
    or p_reason is null
    or char_length(btrim(p_reason)) not between 5 and 500
    or p_reason ~ '[[:cntrl:]]' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select *
    into v_receivable
  from public.accounts_receivable ar
  where ar.id = p_receivable_id
  for update;

  if not found then
    raise exception 'receivable_not_found' using errcode = 'P0002';
  end if;

  if not public.has_organization_role(
    v_receivable.organization_id,
    array['admin', 'manager']
  ) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if v_receivable.status = 'cancelled' then
    return;
  end if;

  if exists (
    select 1
    from public.receivable_installments ri
    join public.receivable_payments rp on rp.installment_id = ri.id
    where ri.receivable_id = p_receivable_id
      and rp.reversal_of_id is null
      and rp.amount > 0
  ) then
    raise exception 'financial_settlement_exists' using errcode = '23514';
  end if;

  update public.receivable_installments
  set status = 'cancelled', open_amount = 0, updated_at = now()
  where receivable_id = p_receivable_id;

  update public.accounts_receivable
  set status = 'cancelled', updated_at = now()
  where id = p_receivable_id;

  if v_receivable.source_type = 'order' and v_receivable.source_id is not null then
    perform public.finance_sync_order_status(v_receivable.source_id);
  end if;

  insert into public.business_events (
    organization_id, event_type, entity_type, entity_id, actor_id, payload
  ) values (
    v_receivable.organization_id,
    'finance.receivable_cancelled',
    'accounts_receivable',
    p_receivable_id,
    auth.uid(),
    jsonb_build_object('reason', btrim(p_reason))
  );

  perform public.finance_recalculate_customer_metrics(
    v_receivable.organization_id,
    v_receivable.customer_id
  );
end;
$$;

revoke all on function public.finance_get_customer_credit_exposure(uuid, uuid, uuid, numeric)
  from public, anon, authenticated;
revoke all on function public.finance_cancel_receivable(uuid, text)
  from public, anon, authenticated;

grant execute on function public.finance_get_customer_credit_exposure(uuid, uuid, uuid, numeric)
  to authenticated;
grant execute on function public.finance_cancel_receivable(uuid, text)
  to authenticated;

commit;
