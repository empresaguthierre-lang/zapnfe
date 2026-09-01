begin;

-- 1. Atomic Reconcile
create or replace function public.finance_reconcile_bank_transaction(
  p_org_id uuid,
  p_bank_transaction_id uuid,
  p_allocations jsonb, -- Array of { installment_id, principal, interest, penalty, discount, bank_amount }
  p_bank_fees numeric, -- Bank fees extracted from the total amount
  p_resolution_notes text
)
returns void
language plpgsql
security definer
as $$
declare
  v_bank_txn public.bank_transactions%rowtype;
  v_rec_id uuid;
  v_alloc jsonb;
  v_sum_bank_amount numeric := 0;

  v_inst public.receivable_installments%rowtype;
  v_pay_id uuid;
begin
  -- 1. Lock the Bank Transaction
  select * into v_bank_txn from public.bank_transactions where id = p_bank_transaction_id for update;
  if not found then raise exception 'BANK_TRANSACTION_NOT_FOUND'; end if;
  if v_bank_txn.organization_id <> p_org_id then raise exception 'INVALID_ORGANIZATION'; end if;

  -- Verify total
  for v_alloc in select * from jsonb_array_elements(p_allocations)
  loop
    v_sum_bank_amount := v_sum_bank_amount + (v_alloc->>'bank_amount')::numeric;
  end loop;

  v_sum_bank_amount := v_sum_bank_amount + p_bank_fees;

  if v_sum_bank_amount > v_bank_txn.remaining_amount then
    raise exception 'ALLOCATION_EXCEEDS_REMAINING_AMOUNT';
  end if;

  -- 2. Create Header
  insert into public.bank_reconciliations (organization_id, bank_transaction_id, reconciled_by, status)
  values (p_org_id, p_bank_transaction_id, auth.uid(), 'active')
  returning id into v_rec_id;

  -- 3. Process Allocations in Deterministic Order to prevent Deadlocks
  for v_alloc in select * from jsonb_array_elements(p_allocations) order by (value->>'installment_id')::uuid
  loop
    -- Lock Installment
    select * into v_inst from public.receivable_installments where id = (v_alloc->>'installment_id')::uuid for update;

    if (v_alloc->>'principal')::numeric > v_inst.open_amount then
      raise exception 'PRINCIPAL_EXCEEDS_OPEN_AMOUNT';
    end if;

    -- Create Payment
    insert into public.receivable_payments (
      organization_id, installment_id, bank_account_id,
      amount, principal_amount, interest_amount, penalty_amount, discount_amount,
      paid_at, reference, notes, created_by
    ) values (
      p_org_id, v_inst.id, v_bank_txn.bank_account_id,
      (v_alloc->>'principal')::numeric + (v_alloc->>'interest')::numeric + (v_alloc->>'penalty')::numeric - (v_alloc->>'discount')::numeric,
      (v_alloc->>'principal')::numeric, (v_alloc->>'interest')::numeric, (v_alloc->>'penalty')::numeric, (v_alloc->>'discount')::numeric,
      v_bank_txn.occurred_at, 'Conciliação Bancária ' || coalesce(v_bank_txn.external_id, ''), p_resolution_notes, auth.uid()
    ) returning id into v_pay_id;

    -- Create Allocation Link
    insert into public.bank_reconciliation_items (
      organization_id, reconciliation_id, bank_transaction_id, target_type, target_id, bank_amount, economic_amount
    ) values (
      p_org_id, v_rec_id, p_bank_transaction_id, 'receivable_payment', v_pay_id,
      (v_alloc->>'bank_amount')::numeric,
      (v_alloc->>'principal')::numeric + (v_alloc->>'interest')::numeric + (v_alloc->>'penalty')::numeric - (v_alloc->>'discount')::numeric
    );

    -- Sync Customer Metrics
    perform public.finance_recalculate_customer_metrics(p_org_id, (select customer_id from public.accounts_receivable where id = v_inst.receivable_id));
    perform public.finance_sync_order_status((select source_id from public.accounts_receivable where id = v_inst.receivable_id and source_type = 'order'));
  end loop;

  -- 4. Process Bank Fees
  if p_bank_fees > 0 then
    insert into public.financial_transactions (
      organization_id, transaction_kind, amount, direction, occurred_at, description, created_by
    ) values (
      p_org_id, 'bank_fee', p_bank_fees, 'debit', v_bank_txn.occurred_at, 'Tarifa Bancária (' || coalesce(v_bank_txn.description, '') || ')', auth.uid()
    ) returning id into v_pay_id;

    insert into public.bank_reconciliation_items (
      organization_id, reconciliation_id, bank_transaction_id, target_type, target_id, bank_amount, economic_amount
    ) values (
      p_org_id, v_rec_id, p_bank_transaction_id, 'financial_transaction', v_pay_id, p_bank_fees, p_bank_fees
    );
  end if;

  -- 5. Update Bank Transaction Read Model
  update public.bank_transactions
  set allocated_amount = allocated_amount + v_sum_bank_amount,
      remaining_amount = remaining_amount - v_sum_bank_amount,
      status = case when remaining_amount - v_sum_bank_amount = 0 then 'reconciled'::public.bank_transaction_status else 'partially_reconciled'::public.bank_transaction_status end
  where id = p_bank_transaction_id;

end;
$$;


-- 2. Reverse Reconcile
create or replace function public.finance_reverse_bank_reconciliation(
  p_org_id uuid,
  p_reconciliation_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
as $$
declare
  v_rec public.bank_reconciliations%rowtype;
  v_item public.bank_reconciliation_items%rowtype;
  v_sum_bank numeric := 0;
begin
  select * into v_rec from public.bank_reconciliations where id = p_reconciliation_id for update;
  if not found then raise exception 'RECONCILIATION_NOT_FOUND'; end if;
  if v_rec.organization_id <> p_org_id then raise exception 'INVALID_ORGANIZATION'; end if;
  if v_rec.status = 'reversed' then raise exception 'ALREADY_REVERSED'; end if;

  for v_item in select * from public.bank_reconciliation_items where reconciliation_id = p_reconciliation_id order by id
  loop
    v_sum_bank := v_sum_bank + v_item.bank_amount;

    if v_item.target_type = 'receivable_payment' then
      perform public.finance_reverse_payment(p_org_id, v_item.target_id, 'Reversão de Conciliação Bancária: ' || p_reason);
    elsif v_item.target_type = 'financial_transaction' then
      -- Just record a counter-entry for the fee or mark reversed
      insert into public.financial_transactions (
        organization_id, transaction_kind, amount, direction, occurred_at, description, reference_id, created_by
      ) values (
        p_org_id, 'reversal', v_item.economic_amount, 'credit', now(), 'Estorno de ' || p_reason, v_item.target_id, auth.uid()
      );
    end if;
  end loop;

  update public.bank_reconciliations set status = 'reversed' where id = p_reconciliation_id;

  update public.bank_transactions
  set allocated_amount = allocated_amount - v_sum_bank,
      remaining_amount = remaining_amount + v_sum_bank,
      status = case when allocated_amount - v_sum_bank = 0 then 'unmatched'::public.bank_transaction_status else 'partially_reconciled'::public.bank_transaction_status end
  where id = v_rec.bank_transaction_id;

end;
$$;

commit;
