-- Migration: 20260910150000_finance_5a_hardening.sql
-- Description: Hardening migration for FINANCE 5A addressing audit findings:
-- 1. Compound / tenant-aware physical FK constraints for branches, suppliers, payment_terms, bank_accounts, payment_methods
-- 2. Physical constraint ensuring installment_id belongs to the same payable_id
-- 3. Dedicated indexes for payable_id and installment_id queries
-- 4. Idempotency command_type binding
-- 5. Physical audit_logs triggers on accounts_payable, payable_installments, payable_payments
-- 6. Strict alignment of business_events contract with ARCHITECTURE.md (schema_version, actor_id, entity_type, entity_id, occurred_at)

-- 1. Dedicated indexes
create index if not exists idx_payable_installments_payable_id on public.payable_installments(payable_id);
create index if not exists idx_payable_payments_payable_id on public.payable_payments(payable_id);
create index if not exists idx_payable_payments_installment_id on public.payable_payments(installment_id);

-- 2. Physical tenant-aware Foreign Keys
alter table public.accounts_payable
    drop constraint if exists fk_ap_branch_org,
    drop constraint if exists fk_ap_supplier_org,
    drop constraint if exists fk_ap_payment_term_org;

alter table public.accounts_payable
    add constraint fk_ap_branch_org foreign key (organization_id, branch_id)
        references public.branches(organization_id, id) on delete restrict,
    add constraint fk_ap_supplier_org foreign key (organization_id, supplier_id)
        references public.suppliers(organization_id, id) on delete restrict,
    add constraint fk_ap_payment_term_org foreign key (organization_id, payment_term_id)
        references public.payment_terms(organization_id, id) on delete restrict;

alter table public.payable_payments
    drop constraint if exists fk_payable_payments_bank_org,
    drop constraint if exists fk_payable_payments_method_org;

alter table public.payable_payments
    add constraint fk_payable_payments_bank_org foreign key (organization_id, bank_account_id)
        references public.bank_accounts(organization_id, id) on delete restrict,
    add constraint fk_payable_payments_method_org foreign key (organization_id, payment_method_id)
        references public.payment_methods(organization_id, id) on delete restrict;

-- 3. Physical constraint: installment belongs to the same payable
alter table public.payable_installments
    drop constraint if exists uq_payable_installments_org_payable_id;

alter table public.payable_installments
    add constraint uq_payable_installments_org_payable_id unique (organization_id, payable_id, id);

alter table public.payable_payments
    drop constraint if exists fk_payable_payments_payable_installment;

alter table public.payable_payments
    add constraint fk_payable_payments_payable_installment
        foreign key (organization_id, payable_id, installment_id)
        references public.payable_installments(organization_id, payable_id, id)
        on delete restrict;

-- 4. Idempotency command_type binding
alter table public.idempotency_keys
    drop constraint if exists idempotency_keys_organization_id_idempotency_key_key;

alter table public.idempotency_keys
    add constraint uq_idempotency_keys_org_key_command unique (organization_id, idempotency_key, command_type);

-- 5. Audit logs trigger function and triggers
create or replace function public.audit_finance_accounts_payable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_org_id uuid;
    v_record_id uuid;
    v_actor uuid := auth.uid();
begin
    if tg_op = 'DELETE' then
        v_org_id := old.organization_id;
        v_record_id := old.id;
        insert into public.audit_logs (organization_id, table_name, record_id, action, old_data, performed_by, performed_at)
        values (v_org_id, tg_table_name, v_record_id, 'DELETE', to_jsonb(old), v_actor, now());
        return old;
    elsif tg_op = 'UPDATE' then
        v_org_id := new.organization_id;
        v_record_id := new.id;
        insert into public.audit_logs (organization_id, table_name, record_id, action, old_data, new_data, performed_by, performed_at)
        values (v_org_id, tg_table_name, v_record_id, 'UPDATE', to_jsonb(old), to_jsonb(new), v_actor, now());
        return new;
    elsif tg_op = 'INSERT' then
        v_org_id := new.organization_id;
        v_record_id := new.id;
        insert into public.audit_logs (organization_id, table_name, record_id, action, new_data, performed_by, performed_at)
        values (v_org_id, tg_table_name, v_record_id, 'INSERT', to_jsonb(new), v_actor, now());
        return new;
    end if;
    return null;
end;
$$;

drop trigger if exists tr_audit_accounts_payable on public.accounts_payable;
create trigger tr_audit_accounts_payable
    after insert or update or delete on public.accounts_payable
    for each row execute function public.audit_finance_accounts_payable();

drop trigger if exists tr_audit_payable_installments on public.payable_installments;
create trigger tr_audit_payable_installments
    after insert or update or delete on public.payable_installments
    for each row execute function public.audit_finance_accounts_payable();

drop trigger if exists tr_audit_payable_payments on public.payable_payments;
create trigger tr_audit_payable_payments
    after insert or update or delete on public.payable_payments
    for each row execute function public.audit_finance_accounts_payable();

-- 6. Hardened RPCs with strictly compliant business_events contracts
create or replace function public.finance_create_payable(payload jsonb, idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_org_id uuid;
    v_payable_id uuid;
    v_inst_id uuid;
    v_total numeric(14,2) := 0;
    v_inst_total numeric(14,2) := 0;
    v_inst jsonb;
    v_req_hash text;
    v_existing_id uuid;
    v_existing_hash text;
    v_existing_cmd text;
    v_supplier_name text;
    v_supplier_doc text;
    v_actor_id uuid := auth.uid();
begin
    if idempotency_key is null or btrim(idempotency_key) = '' then
        raise exception 'IDEMPOTENCY_KEY_REQUIRED';
    end if;

    v_org_id := (payload->>'organization_id')::uuid;
    if v_org_id is null or not public.finance_has_access(v_org_id) then
        raise exception 'ORGANIZATION_ACCESS_DENIED';
    end if;

    v_req_hash := encode(digest(payload::text, 'sha256'), 'hex');

    select command_type, request_hash, result_id into v_existing_cmd, v_existing_hash, v_existing_id
    from public.idempotency_keys
    where organization_id = v_org_id and idempotency_key = finance_create_payable.idempotency_key;

    if v_existing_id is not null then
        if v_existing_cmd <> 'payable.create' or v_existing_hash <> v_req_hash then
            raise exception 'IDEMPOTENCY_CONFLICT';
        end if;
        return v_existing_id;
    end if;

    insert into public.idempotency_keys (organization_id, idempotency_key, command_type, request_hash)
    values (v_org_id, finance_create_payable.idempotency_key, 'payable.create', v_req_hash)
    on conflict (organization_id, idempotency_key, command_type) do nothing;

    select result_id into v_existing_id
    from public.idempotency_keys
    where organization_id = v_org_id and idempotency_key = finance_create_payable.idempotency_key and command_type = 'payable.create';

    if v_existing_id is not null then
        return v_existing_id;
    end if;

    v_total := (payload->>'original_amount')::numeric(14,2);
    if v_total is null or v_total <= 0 then
        raise exception 'INVALID_AMOUNT';
    end if;

    if payload->>'supplier_id' is not null then
        select name, document into v_supplier_name, v_supplier_doc
        from public.suppliers
        where id = (payload->>'supplier_id')::uuid and organization_id = v_org_id;

        if v_supplier_name is null then
            raise exception 'SUPPLIER_NOT_FOUND';
        end if;
    end if;

    if payload->>'branch_id' is not null then
        perform 1 from public.branches where id = (payload->>'branch_id')::uuid and organization_id = v_org_id;
        if not found then
            raise exception 'BRANCH_NOT_FOUND';
        end if;
    end if;

    if payload->>'payment_term_id' is not null then
        perform 1 from public.payment_terms where id = (payload->>'payment_term_id')::uuid and organization_id = v_org_id;
        if not found then
            raise exception 'PAYMENT_TERM_NOT_FOUND';
        end if;
    end if;

    insert into public.accounts_payable (
        organization_id, branch_id, supplier_id,
        supplier_name_snapshot, supplier_document_snapshot,
        document_number, description, source_type,
        source_id, source_external_id, issued_on,
        original_amount, currency, payment_term_id, created_by
    ) values (
        v_org_id,
        (payload->>'branch_id')::uuid,
        (payload->>'supplier_id')::uuid,
        v_supplier_name,
        v_supplier_doc,
        payload->>'document_number',
        payload->>'description',
        coalesce((payload->>'source_type')::public.payable_source_type, 'manual'),
        (payload->>'source_id')::uuid,
        payload->>'source_external_id',
        coalesce((payload->>'issued_on')::date, current_date),
        v_total,
        coalesce(payload->>'currency', 'BRL'),
        (payload->>'payment_term_id')::uuid,
        v_actor_id
    ) returning id into v_payable_id;

    for v_inst in select * from jsonb_array_elements(payload->'installments')
    loop
        v_inst_total := v_inst_total + (v_inst->>'amount')::numeric(14,2);
        insert into public.payable_installments (
            organization_id, payable_id, installment_number,
            due_on, original_amount, remaining_amount
        ) values (
            v_org_id, v_payable_id, (v_inst->>'installment_number')::int,
            (v_inst->>'due_on')::date, (v_inst->>'amount')::numeric(14,2),
            (v_inst->>'amount')::numeric(14,2)
        );
    end loop;

    if v_inst_total <> v_total then
        raise exception 'INSTALLMENTS_TOTAL_MISMATCH';
    end if;

    update public.idempotency_keys
    set result_id = v_payable_id
    where organization_id = v_org_id and idempotency_key = finance_create_payable.idempotency_key and command_type = 'payable.create';

    insert into public.business_events (
        event_type, schema_version, organization_id, actor_id,
        entity_type, entity_id, occurred_at, payload, created_by
    ) values (
        'finance.payable.created.v1', 1, v_org_id, v_actor_id,
        'accounts_payable', v_payable_id, now(),
        jsonb_build_object(
            'payable_id', v_payable_id,
            'original_amount', v_total,
            'supplier_id', payload->>'supplier_id',
            'document_number', payload->>'document_number'
        ),
        v_actor_id
    );

    return v_payable_id;
end;
$$;

create or replace function public.finance_register_payable_payment(payload jsonb, idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_org_id uuid;
    v_payable_id uuid;
    v_installment_id uuid;
    v_amount numeric(14,2);
    v_payment_id uuid;
    v_remaining numeric(14,2);
    v_payable_status public.payable_status;
    v_req_hash text;
    v_existing_id uuid;
    v_existing_hash text;
    v_existing_cmd text;
    v_actor_id uuid := auth.uid();
begin
    if idempotency_key is null or btrim(idempotency_key) = '' then
        raise exception 'IDEMPOTENCY_KEY_REQUIRED';
    end if;

    v_org_id := (payload->>'organization_id')::uuid;
    if v_org_id is null or not public.finance_has_access(v_org_id) then
        raise exception 'ORGANIZATION_ACCESS_DENIED';
    end if;

    v_req_hash := encode(digest(payload::text, 'sha256'), 'hex');

    select command_type, request_hash, result_id into v_existing_cmd, v_existing_hash, v_existing_id
    from public.idempotency_keys
    where organization_id = v_org_id and idempotency_key = finance_register_payable_payment.idempotency_key;

    if v_existing_id is not null then
        if v_existing_cmd <> 'payable.payment' or v_existing_hash <> v_req_hash then
            raise exception 'IDEMPOTENCY_CONFLICT';
        end if;
        return v_existing_id;
    end if;

    insert into public.idempotency_keys (organization_id, idempotency_key, command_type, request_hash)
    values (v_org_id, finance_register_payable_payment.idempotency_key, 'payable.payment', v_req_hash)
    on conflict (organization_id, idempotency_key, command_type) do nothing;

    select result_id into v_existing_id
    from public.idempotency_keys
    where organization_id = v_org_id and idempotency_key = finance_register_payable_payment.idempotency_key and command_type = 'payable.payment';

    if v_existing_id is not null then
        return v_existing_id;
    end if;

    v_payable_id := (payload->>'payable_id')::uuid;
    v_installment_id := (payload->>'installment_id')::uuid;
    v_amount := (payload->>'amount')::numeric(14,2);

    if v_amount is null or v_amount <= 0 then
        raise exception 'INVALID_PAYMENT_AMOUNT';
    end if;

    if payload->>'bank_account_id' is not null then
        perform 1 from public.bank_accounts where id = (payload->>'bank_account_id')::uuid and organization_id = v_org_id;
        if not found then
            raise exception 'BANK_ACCOUNT_NOT_FOUND';
        end if;
    end if;

    if payload->>'payment_method_id' is not null then
        perform 1 from public.payment_methods where id = (payload->>'payment_method_id')::uuid and organization_id = v_org_id;
        if not found then
            raise exception 'PAYMENT_METHOD_NOT_FOUND';
        end if;
    end if;

    select status into v_payable_status
    from public.accounts_payable
    where id = v_payable_id and organization_id = v_org_id
    for update;

    if not found then
        raise exception 'PAYABLE_NOT_FOUND';
    end if;

    if v_payable_status = 'cancelled' then
        raise exception 'PAYABLE_IS_CANCELLED';
    end if;

    select remaining_amount into v_remaining
    from public.payable_installments
    where id = v_installment_id and payable_id = v_payable_id and organization_id = v_org_id
    for update;

    if not found then
        raise exception 'INSTALLMENT_NOT_FOUND';
    end if;

    if v_amount > v_remaining then
        raise exception 'PAYABLE_PAYMENT_EXCEEDS_REMAINING';
    end if;

    insert into public.payable_payments (
        organization_id, payable_id, installment_id,
        bank_account_id, payment_method_id, amount,
        payment_date, created_by
    ) values (
        v_org_id, v_payable_id, v_installment_id,
        (payload->>'bank_account_id')::uuid,
        (payload->>'payment_method_id')::uuid,
        v_amount,
        coalesce((payload->>'payment_date')::date, current_date),
        v_actor_id
    ) returning id into v_payment_id;

    update public.payable_installments
    set remaining_amount = remaining_amount - v_amount,
        status = case when remaining_amount - v_amount = 0 then 'paid'::public.payable_status else 'partially_paid'::public.payable_status end,
        updated_at = now()
    where id = v_installment_id and payable_id = v_payable_id and organization_id = v_org_id;

    update public.accounts_payable
    set status = case
            when (select count(*) from public.payable_installments where payable_id = v_payable_id and status <> 'paid') = 0 then 'paid'::public.payable_status
            else 'partially_paid'::public.payable_status
        end,
        updated_at = now()
    where id = v_payable_id and organization_id = v_org_id;

    update public.idempotency_keys
    set result_id = v_payment_id
    where organization_id = v_org_id and idempotency_key = finance_register_payable_payment.idempotency_key and command_type = 'payable.payment';

    insert into public.business_events (
        event_type, schema_version, organization_id, actor_id,
        entity_type, entity_id, occurred_at, payload, created_by
    ) values (
        'finance.payable.payment_registered.v1', 1, v_org_id, v_actor_id,
        'payable_payments', v_payment_id, now(),
        jsonb_build_object(
            'payment_id', v_payment_id,
            'payable_id', v_payable_id,
            'installment_id', v_installment_id,
            'amount', v_amount
        ),
        v_actor_id
    );

    return v_payment_id;
end;
$$;

create or replace function public.finance_reverse_payable_payment(payload jsonb, idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_org_id uuid;
    v_payment_id uuid;
    v_payable_id uuid;
    v_installment_id uuid;
    v_amount numeric(14,2);
    v_reversal_id uuid;
    v_req_hash text;
    v_existing_id uuid;
    v_existing_hash text;
    v_existing_cmd text;
    v_bank_id uuid;
    v_method_id uuid;
    v_actor_id uuid := auth.uid();
begin
    if idempotency_key is null or btrim(idempotency_key) = '' then
        raise exception 'IDEMPOTENCY_KEY_REQUIRED';
    end if;

    v_org_id := (payload->>'organization_id')::uuid;
    if v_org_id is null or not public.finance_has_access(v_org_id) then
        raise exception 'ORGANIZATION_ACCESS_DENIED';
    end if;

    v_req_hash := encode(digest(payload::text, 'sha256'), 'hex');

    select command_type, request_hash, result_id into v_existing_cmd, v_existing_hash, v_existing_id
    from public.idempotency_keys
    where organization_id = v_org_id and idempotency_key = finance_reverse_payable_payment.idempotency_key;

    if v_existing_id is not null then
        if v_existing_cmd <> 'payable.reverse' or v_existing_hash <> v_req_hash then
            raise exception 'IDEMPOTENCY_CONFLICT';
        end if;
        return v_existing_id;
    end if;

    insert into public.idempotency_keys (organization_id, idempotency_key, command_type, request_hash)
    values (v_org_id, finance_reverse_payable_payment.idempotency_key, 'payable.reverse', v_req_hash)
    on conflict (organization_id, idempotency_key, command_type) do nothing;

    select result_id into v_existing_id
    from public.idempotency_keys
    where organization_id = v_org_id and idempotency_key = finance_reverse_payable_payment.idempotency_key and command_type = 'payable.reverse';

    if v_existing_id is not null then
        return v_existing_id;
    end if;

    v_payment_id := (payload->>'payment_id')::uuid;

    select payable_id, installment_id, amount, bank_account_id, payment_method_id
    into v_payable_id, v_installment_id, v_amount, v_bank_id, v_method_id
    from public.payable_payments
    where id = v_payment_id and organization_id = v_org_id
    for update;

    if not found then
        raise exception 'PAYMENT_NOT_FOUND';
    end if;

    if v_amount <= 0 then
        raise exception 'CANNOT_REVERSE_A_REVERSAL';
    end if;

    perform 1 from public.payable_payments where reversal_of_id = v_payment_id and organization_id = v_org_id;
    if found then
        raise exception 'PAYMENT_ALREADY_REVERSED';
    end if;

    insert into public.payable_payments (
        organization_id, payable_id, installment_id,
        bank_account_id, payment_method_id, amount,
        payment_date, reversal_of_id, created_by
    ) values (
        v_org_id, v_payable_id, v_installment_id,
        v_bank_id, v_method_id, -v_amount,
        current_date, v_payment_id, v_actor_id
    ) returning id into v_reversal_id;

    update public.payable_installments
    set remaining_amount = remaining_amount + v_amount,
        status = case when remaining_amount + v_amount = original_amount then 'open'::public.payable_status else 'partially_paid'::public.payable_status end,
        updated_at = now()
    where id = v_installment_id and payable_id = v_payable_id and organization_id = v_org_id;

    update public.accounts_payable
    set status = case
            when (select sum(remaining_amount) from public.payable_installments where payable_id = v_payable_id and organization_id = v_org_id) = original_amount then 'open'::public.payable_status
            else 'partially_paid'::public.payable_status
        end,
        updated_at = now()
    where id = v_payable_id and organization_id = v_org_id;

    update public.idempotency_keys
    set result_id = v_reversal_id
    where organization_id = v_org_id and idempotency_key = finance_reverse_payable_payment.idempotency_key and command_type = 'payable.reverse';

    insert into public.business_events (
        event_type, schema_version, organization_id, actor_id,
        entity_type, entity_id, occurred_at, payload, created_by
    ) values (
        'finance.payable.payment_reversed.v1', 1, v_org_id, v_actor_id,
        'payable_payments', v_reversal_id, now(),
        jsonb_build_object(
            'reversal_id', v_reversal_id,
            'original_payment_id', v_payment_id,
            'amount', -v_amount
        ),
        v_actor_id
    );

    return v_reversal_id;
end;
$$;

create or replace function public.finance_cancel_payable(payload jsonb, idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_org_id uuid;
    v_payable_id uuid;
    v_reason text;
    v_status public.payable_status;
    v_req_hash text;
    v_existing_id uuid;
    v_existing_hash text;
    v_existing_cmd text;
    v_actor_id uuid := auth.uid();
begin
    if idempotency_key is null or btrim(idempotency_key) = '' then
        raise exception 'IDEMPOTENCY_KEY_REQUIRED';
    end if;

    v_org_id := (payload->>'organization_id')::uuid;
    if v_org_id is null or not public.finance_has_access(v_org_id) then
        raise exception 'ORGANIZATION_ACCESS_DENIED';
    end if;

    v_req_hash := encode(digest(payload::text, 'sha256'), 'hex');

    select command_type, request_hash, result_id into v_existing_cmd, v_existing_hash, v_existing_id
    from public.idempotency_keys
    where organization_id = v_org_id and idempotency_key = finance_cancel_payable.idempotency_key;

    if v_existing_id is not null then
        if v_existing_cmd <> 'payable.cancel' or v_existing_hash <> v_req_hash then
            raise exception 'IDEMPOTENCY_CONFLICT';
        end if;
        return v_existing_id;
    end if;

    insert into public.idempotency_keys (organization_id, idempotency_key, command_type, request_hash)
    values (v_org_id, finance_cancel_payable.idempotency_key, 'payable.cancel', v_req_hash)
    on conflict (organization_id, idempotency_key, command_type) do nothing;

    select result_id into v_existing_id
    from public.idempotency_keys
    where organization_id = v_org_id and idempotency_key = finance_cancel_payable.idempotency_key and command_type = 'payable.cancel';

    if v_existing_id is not null then
        return v_existing_id;
    end if;

    v_payable_id := (payload->>'payable_id')::uuid;
    v_reason := payload->>'cancellation_reason';

    select status into v_status
    from public.accounts_payable
    where id = v_payable_id and organization_id = v_org_id
    for update;

    if not found then
        raise exception 'PAYABLE_NOT_FOUND';
    end if;

    if v_status = 'cancelled' then
        return v_payable_id;
    end if;

    perform 1 from public.payable_payments where payable_id = v_payable_id and organization_id = v_org_id;
    if found then
        raise exception 'CANNOT_CANCEL_PAYABLE_WITH_PAYMENTS';
    end if;

    update public.accounts_payable
    set status = 'cancelled',
        cancelled_at = now(),
        cancellation_reason = v_reason,
        updated_at = now()
    where id = v_payable_id and organization_id = v_org_id;

    update public.payable_installments
    set status = 'cancelled',
        updated_at = now()
    where payable_id = v_payable_id and organization_id = v_org_id;

    update public.idempotency_keys
    set result_id = v_payable_id
    where organization_id = v_org_id and idempotency_key = finance_cancel_payable.idempotency_key and command_type = 'payable.cancel';

    insert into public.business_events (
        event_type, schema_version, organization_id, actor_id,
        entity_type, entity_id, occurred_at, payload, created_by
    ) values (
        'finance.payable.cancelled.v1', 1, v_org_id, v_actor_id,
        'accounts_payable', v_payable_id, now(),
        jsonb_build_object('payable_id', v_payable_id, 'reason', v_reason),
        v_actor_id
    );

    return v_payable_id;
end;
$$;
