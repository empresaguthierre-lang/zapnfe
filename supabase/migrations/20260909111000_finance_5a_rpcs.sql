-- Migration: Finance 5A - RPCs for Accounts Payable Foundation (V5.4 - Final Gate)

create extension if not exists pgcrypto;

-- 1. Helper Access Check (Boolean to prevent cross-tenant enumeration side-channels)
create or replace function public.finance_has_access(p_org_id uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
    v_role text;
begin
    if current_setting('request.jwt.claim.role', true) = 'service_role' then return true; end if;
    if auth.uid() is null then return false; end if;

    select role into v_role from public.organization_members where organization_id = p_org_id and user_id = auth.uid();
    if not found then return false; end if;
    if v_role not in ('admin', 'manager') then return false; end if;
    return true;
end;
$$;

revoke all on function public.finance_has_access(uuid) from public, anon;
grant execute on function public.finance_has_access(uuid) to authenticated, service_role;

-- 2. Hardened RLS Policies (Moved here to ensure function exists)
drop policy if exists "Users can view payables of their organization" on public.accounts_payable;
drop policy if exists "Finance users can view payables" on public.accounts_payable;
create policy "Finance users can view payables" on public.accounts_payable for select to authenticated using (
    public.finance_has_access(organization_id)
);

drop policy if exists "Users can view payable installments of their organization" on public.payable_installments;
drop policy if exists "Finance users can view payable installments" on public.payable_installments;
create policy "Finance users can view payable installments" on public.payable_installments for select to authenticated using (
    public.finance_has_access(organization_id)
);

drop policy if exists "Users can view payable payments of their organization" on public.payable_payments;
drop policy if exists "Finance users can view payable payments" on public.payable_payments;
create policy "Finance users can view payable payments" on public.payable_payments for select to authenticated using (
    public.finance_has_access(organization_id)
);

-- 3. Helper view to project the dynamic status
create or replace view public.vw_accounts_payable with (security_invoker = true) as
select 
    ap.id, ap.organization_id, ap.branch_id, ap.supplier_id, ap.supplier_name_snapshot,
    ap.supplier_document_snapshot, ap.document_number, ap.description, ap.source_type,
    ap.source_id, ap.source_external_id, ap.issued_on, ap.original_amount, ap.currency,
    ap.payment_term_id, ap.status, ap.cancelled_at, ap.cancellation_reason, ap.created_by,
    ap.created_at, ap.updated_at,
    (select min(due_on) from public.payable_installments where payable_id = ap.id) as first_due_on,
    (select coalesce(sum(remaining_amount), 0) from public.payable_installments where payable_id = ap.id and status != 'cancelled') as total_remaining,
    exists (
        select 1 from public.payable_installments 
        where payable_id = ap.id and status in ('open', 'partially_paid') and due_on < current_date
    ) as is_overdue
from public.accounts_payable ap;


-- 4. Create Payable
create or replace function public.finance_create_payable(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
    v_org_id uuid; v_payable_id uuid; v_inst jsonb; v_total numeric := 0;
    v_idem_key text := payload->>'idempotency_key'; v_idem_id uuid;
    v_req_hash text; v_ext_hash text; v_ext_res uuid;
    v_supplier_name text; v_supplier_doc text;
begin
    if v_idem_key is null or btrim(v_idem_key) = '' then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;

    v_org_id := (auth.jwt() ->> 'org_id')::uuid;
    if v_org_id is null then
        if current_setting('request.jwt.claim.role', true) = 'service_role' then v_org_id := (payload->>'organization_id')::uuid; end if;
    end if;
    if v_org_id is null then raise exception 'missing_org_id'; end if;
    if not public.finance_has_access(v_org_id) then raise exception 'access_denied'; end if;

    v_req_hash := encode(digest(payload::text, 'sha256'), 'hex');
    insert into public.idempotency_keys (organization_id, idempotency_key, command_type, request_hash)
    values (v_org_id, v_idem_key, 'create_payable', v_req_hash)
    on conflict (organization_id, idempotency_key) do nothing returning id into v_idem_id;

    if v_idem_id is null then
        select request_hash, result_id into v_ext_hash, v_ext_res from public.idempotency_keys where organization_id = v_org_id and idempotency_key = v_idem_key;
        if v_ext_hash <> v_req_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
        if v_ext_res is null then raise exception 'CONCURRENT_IDEMPOTENT_REQUEST'; end if;
        return jsonb_build_object('success', true, 'payable_id', v_ext_res);
    end if;

    for v_inst in select * from jsonb_array_elements(payload->'installments') loop v_total := v_total + (v_inst->>'original_amount')::numeric; end loop;
    if v_total <> (payload->>'original_amount')::numeric then raise exception 'PAYABLE_INSTALLMENT_TOTAL_MISMATCH'; end if;

    if payload->>'supplier_id' is not null then
        select name, document into v_supplier_name, v_supplier_doc from public.suppliers where id = (payload->>'supplier_id')::uuid and organization_id = v_org_id;
        if not found then raise exception 'SUPPLIER_NOT_FOUND'; end if;
    end if;
    if payload->>'branch_id' is not null then
        perform 1 from public.branches where id = (payload->>'branch_id')::uuid and organization_id = v_org_id;
        if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
    end if;
    if payload->>'payment_term_id' is not null then
        perform 1 from public.payment_terms where id = (payload->>'payment_term_id')::uuid and organization_id = v_org_id;
        if not found then raise exception 'PAYMENT_TERM_NOT_FOUND'; end if;
    end if;

    insert into public.accounts_payable (
        organization_id, branch_id, supplier_id, supplier_name_snapshot, supplier_document_snapshot, document_number, description, source_type, source_id, source_external_id,
        issued_on, original_amount, currency, payment_term_id, status, created_by
    ) values (
        v_org_id, (payload->>'branch_id')::uuid, (payload->>'supplier_id')::uuid, v_supplier_name, v_supplier_doc, payload->>'document_number', payload->>'description',
        coalesce((payload->>'source_type')::public.payable_source_type, 'manual'), (payload->>'source_id')::uuid, payload->>'source_external_id',
        coalesce((payload->>'issued_on')::date, current_date), (payload->>'original_amount')::numeric, coalesce(payload->>'currency', 'BRL'),
        (payload->>'payment_term_id')::uuid, 'open', auth.uid()
    ) returning id into v_payable_id;

    for v_inst in select * from jsonb_array_elements(payload->'installments') loop
        insert into public.payable_installments (
            organization_id, payable_id, installment_number, due_on, original_amount, remaining_amount, status
        ) values (
            v_org_id, v_payable_id, (v_inst->>'installment_number')::int, (v_inst->>'due_on')::date,
            (v_inst->>'original_amount')::numeric, (v_inst->>'original_amount')::numeric, 'open'
        );
    end loop;

    insert into public.business_events (organization_id, event_type, payload, created_by)
    values (v_org_id, 'finance.payable.created.v1', jsonb_build_object('payable_id', v_payable_id), auth.uid());

    update public.idempotency_keys set result_id = v_payable_id where id = v_idem_id;
    return jsonb_build_object('success', true, 'payable_id', v_payable_id);
end;
$$;

-- 5. Register Payment
create or replace function public.finance_register_payable_payment(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
    v_org_id uuid; v_installment_id uuid := (payload->>'installment_id')::uuid; v_payable_id uuid;
    v_amount numeric := (payload->>'amount')::numeric; v_payment_id uuid;
    v_idem_key text := payload->>'idempotency_key'; v_idem_id uuid; v_req_hash text; v_ext_hash text; v_ext_res uuid;
begin
    if v_idem_key is null or btrim(v_idem_key) = '' then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
    if v_amount <= 0 then raise exception 'amount_must_be_positive'; end if;

    select organization_id, payable_id into v_org_id, v_payable_id from public.payable_installments where id = v_installment_id;
    if v_org_id is null or not public.finance_has_access(v_org_id) then raise exception 'INSTALLMENT_NOT_FOUND'; end if;

    v_req_hash := encode(digest(payload::text, 'sha256'), 'hex');
    insert into public.idempotency_keys (organization_id, idempotency_key, command_type, request_hash)
    values (v_org_id, v_idem_key, 'register_payment', v_req_hash) on conflict do nothing returning id into v_idem_id;
    if v_idem_id is null then
        select request_hash, result_id into v_ext_hash, v_ext_res from public.idempotency_keys where organization_id = v_org_id and idempotency_key = v_idem_key;
        if v_ext_hash <> v_req_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
        if v_ext_res is null then raise exception 'CONCURRENT_IDEMPOTENT_REQUEST'; end if;
        return jsonb_build_object('success', true, 'payment_id', v_ext_res);
    end if;

    if payload->>'bank_account_id' is not null then
        perform 1 from public.bank_accounts where id = (payload->>'bank_account_id')::uuid and organization_id = v_org_id;
        if not found then raise exception 'BANK_ACCOUNT_NOT_FOUND'; end if;
    end if;
    if payload->>'payment_method_id' is not null then
        perform 1 from public.payment_methods where id = (payload->>'payment_method_id')::uuid and organization_id = v_org_id;
        if not found then raise exception 'PAYMENT_METHOD_NOT_FOUND'; end if;
    end if;

    perform 1 from public.accounts_payable where id = v_payable_id and status in ('open', 'partially_paid') for update;
    if not found then raise exception 'payable_not_in_payable_state'; end if;
    perform 1 from public.payable_installments where id = v_installment_id and status in ('open', 'partially_paid') and remaining_amount >= v_amount for update;
    if not found then raise exception 'PAYABLE_PAYMENT_EXCEEDS_REMAINING'; end if;

    insert into public.payable_payments (organization_id, payable_id, installment_id, bank_account_id, payment_method_id, amount, payment_date, created_by)
    values (v_org_id, v_payable_id, v_installment_id, (payload->>'bank_account_id')::uuid, (payload->>'payment_method_id')::uuid, v_amount, coalesce((payload->>'payment_date')::date, current_date), auth.uid())
    returning id into v_payment_id;

    update public.payable_installments set remaining_amount = remaining_amount - v_amount, status = case when remaining_amount - v_amount = 0 then 'paid'::public.payable_status else 'partially_paid'::public.payable_status end, updated_at = now() where id = v_installment_id;
    update public.accounts_payable set status = case when not exists (select 1 from public.payable_installments where payable_id = v_payable_id and status in ('open', 'partially_paid')) then 'paid'::public.payable_status else 'partially_paid'::public.payable_status end, updated_at = now() where id = v_payable_id;
    
    insert into public.business_events (organization_id, event_type, payload, created_by) values (v_org_id, 'finance.payable.payment_registered.v1', jsonb_build_object('payment_id', v_payment_id), auth.uid());
    update public.idempotency_keys set result_id = v_payment_id where id = v_idem_id;
    return jsonb_build_object('success', true, 'payment_id', v_payment_id);
end;
$$;

-- 6. Reverse Payment
create or replace function public.finance_reverse_payable_payment(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
    v_org_id uuid; v_payment_id uuid := (payload->>'payment_id')::uuid; v_rec record; v_reversal_id uuid;
    v_idem_key text := payload->>'idempotency_key'; v_idem_id uuid; v_req_hash text; v_ext_hash text; v_ext_res uuid;
begin
    if v_idem_key is null or btrim(v_idem_key) = '' then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;

    select organization_id into v_org_id from public.payable_payments where id = v_payment_id;
    if v_org_id is null or not public.finance_has_access(v_org_id) then raise exception 'PAYMENT_NOT_FOUND'; end if;

    v_req_hash := encode(digest(payload::text, 'sha256'), 'hex');
    insert into public.idempotency_keys (organization_id, idempotency_key, command_type, request_hash)
    values (v_org_id, v_idem_key, 'reverse_payment', v_req_hash) on conflict do nothing returning id into v_idem_id;
    if v_idem_id is null then
        select request_hash, result_id into v_ext_hash, v_ext_res from public.idempotency_keys where organization_id = v_org_id and idempotency_key = v_idem_key;
        if v_ext_hash <> v_req_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
        if v_ext_res is null then raise exception 'CONCURRENT_IDEMPOTENT_REQUEST'; end if;
        return jsonb_build_object('success', true, 'reversal_id', v_ext_res);
    end if;

    select organization_id, payable_id, installment_id, bank_account_id, payment_method_id, amount, reversal_of_id 
    into v_rec from public.payable_payments where id = v_payment_id;
    
    if v_rec.amount < 0 or v_rec.reversal_of_id is not null then raise exception 'cannot_reverse_a_reversal'; end if;

    perform 1 from public.accounts_payable where id = v_rec.payable_id for update;
    perform 1 from public.payable_installments where id = v_rec.installment_id for update;

    if exists (select 1 from public.payable_payments where reversal_of_id = v_payment_id) then raise exception 'payment_already_reversed'; end if;

    insert into public.payable_payments (organization_id, payable_id, installment_id, bank_account_id, payment_method_id, amount, payment_date, reversal_of_id, created_by)
    values (v_org_id, v_rec.payable_id, v_rec.installment_id, v_rec.bank_account_id, v_rec.payment_method_id, -v_rec.amount, current_date, v_payment_id, auth.uid())
    returning id into v_reversal_id;

    update public.payable_installments set remaining_amount = remaining_amount + v_rec.amount, status = case when remaining_amount + v_rec.amount = original_amount then 'open'::public.payable_status else 'partially_paid'::public.payable_status end, updated_at = now() where id = v_rec.installment_id;
    update public.accounts_payable set status = case when not exists (select 1 from public.payable_installments where payable_id = v_rec.payable_id and remaining_amount < original_amount) then 'open'::public.payable_status else 'partially_paid'::public.payable_status end, updated_at = now() where id = v_rec.payable_id;

    insert into public.business_events (organization_id, event_type, payload, created_by) values (v_org_id, 'finance.payable.payment_reversed.v1', jsonb_build_object('reversal_id', v_reversal_id), auth.uid());
    update public.idempotency_keys set result_id = v_reversal_id where id = v_idem_id;
    return jsonb_build_object('success', true, 'reversal_id', v_reversal_id);
end;
$$;

-- 7. Cancel Payable
create or replace function public.finance_cancel_payable(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
    v_org_id uuid; v_payable_id uuid := (payload->>'payable_id')::uuid; v_status public.payable_status;
    v_idem_key text := payload->>'idempotency_key'; v_idem_id uuid; v_req_hash text; v_ext_hash text;
begin
    if v_idem_key is null or btrim(v_idem_key) = '' then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;

    select organization_id into v_org_id from public.accounts_payable where id = v_payable_id;
    if v_org_id is null or not public.finance_has_access(v_org_id) then raise exception 'PAYABLE_NOT_FOUND'; end if;

    v_req_hash := encode(digest(payload::text, 'sha256'), 'hex');
    insert into public.idempotency_keys (organization_id, idempotency_key, command_type, request_hash)
    values (v_org_id, v_idem_key, 'cancel_payable', v_req_hash) on conflict do nothing returning id into v_idem_id;
    if v_idem_id is null then
        select request_hash into v_ext_hash from public.idempotency_keys where organization_id = v_org_id and idempotency_key = v_idem_key;
        if v_ext_hash <> v_req_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
        return jsonb_build_object('success', true);
    end if;

    select status into v_status from public.accounts_payable where id = v_payable_id for update;
    if v_status = 'cancelled' then return jsonb_build_object('success', true); end if;
    if exists (select 1 from public.payable_installments where payable_id = v_payable_id and original_amount > remaining_amount) then raise exception 'PAYABLE_HAS_ACTIVE_PAYMENTS'; end if;

    update public.accounts_payable set status = 'cancelled', cancelled_at = now(), cancellation_reason = payload->>'reason', updated_at = now() where id = v_payable_id;
    update public.payable_installments set status = 'cancelled', updated_at = now() where payable_id = v_payable_id;

    insert into public.business_events (organization_id, event_type, payload, created_by) values (v_org_id, 'finance.payable.cancelled.v1', jsonb_build_object('payable_id', v_payable_id), auth.uid());
    return jsonb_build_object('success', true);
end;
$$;

-- 8. Grants Revoke/Grant
revoke all on function public.finance_create_payable(jsonb) from public, anon;
grant execute on function public.finance_create_payable(jsonb) to authenticated, service_role;

revoke all on function public.finance_register_payable_payment(jsonb) from public, anon;
grant execute on function public.finance_register_payable_payment(jsonb) to authenticated, service_role;

revoke all on function public.finance_reverse_payable_payment(jsonb) from public, anon;
grant execute on function public.finance_reverse_payable_payment(jsonb) to authenticated, service_role;

revoke all on function public.finance_cancel_payable(jsonb) from public, anon;
grant execute on function public.finance_cancel_payable(jsonb) to authenticated, service_role;
