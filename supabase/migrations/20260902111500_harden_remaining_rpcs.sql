begin;

-- =============================================================
-- SECURITY HARDENING: FIXING REMAINING CONSTITUTION VIOLATIONS
-- =============================================================

-- 1. Fix inventory_adjust_stock (was trusting p_org_id and had no search_path)
create or replace function public.inventory_adjust_stock(
    p_product_id uuid,
    p_warehouse_id uuid,
    p_quantity numeric,
    p_reason text
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
    v_org_id uuid;
begin
    -- Resolve org_id from product
    select organization_id into v_org_id from public.products where id = p_product_id;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

    if not public.is_organization_member(v_org_id) then
        raise exception 'UNAUTHORIZED';
    end if;

    -- Validate warehouse belongs to the same org
    if not exists (select 1 from public.warehouses where id = p_warehouse_id and organization_id = v_org_id) then
        raise exception 'WAREHOUSE_NOT_FOUND_OR_INVALID';
    end if;

    if p_quantity = 0 then
        raise exception 'INVALID_QUANTITY';
    end if;

    perform public.inventory_post_movement(
        v_org_id,
        p_product_id,
        p_warehouse_id,
        p_quantity,
        'adjustment',
        p_reason,
        null
    );
end;
$$;


-- 2. Fix finance_create_receivable (Trusting p_org_id, missing search_path, missing membership check)
drop function if exists public.finance_create_receivable(uuid, uuid, uuid, numeric, timestamptz, jsonb);
create or replace function public.finance_create_receivable(
  p_customer_id uuid,
  p_order_id uuid,
  p_total_amount numeric,
  p_issue_date timestamptz,
  p_installments jsonb
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_org_id uuid;
  v_receivable_id uuid;
  v_inst record;
begin
  -- Resolve org_id from customer
  select organization_id into v_org_id from public.customers where id = p_customer_id;
  if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;

  if not public.is_organization_member(v_org_id) then
    raise exception 'UNAUTHORIZED';
  end if;

  insert into public.accounts_receivable (
    organization_id,
    customer_id,
    order_id,
    total_amount,
    issue_date,
    status
  ) values (
    v_org_id,
    p_customer_id,
    p_order_id,
    p_total_amount,
    p_issue_date,
    'open'
  ) returning id into v_receivable_id;

  for v_inst in select * from jsonb_to_recordset(p_installments) as x(
    installment_number int,
    due_date timestamptz,
    amount numeric
  ) loop
    insert into public.receivable_installments (
      organization_id,
      receivable_id,
      installment_number,
      due_date,
      amount,
      balance_due,
      status
    ) values (
      v_org_id,
      v_receivable_id,
      v_inst.installment_number,
      v_inst.due_date,
      v_inst.amount,
      v_inst.amount,
      'open'
    );
  end loop;

  return v_receivable_id;
end;
$$;


-- 3. Fix finance_register_payment (Trusting p_org_id, missing search_path, missing membership check)
drop function if exists public.finance_register_payment(uuid, uuid, uuid, numeric, timestamptz, text, text);
create or replace function public.finance_register_payment(
  p_installment_id uuid,
  p_bank_account_id uuid,
  p_amount numeric,
  p_payment_date timestamptz,
  p_payment_method text,
  p_reference_number text
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_org_id uuid;
  v_payment_id uuid;
  v_inst public.receivable_installments%rowtype;
begin
  -- Resolve org_id from installment
  select * into v_inst from public.receivable_installments where id = p_installment_id for update;
  if not found then raise exception 'INSTALLMENT_NOT_FOUND'; end if;
  
  v_org_id := v_inst.organization_id;

  if not public.is_organization_member(v_org_id) then
    raise exception 'UNAUTHORIZED';
  end if;

  if v_inst.status = 'paid' then
    raise exception 'INSTALLMENT_ALREADY_PAID';
  end if;

  if p_amount > v_inst.balance_due then
    raise exception 'PAYMENT_EXCEEDS_OPEN_AMOUNT';
  end if;

  insert into public.receivable_payments (
    organization_id,
    installment_id,
    bank_account_id,
    amount,
    payment_date,
    payment_method,
    reference_number
  ) values (
    v_org_id,
    p_installment_id,
    p_bank_account_id,
    p_amount,
    p_payment_date,
    p_payment_method,
    p_reference_number
  ) returning id into v_payment_id;

  update public.receivable_installments
  set 
    balance_due = balance_due - p_amount,
    status = case when balance_due - p_amount <= 0 then 'paid'::public.financial_status else 'partial'::public.financial_status end
  where id = p_installment_id;

  update public.accounts_receivable
  set status = case 
    when not exists (select 1 from public.receivable_installments where receivable_id = v_inst.receivable_id and status != 'paid') 
    then 'paid'::public.financial_status 
    else 'partial'::public.financial_status 
  end
  where id = v_inst.receivable_id;

  return v_payment_id;
end;
$$;


-- 4. Fix finance_reverse_payment (Trusting p_org_id, missing search_path, missing membership check)
drop function if exists public.finance_reverse_payment(uuid, uuid, text);
create or replace function public.finance_reverse_payment(
  p_payment_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_org_id uuid;
  v_pay public.receivable_payments%rowtype;
  v_inst public.receivable_installments%rowtype;
begin
  -- Resolve org_id from payment
  select * into v_pay from public.receivable_payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  
  v_org_id := v_pay.organization_id;

  if not public.is_organization_member(v_org_id) then
    raise exception 'UNAUTHORIZED';
  end if;

  if coalesce(v_pay.reversal_reason, '') != '' then
    raise exception 'CANNOT_REVERSE_A_REVERSAL';
  end if;

  select * into v_inst from public.receivable_installments where id = v_pay.installment_id for update;

  update public.receivable_payments
  set reversal_reason = p_reason
  where id = p_payment_id;

  update public.receivable_installments
  set 
    balance_due = balance_due + v_pay.amount,
    status = case when balance_due + v_pay.amount = amount then 'open'::public.financial_status else 'partial'::public.financial_status end
  where id = v_inst.id;

  update public.accounts_receivable
  set status = case 
    when not exists (select 1 from public.receivable_installments where receivable_id = v_inst.receivable_id and status != 'open') 
    then 'open'::public.financial_status 
    else 'partial'::public.financial_status 
  end
  where id = v_inst.receivable_id;
end;
$$;

commit;