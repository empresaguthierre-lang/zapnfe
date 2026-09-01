begin;

-- 4. RPCs Financeiras
create or replace function public.finance_recalculate_customer_metrics(p_org_id uuid, p_customer_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_total_original numeric := 0;
  v_total_received numeric := 0;
  v_open numeric := 0;
  v_overdue numeric := 0;
  v_count int := 0;
  v_paid int := 0;
  v_late int := 0;
  v_on_time int := 0;
  v_avg_delay numeric := 0;
  v_max_delay int := 0;
  v_avg_delay_3 numeric := 0;
  v_avg_delay_6 numeric := 0;
  v_oldest date;
  v_last_payment timestamptz;
begin
  -- aggregate all installments for the customer
  select
    count(i.id),
    coalesce(sum(i.original_amount), 0),
    coalesce(sum(i.original_amount - i.open_amount), 0),
    coalesce(sum(i.open_amount), 0),
    coalesce(sum(i.open_amount) filter (where i.due_on < current_date and i.status in ('open', 'partially_paid')), 0),
    min(i.due_on) filter (where i.due_on < current_date and i.status in ('open', 'partially_paid')),
    count(i.id) filter (where i.status = 'paid')
  into v_count, v_total_original, v_total_received, v_open, v_overdue, v_oldest, v_paid
  from public.receivable_installments i
  join public.accounts_receivable r on r.id = i.receivable_id
  where r.organization_id = p_org_id and r.customer_id = p_customer_id;

  -- delay calculations (simplified for MVP: delay = max(0, paid_at_date - due_on))
  -- A paid installment might have multiple payments. We take the max paid_at for the installment.
  with inst_delays as (
    select i.id, i.due_on, max(p.paid_at)::date as last_paid_date,
           greatest(0, max(p.paid_at)::date - i.due_on) as delay_days
    from public.receivable_installments i
    join public.accounts_receivable r on r.id = i.receivable_id
    join public.receivable_payments p on p.installment_id = i.id
    where r.organization_id = p_org_id and r.customer_id = p_customer_id and p.reversal_of_id is null
    group by i.id, i.due_on
  )
  select
    count(*) filter (where delay_days > 0),
    count(*) filter (where delay_days = 0),
    coalesce(avg(delay_days), 0),
    coalesce(max(delay_days), 0)
  into v_late, v_on_time, v_avg_delay, v_max_delay
  from inst_delays;

  select max(paid_at) into v_last_payment
  from public.receivable_payments p
  join public.accounts_receivable r on r.id = p.receivable_id
  where r.organization_id = p_org_id and r.customer_id = p_customer_id and p.reversal_of_id is null;

  insert into public.customer_financial_metrics (
    organization_id, customer_id, total_original_amount, total_received_amount, open_amount, overdue_amount,
    installments_count, paid_installments, late_installments, on_time_installments,
    on_time_rate, average_delay_days, max_delay_days, oldest_overdue_on, last_payment_at, last_recalculated_at
  ) values (
    p_org_id, p_customer_id, v_total_original, v_total_received, v_open, v_overdue,
    v_count, v_paid, v_late, v_on_time,
    case when v_paid > 0 then (v_on_time::numeric / v_paid::numeric) * 100 else 0 end,
    v_avg_delay, v_max_delay, v_oldest, v_last_payment, now()
  ) on conflict (organization_id, customer_id) do update set
    total_original_amount = excluded.total_original_amount,
    total_received_amount = excluded.total_received_amount,
    open_amount = excluded.open_amount,
    overdue_amount = excluded.overdue_amount,
    installments_count = excluded.installments_count,
    paid_installments = excluded.paid_installments,
    late_installments = excluded.late_installments,
    on_time_installments = excluded.on_time_installments,
    on_time_rate = excluded.on_time_rate,
    average_delay_days = excluded.average_delay_days,
    max_delay_days = excluded.max_delay_days,
    oldest_overdue_on = excluded.oldest_overdue_on,
    last_payment_at = excluded.last_payment_at,
    last_recalculated_at = now();
end;
$$;


create or replace function public.finance_create_receivable(
  p_org_id uuid,
  p_branch_id uuid,
  p_customer_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_document_number text,
  p_description text,
  p_original_amount numeric,
  p_issued_on date,
  p_competence_date date,
  p_installments jsonb -- array of { installment_number, amount, due_on }
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_receivable_id uuid;
  v_inst jsonb;
begin
  if not public.is_organization_member(p_org_id) then raise exception 'ACCESS_DENIED'; end if;

  insert into public.accounts_receivable (
    organization_id, branch_id, customer_id, source_type, source_id, document_number,
    description, original_amount, current_amount, status, issued_on, competence_date
  ) values (
    p_org_id, p_branch_id, p_customer_id, p_source_type, p_source_id, p_document_number,
    p_description, p_original_amount, p_original_amount, 'open', p_issued_on, p_competence_date
  ) returning id into v_receivable_id;

  for v_inst in select * from jsonb_array_elements(p_installments)
  loop
    insert into public.receivable_installments (
      organization_id, receivable_id, installment_number, original_amount, open_amount, due_on, status
    ) values (
      p_org_id, v_receivable_id,
      (v_inst->>'installment_number')::int,
      (v_inst->>'amount')::numeric,
      (v_inst->>'amount')::numeric,
      (v_inst->>'due_on')::date,
      'open'
    );
  end loop;

  insert into public.business_events (organization_id, event_type, entity_type, entity_id, actor_id, payload)
  values (p_org_id, 'finance.receivable_created', 'accounts_receivable', v_receivable_id, auth.uid(), jsonb_build_object('amount', p_original_amount));

  perform public.finance_recalculate_customer_metrics(p_org_id, p_customer_id);

  return v_receivable_id;
end;
$$;


create or replace function public.finance_register_payment(
  p_org_id uuid,
  p_branch_id uuid,
  p_installment_id uuid,
  p_bank_account_id uuid,
  p_payment_method_id uuid,
  p_principal numeric,
  p_interest numeric,
  p_penalty numeric,
  p_discount numeric,
  p_paid_at timestamptz,
  p_reference text,
  p_notes text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_inst public.receivable_installments%rowtype;
  v_recv public.accounts_receivable%rowtype;
  v_total_amount numeric;
  v_payment_id uuid;
begin
  if not public.is_organization_member(p_org_id) then raise exception 'ACCESS_DENIED'; end if;

  select * into v_inst from public.receivable_installments where id = p_installment_id for update;
  if not found then raise exception 'INSTALLMENT_NOT_FOUND'; end if;
  if v_inst.organization_id != p_org_id then raise exception 'ORG_MISMATCH'; end if;

  select * into v_recv from public.accounts_receivable where id = v_inst.receivable_id for update;

  if p_principal > v_inst.open_amount then
    raise exception 'PAYMENT_EXCEEDS_OPEN_AMOUNT';
  end if;

  v_total_amount := p_principal + p_interest + p_penalty - p_discount;

  insert into public.receivable_payments (
    organization_id, branch_id, receivable_id, installment_id, bank_account_id, payment_method_id,
    amount, principal_amount, interest_amount, penalty_amount, discount_amount, paid_at, reference, notes, created_by
  ) values (
    p_org_id, p_branch_id, v_recv.id, v_inst.id, p_bank_account_id, p_payment_method_id,
    v_total_amount, p_principal, p_interest, p_penalty, p_discount, p_paid_at, p_reference, p_notes, auth.uid()
  ) returning id into v_payment_id;

  update public.receivable_installments set
    open_amount = open_amount - p_principal,
    status = case when open_amount - p_principal <= 0 then 'paid'::public.receivable_status else 'partially_paid'::public.receivable_status end,
    updated_at = now()
  where id = v_inst.id;

  -- update receivable status if all installments paid
  if not exists (select 1 from public.receivable_installments where receivable_id = v_recv.id and open_amount > 0) then
    update public.accounts_receivable set status = 'paid', updated_at = now() where id = v_recv.id;
  else
    update public.accounts_receivable set status = 'partially_paid', updated_at = now() where id = v_recv.id;
  end if;

  insert into public.business_events (organization_id, event_type, entity_type, entity_id, actor_id, payload)
  values (p_org_id, 'finance.payment_received', 'receivable_payments', v_payment_id, auth.uid(), jsonb_build_object('principal', p_principal));

  perform public.finance_recalculate_customer_metrics(p_org_id, v_recv.customer_id);

  return v_payment_id;
end;
$$;


create or replace function public.finance_reverse_payment(
  p_org_id uuid,
  p_payment_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_orig public.receivable_payments%rowtype;
  v_inst public.receivable_installments%rowtype;
  v_recv public.accounts_receivable%rowtype;
  v_reversal_id uuid;
begin
  if not public.is_organization_member(p_org_id) then raise exception 'ACCESS_DENIED'; end if;

  select * into v_orig from public.receivable_payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_orig.organization_id != p_org_id then raise exception 'ORG_MISMATCH'; end if;
  if v_orig.reversal_of_id is not null or v_orig.amount < 0 then raise exception 'CANNOT_REVERSE_A_REVERSAL'; end if;

  select * into v_inst from public.receivable_installments where id = v_orig.installment_id for update;
  select * into v_recv from public.accounts_receivable where id = v_orig.receivable_id for update;

  insert into public.receivable_payments (
    organization_id, branch_id, receivable_id, installment_id, bank_account_id, payment_method_id,
    amount, principal_amount, interest_amount, penalty_amount, discount_amount, paid_at, reference, notes, reversal_of_id, created_by
  ) values (
    p_org_id, v_orig.branch_id, v_orig.receivable_id, v_orig.installment_id, v_orig.bank_account_id, v_orig.payment_method_id,
    -v_orig.amount, -v_orig.principal_amount, -v_orig.interest_amount, -v_orig.penalty_amount, -v_orig.discount_amount, now(), v_orig.reference, p_reason, v_orig.id, auth.uid()
  ) returning id into v_reversal_id;

  update public.receivable_installments set
    open_amount = open_amount + v_orig.principal_amount,
    status = case when open_amount + v_orig.principal_amount = original_amount then 'open'::public.receivable_status else 'partially_paid'::public.receivable_status end,
    updated_at = now()
  where id = v_inst.id;

  if not exists (select 1 from public.receivable_installments where receivable_id = v_recv.id and open_amount < original_amount) then
    update public.accounts_receivable set status = 'open', updated_at = now() where id = v_recv.id;
  else
    update public.accounts_receivable set status = 'partially_paid', updated_at = now() where id = v_recv.id;
  end if;

  insert into public.business_events (organization_id, event_type, entity_type, entity_id, actor_id, payload)
  values (p_org_id, 'finance.payment_reversed', 'receivable_payments', v_reversal_id, auth.uid(), jsonb_build_object('principal_reversed', v_orig.principal_amount));

  perform public.finance_recalculate_customer_metrics(p_org_id, v_recv.customer_id);

  return v_reversal_id;
end;
$$;

commit;
