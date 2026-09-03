begin;

-- Re-create functions that lacked proper tenancy/role validation

-- 1. finance_reconcile_bank_transaction
create or replace function public.finance_reconcile_bank_transaction(
  p_org_id uuid,
  p_bank_transaction_id uuid,
  p_allocations jsonb,
  p_bank_fees numeric,
  p_resolution_notes text
)
returns void
language plpgsql
security definer set search_path = ''
as $ody$
declare
  v_bank_txn public.bank_transactions%rowtype;
  v_rec_id uuid;
  v_alloc jsonb;
  v_sum_bank_amount numeric := 0;
  v_inst public.receivable_installments%rowtype;
  v_pay_id uuid;
begin
  if not public.has_organization_role(p_org_id, array['admin', 'manager']::public.member_role[]) then
    raise exception 'UNAUTHORIZED';
  end if;

  select * into v_bank_txn from public.bank_transactions where id = p_bank_transaction_id for update;
  if not found then raise exception 'BANK_TRANSACTION_NOT_FOUND'; end if;
  if v_bank_txn.organization_id <> p_org_id then raise exception 'INVALID_ORGANIZATION'; end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    v_sum_bank_amount := v_sum_bank_amount + (v_alloc->>'bank_amount')::numeric;
  end loop;

  v_sum_bank_amount := v_sum_bank_amount + p_bank_fees;
  if v_sum_bank_amount > v_bank_txn.remaining_amount then raise exception 'ALLOCATION_EXCEEDS_REMAINING_AMOUNT'; end if;

  insert into public.bank_reconciliations (organization_id, bank_transaction_id, reconciled_by, status)
  values (p_org_id, p_bank_transaction_id, auth.uid(), 'active') returning id into v_rec_id;

  for v_alloc in select * from jsonb_array_elements(p_allocations) order by (value->>'installment_id')::uuid loop
    select * into v_inst from public.receivable_installments where id = (v_alloc->>'installment_id')::uuid for update;
    if not found or v_inst.organization_id <> p_org_id then raise exception 'INVALID_INSTALLMENT'; end if;

    select public.finance_register_payment(
      p_org_id, v_inst.id, v_bank_txn.bank_account_id,
      (v_alloc->>'principal')::numeric + (v_alloc->>'interest')::numeric + (v_alloc->>'penalty')::numeric - (v_alloc->>'discount')::numeric,
      (v_alloc->>'principal')::numeric, (v_alloc->>'interest')::numeric, (v_alloc->>'penalty')::numeric, (v_alloc->>'discount')::numeric,
      v_bank_txn.occurred_at, 'Conciliação Bancária ' || coalesce(v_bank_txn.external_id, ''), p_resolution_notes, auth.uid()
    ) returning id into v_pay_id;

    insert into public.bank_reconciliation_items (
      organization_id, reconciliation_id, bank_transaction_id, target_type, target_id, bank_amount, economic_amount
    ) values (
      p_org_id, v_rec_id, p_bank_transaction_id, 'receivable_payment', v_pay_id,
      (v_alloc->>'bank_amount')::numeric,
      (v_alloc->>'principal')::numeric + (v_alloc->>'interest')::numeric + (v_alloc->>'penalty')::numeric - (v_alloc->>'discount')::numeric
    );
  end loop;

  if p_bank_fees > 0 then
    insert into public.financial_transactions (organization_id, category_code, amount, type, occurred_at, description, created_by)
    values (p_org_id, 'bank_fee', p_bank_fees, 'debit', v_bank_txn.occurred_at, 'Tarifa Bancária (' || coalesce(v_bank_txn.description, '') || ')', auth.uid()) returning id into v_pay_id;

    insert into public.bank_reconciliation_items (organization_id, reconciliation_id, bank_transaction_id, target_type, target_id, bank_amount, economic_amount)
    values (p_org_id, v_rec_id, p_bank_transaction_id, 'financial_transaction', v_pay_id, p_bank_fees, p_bank_fees);
  end if;

  update public.bank_transactions set status = case when remaining_amount = v_sum_bank_amount then 'reconciled'::public.bank_transaction_status else 'partially_reconciled'::public.bank_transaction_status end, remaining_amount = remaining_amount - v_sum_bank_amount, updated_at = now() where id = p_bank_transaction_id;
end;
$ody$;


-- 2. finance_reverse_bank_reconciliation
create or replace function public.finance_reverse_bank_reconciliation(
  p_org_id uuid,
  p_reconciliation_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer set search_path = ''
as $ody$
declare
  v_rec public.bank_reconciliations%rowtype;
  v_item public.bank_reconciliation_items%rowtype;
  v_sum_bank numeric := 0;
begin
  if not public.has_organization_role(p_org_id, array['admin', 'manager']::public.member_role[]) then
    raise exception 'UNAUTHORIZED';
  end if;

  select * into v_rec from public.bank_reconciliations where id = p_reconciliation_id for update;
  if not found then raise exception 'RECONCILIATION_NOT_FOUND'; end if;
  if v_rec.organization_id <> p_org_id then raise exception 'INVALID_ORGANIZATION'; end if;
  if v_rec.status = 'reversed' then raise exception 'ALREADY_REVERSED'; end if;

  for v_item in select * from public.bank_reconciliation_items where reconciliation_id = p_reconciliation_id order by id loop
    if v_item.target_type = 'receivable_payment' then
      perform public.finance_reverse_payment(p_org_id, v_item.target_id, p_reason);
    elsif v_item.target_type = 'financial_transaction' then
      delete from public.financial_transactions where id = v_item.target_id;
    end if;
    v_sum_bank := v_sum_bank + v_item.bank_amount;
  end loop;

  update public.bank_transactions set remaining_amount = remaining_amount + v_sum_bank, status = case when remaining_amount + v_sum_bank = amount then 'unmatched'::public.bank_transaction_status else 'partially_reconciled'::public.bank_transaction_status end, updated_at = now() where id = v_rec.bank_transaction_id;
  update public.bank_reconciliations set status = 'reversed', reversal_reason = p_reason, reversed_at = now(), reversed_by = auth.uid(), updated_at = now() where id = p_reconciliation_id;
end;
$ody$;


create or replace function public.finance_generate_receivable_from_order(p_order_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $ody$
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
  
  if not public.has_organization_role(v_order.organization_id, array['admin', 'manager']::public.member_role[]) then
    raise exception 'UNAUTHORIZED';
  end if;

  select * into v_settings from public.organization_financial_settings where organization_id = v_order.organization_id;
  if not found then
    insert into public.organization_financial_settings (organization_id) values (v_order.organization_id) returning * into v_settings;
  end if;

  select id into v_recv_id from public.accounts_receivable where source_type = 'order' and source_id = p_order_id and status <> 'cancelled';
  if found then return v_recv_id; end if;

  if v_order.payment_method_id is null or v_order.payment_term_id is null then raise exception 'PAYMENT_TERMS_MISSING'; end if;

  select * into v_term from public.payment_terms where id = v_order.payment_term_id;
  v_total := v_order.total;
  
  if v_settings.receivable_base_date = 'invoiced_at' then
    v_base_date := coalesce((v_order.metadata->>'invoiced_at')::date, current_date);
  else
    v_base_date := current_date;
  end if;

  insert into public.accounts_receivable (
    organization_id, branch_id, customer_id, source_type, source_id, document_number,
    description, original_amount, current_amount, status, issued_on, competence_date
  ) values (
    v_order.organization_id, v_order.organization_id, v_order.customer_id, 'order', p_order_id, v_order.number::text,
    'Faturamento de Pedido #' || v_order.number, v_total, v_total, 'open', current_date, v_base_date
  ) returning id into v_recv_id;

  select count(*) into v_count from jsonb_array_elements(v_term.installments);
  
  for v_inst_rec in select * from jsonb_array_elements(v_term.installments) loop
    v_current := v_current + 1;
    if v_current = v_count then
      v_inst_amount := v_total - v_sum_generated;
    else
      v_inst_amount := round((v_total * (v_inst_rec.value->>'percentage')::numeric / 100), 2);
    end if;
    v_sum_generated := v_sum_generated + v_inst_amount;
    
    insert into public.receivable_installments (
      organization_id, receivable_id, installment_number, original_amount, open_amount, due_on, status
    ) values (
      v_order.organization_id, v_recv_id, v_current, v_inst_amount, v_inst_amount,
      v_base_date + ((v_inst_rec.value->>'days_from_base')::int || ' days')::interval, 'open'
    );
  end loop;

  return v_recv_id;
end;
$ody$;

-- Now fix all remaining functions with DO block
do $ody$
declare
  r record;
begin
  for r in 
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.prosecdef = true
      and not (coalesce(p.proconfig, '{}'::text[]) @> '{search_path=""}')
  loop
    execute format('alter function %I.%I(%s) set search_path = '''';', r.nspname, r.proname, r.args);
  end loop;
end;
$ody$;

commit;

