begin;

-- =============================================================
-- AUDIT FIX: C1 — Banking RPCs Security Hardening
-- Problem: No is_organization_member() check, no SET search_path
-- =============================================================

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

  -- AUDIT FIX: Validate membership against the REAL org, not the client-provided one
  if not public.is_organization_member(v_bank_txn.organization_id) then
    raise exception 'UNAUTHORIZED';
  end if;
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
  values (v_bank_txn.organization_id, p_bank_transaction_id, auth.uid(), 'active')
  returning id into v_rec_id;

  -- 3. Process Allocations in Deterministic Order to prevent Deadlocks
  for v_alloc in select * from jsonb_array_elements(p_allocations) order by (value->>'installment_id')::uuid
  loop
    select * into v_inst from public.receivable_installments where id = (v_alloc->>'installment_id')::uuid for update;

    if (v_alloc->>'principal')::numeric > v_inst.open_amount then
      raise exception 'PRINCIPAL_EXCEEDS_OPEN_AMOUNT';
    end if;

    insert into public.receivable_payments (
      organization_id, installment_id, bank_account_id,
      amount, principal_amount, interest_amount, penalty_amount, discount_amount,
      paid_at, reference, notes, created_by
    ) values (
      v_bank_txn.organization_id, v_inst.id, v_bank_txn.bank_account_id,
      (v_alloc->>'principal')::numeric + (v_alloc->>'interest')::numeric + (v_alloc->>'penalty')::numeric - (v_alloc->>'discount')::numeric,
      (v_alloc->>'principal')::numeric, (v_alloc->>'interest')::numeric, (v_alloc->>'penalty')::numeric, (v_alloc->>'discount')::numeric,
      v_bank_txn.occurred_at, 'Conciliacao Bancaria ' || coalesce(v_bank_txn.external_id, ''), p_resolution_notes, auth.uid()
    ) returning id into v_pay_id;

    insert into public.bank_reconciliation_items (
      organization_id, reconciliation_id, bank_transaction_id, target_type, target_id, bank_amount, economic_amount
    ) values (
      v_bank_txn.organization_id, v_rec_id, p_bank_transaction_id, 'receivable_payment', v_pay_id,
      (v_alloc->>'bank_amount')::numeric,
      (v_alloc->>'principal')::numeric + (v_alloc->>'interest')::numeric + (v_alloc->>'penalty')::numeric - (v_alloc->>'discount')::numeric
    );

    perform public.finance_recalculate_customer_metrics(v_bank_txn.organization_id, (select customer_id from public.accounts_receivable where id = v_inst.receivable_id));
    perform public.finance_sync_order_status((select source_id from public.accounts_receivable where id = v_inst.receivable_id and source_type = 'order'));
  end loop;

  -- 4. Process Bank Fees
  if p_bank_fees > 0 then
    insert into public.financial_transactions (
      organization_id, transaction_kind, amount, direction, occurred_at, description, created_by
    ) values (
      v_bank_txn.organization_id, 'bank_fee', p_bank_fees, 'debit', v_bank_txn.occurred_at, 'Tarifa Bancaria (' || coalesce(v_bank_txn.description, '') || ')', auth.uid()
    ) returning id into v_pay_id;

    insert into public.bank_reconciliation_items (
      organization_id, reconciliation_id, bank_transaction_id, target_type, target_id, bank_amount, economic_amount
    ) values (
      v_bank_txn.organization_id, v_rec_id, p_bank_transaction_id, 'financial_transaction', v_pay_id, p_bank_fees, p_bank_fees
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


create or replace function public.finance_reverse_bank_reconciliation(
  p_org_id uuid,
  p_reconciliation_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_rec public.bank_reconciliations%rowtype;
  v_item public.bank_reconciliation_items%rowtype;
  v_sum_bank numeric := 0;
begin
  select * into v_rec from public.bank_reconciliations where id = p_reconciliation_id for update;
  if not found then raise exception 'RECONCILIATION_NOT_FOUND'; end if;

  -- AUDIT FIX: Validate membership against the REAL org
  if not public.is_organization_member(v_rec.organization_id) then
    raise exception 'UNAUTHORIZED';
  end if;
  if v_rec.organization_id <> p_org_id then raise exception 'INVALID_ORGANIZATION'; end if;
  if v_rec.status = 'reversed' then raise exception 'ALREADY_REVERSED'; end if;

  for v_item in select * from public.bank_reconciliation_items where reconciliation_id = p_reconciliation_id order by id
  loop
    v_sum_bank := v_sum_bank + v_item.bank_amount;

    if v_item.target_type = 'receivable_payment' then
      perform public.finance_reverse_payment(v_rec.organization_id, v_item.target_id, 'Reversao de Conciliacao Bancaria: ' || p_reason);
    elsif v_item.target_type = 'financial_transaction' then
      insert into public.financial_transactions (
        organization_id, transaction_kind, amount, direction, occurred_at, description, reference_id, created_by
      ) values (
        v_rec.organization_id, 'reversal', v_item.economic_amount, 'credit', now(), 'Estorno de ' || p_reason, v_item.target_id, auth.uid()
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


-- =============================================================
-- AUDIT FIX: C2 — Restriction RPCs Security Hardening
-- Problem: Trusting p_org_id, missing SET search_path
-- =============================================================

create or replace function public.customer_apply_restriction(
  p_org_id uuid,
  p_customer_id uuid,
  p_module public.restriction_module,
  p_type text,
  p_scope public.restriction_scope,
  p_severity public.restriction_severity,
  p_reason text,
  p_reason_code text default null
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_real_org_id uuid;
begin
  -- Resolve org from customer, never trust browser
  select organization_id into v_real_org_id from public.customers where id = p_customer_id;
  if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  if not public.is_organization_member(v_real_org_id) then raise exception 'UNAUTHORIZED'; end if;

  insert into public.customer_restrictions (
    organization_id, customer_id, module, restriction_type, scope, severity, reason, reason_code, created_by
  ) values (
    v_real_org_id, p_customer_id, p_module, p_type, p_scope, p_severity, p_reason, p_reason_code, auth.uid()
  );
end;
$$;


create or replace function public.customer_release_restriction(
  p_org_id uuid,
  p_restriction_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_restriction record;
begin
  -- Resolve org from restriction, never trust browser
  select * into v_restriction from public.customer_restrictions where id = p_restriction_id;
  if not found then raise exception 'RESTRICTION_NOT_FOUND'; end if;
  if not public.is_organization_member(v_restriction.organization_id) then raise exception 'UNAUTHORIZED'; end if;
  if v_restriction.released_at is not null then raise exception 'ALREADY_RELEASED'; end if;

  update public.customer_restrictions
  set released_at = now(),
      released_by = auth.uid(),
      release_reason = p_reason
  where id = p_restriction_id
    and released_at is null;
end;
$$;


-- =============================================================
-- AUDIT FIX: M1 — Add missing restriction scopes
-- =============================================================

alter type public.restriction_scope add value if not exists 'order_edit';
alter type public.restriction_scope add value if not exists 'invoice_cancel';
alter type public.restriction_scope add value if not exists 'return_operation';


-- =============================================================
-- AUDIT FIX: M4 — Readiness must exclude draft/superseded from
-- INVOICE_ALREADY_EXISTS check
-- =============================================================
-- Also M3 — Fix garbled UTF-8 encoding in all RPC messages
-- =============================================================

create or replace function public.fiscal_validate_order_readiness(p_order_id uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_order record;
  v_org_id uuid;
  v_org_profile record;
  v_customer_profile record;
  v_item record;
  v_restrictions jsonb;
  v_issues jsonb := '[]'::jsonb;
  v_errors int := 0;
  v_warnings int := 0;
  v_invoice_exists boolean;
begin
  -- 1. Load Order
  select o.id, o.organization_id, o.customer_id, o.status, o.total
  into v_order
  from public.orders o
  where o.id = p_order_id;

  if not found then
    return jsonb_build_object('ready', false, 'errors', 1, 'warnings', 0, 'issues', jsonb_build_array(
      jsonb_build_object('code', 'ORDER_NOT_FOUND', 'severity', 'error', 'message', 'Pedido nao encontrado.')
    ));
  end if;

  v_org_id := v_order.organization_id;

  if not public.is_organization_member(v_org_id) then
    raise exception 'UNAUTHORIZED';
  end if;

  -- 2. Check existing invoices (AUDIT FIX M4: exclude draft and superseded)
  select exists(
    select 1 from public.invoices
    where order_id = p_order_id
      and status not in ('draft', 'superseded', 'canceled', 'rejected', 'denied')
  ) into v_invoice_exists;

  if v_invoice_exists then
    v_issues := v_issues || jsonb_build_object(
      'code', 'INVOICE_ALREADY_EXISTS',
      'severity', 'error',
      'message', 'Ja existe um documento fiscal ativo (autorizado ou em processamento) para este pedido.'
    );
    v_errors := v_errors + 1;
  end if;

  if v_order.status not in ('approved', 'completed') then
    v_issues := v_issues || jsonb_build_object(
      'code', 'ORDER_NOT_ELIGIBLE_FOR_INVOICE',
      'severity', 'error',
      'message', 'Pedido precisa estar aprovado para emissao fiscal.'
    );
    v_errors := v_errors + 1;
  end if;

  -- 3. Check Issuer (Organization)
  select * into v_org_profile from public.organization_fiscal_profiles where organization_id = v_org_id;
  if not found then
    v_issues := v_issues || jsonb_build_object(
      'code', 'ISSUER_PROFILE_MISSING', 'severity', 'error', 'entity', 'organization',
      'message', 'Perfil fiscal da empresa emissora nao configurado.',
      'action', jsonb_build_object('label', 'Configurar Fiscal', 'href', '/fiscal/configuracoes')
    );
    v_errors := v_errors + 1;
  else
    if coalesce(v_org_profile.cpf_cnpj, '') = '' then
      v_issues := v_issues || jsonb_build_object('code', 'ISSUER_DOCUMENT_MISSING', 'severity', 'error', 'entity', 'organization', 'message', 'CNPJ do emitente ausente.', 'action', jsonb_build_object('label', 'Corrigir', 'href', '/fiscal/configuracoes'));
      v_errors := v_errors + 1;
    end if;
    if v_org_profile.tax_regime is null then
      v_issues := v_issues || jsonb_build_object('code', 'ISSUER_TAX_REGIME_MISSING', 'severity', 'error', 'entity', 'organization', 'message', 'Regime tributario do emitente nao informado.', 'action', jsonb_build_object('label', 'Corrigir', 'href', '/fiscal/configuracoes'));
      v_errors := v_errors + 1;
    end if;
    if v_org_profile.fiscal_address is null then
      v_issues := v_issues || jsonb_build_object('code', 'ISSUER_FISCAL_ADDRESS_MISSING', 'severity', 'error', 'entity', 'organization', 'message', 'Endereco fiscal do emitente nao informado.', 'action', jsonb_build_object('label', 'Corrigir', 'href', '/fiscal/configuracoes'));
      v_errors := v_errors + 1;
    end if;
  end if;

  -- 4. Check Customer
  v_restrictions := public.customer_get_operation_restrictions(v_order.customer_id, 'invoice_issue');
  if not (v_restrictions->>'allowed')::boolean then
    v_issues := v_issues || jsonb_build_object(
      'code', 'CUSTOMER_OPERATION_BLOCKED', 'severity', 'error', 'entity', 'customer', 'entity_id', v_order.customer_id,
      'message', 'Cliente possui restricao fiscal bloqueante ativa.',
      'action', jsonb_build_object('label', 'Ver restricoes', 'href', '/clientes/' || v_order.customer_id || '?tab=restricoes')
    );
    v_errors := v_errors + 1;
  end if;

  select * into v_customer_profile from public.customer_fiscal_profiles where customer_id = v_order.customer_id;
  if not found then
    v_issues := v_issues || jsonb_build_object(
      'code', 'CUSTOMER_FISCAL_PROFILE_MISSING', 'severity', 'error', 'entity', 'customer', 'entity_id', v_order.customer_id,
      'message', 'Perfil fiscal do cliente nao configurado.',
      'action', jsonb_build_object('label', 'Configurar Cliente', 'href', '/clientes/' || v_order.customer_id || '?tab=fiscal')
    );
    v_errors := v_errors + 1;
  else
    if coalesce(v_customer_profile.cpf_cnpj, '') = '' then
      v_issues := v_issues || jsonb_build_object('code', 'CUSTOMER_DOCUMENT_MISSING', 'severity', 'error', 'entity', 'customer', 'entity_id', v_order.customer_id, 'message', 'CPF/CNPJ do cliente ausente.', 'action', jsonb_build_object('label', 'Corrigir', 'href', '/clientes/' || v_order.customer_id || '?tab=fiscal'));
      v_errors := v_errors + 1;
    end if;
    if v_customer_profile.fiscal_address_id is null then
      v_issues := v_issues || jsonb_build_object('code', 'CUSTOMER_FISCAL_ADDRESS_MISSING', 'severity', 'error', 'entity', 'customer', 'entity_id', v_order.customer_id, 'message', 'Endereco fiscal do cliente nao informado.', 'action', jsonb_build_object('label', 'Corrigir', 'href', '/clientes/' || v_order.customer_id || '?tab=fiscal'));
      v_errors := v_errors + 1;
    end if;
  end if;

  -- 5. Check Products
  for v_item in select i.*, p.name from public.order_items i join public.products p on i.product_id = p.id where i.order_id = p_order_id
  loop
    if v_item.product_id is null then
      v_issues := v_issues || jsonb_build_object(
        'code', 'PRODUCT_MISSING', 'severity', 'error', 'entity', 'product', 'order_item_id', v_item.id,
        'message', 'Item do pedido invalido ou sem vinculo com produto.',
        'action', null
      );
      v_errors := v_errors + 1;
    end if;
  end loop;

  if not exists (select 1 from public.order_items where order_id = p_order_id) then
    v_issues := v_issues || jsonb_build_object('code', 'ORDER_HAS_NO_ITEMS', 'severity', 'error', 'message', 'Pedido nao possui itens.');
    v_errors := v_errors + 1;
  end if;

  return jsonb_build_object(
    'ready', (v_errors = 0),
    'errors', v_errors,
    'warnings', v_warnings,
    'issues', v_issues
  );
end;
$$;


-- Also fix the draft RPC encoding
create or replace function public.fiscal_create_invoice_draft_from_order(p_order_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_order record;
  v_org_id uuid;
  v_org_profile record;
  v_customer_profile record;
  v_customer record;
  v_item record;
  v_diag jsonb;

  v_hash_text text;
  v_snapshot_hash text;

  v_existing_draft record;
  v_new_invoice_id uuid;
  v_new_revision int := 1;

  v_total_products numeric := 0;
  v_total_freight numeric := 0;
  v_total_discount numeric := 0;
  v_total_other numeric := 0;
  v_total_invoice numeric := 0;
begin
  -- 1. Resolve and lock order
  select o.* into v_order from public.orders o where o.id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  v_org_id := v_order.organization_id;
  if not public.is_organization_member(v_org_id) then raise exception 'UNAUTHORIZED'; end if;

  -- 2. Assert Operations Allowed (Security)
  perform public.customer_assert_operation_allowed(v_order.customer_id, 'invoice_issue');

  -- 3. Assert Fiscal Readiness
  v_diag := public.fiscal_validate_order_readiness(p_order_id);
  if not (v_diag->>'ready')::boolean then
    raise exception 'FISCAL_READINESS_FAILED';
  end if;

  -- 4. Load Profiles for Snapshots
  select * into v_org_profile from public.organization_fiscal_profiles where organization_id = v_org_id;
  select * into v_customer_profile from public.customer_fiscal_profiles where customer_id = v_order.customer_id;
  select * into v_customer from public.customers where id = v_order.customer_id;

  -- 5. Compute deterministic Snapshot Hash
  v_hash_text := v_order.id::text || '_' || coalesce(v_order.updated_at::text, '') || '_' ||
                 coalesce(v_org_profile.updated_at::text, '') || '_' ||
                 coalesce(v_customer_profile.updated_at::text, '') || '_' ||
                 (select md5(string_agg(id::text || product_id::text || quantity::text || unit_price::text, '')) from public.order_items where order_id = p_order_id);
  v_snapshot_hash := md5(v_hash_text);

  -- 6. Check Idempotency (Existing Draft)
  select * into v_existing_draft from public.invoices
  where order_id = p_order_id
    and status = 'draft'
  order by draft_revision desc limit 1;

  if found then
    if v_existing_draft.source_snapshot_hash = v_snapshot_hash then
      return v_existing_draft.id;
    else
      update public.invoices set status = 'superseded' where id = v_existing_draft.id;
      insert into public.invoice_events (organization_id, invoice_id, event_type, description, created_by)
      values (v_org_id, v_existing_draft.id, 'draft_superseded', 'Draft substituido por nova revisao devido a alteracao nos dados fiscais ou do pedido.', auth.uid());

      v_new_revision := v_existing_draft.draft_revision + 1;
    end if;
  end if;

  -- Calculate Totals
  select coalesce(sum(quantity * unit_price), 0) into v_total_products
  from public.order_items where order_id = p_order_id;

  v_total_freight := coalesce(v_order.freight_amount, 0);
  v_total_discount := coalesce(v_order.discount_amount, 0);
  v_total_other := 0;

  v_total_invoice := v_total_products + v_total_freight + v_total_other - v_total_discount;

  -- 7. Create New Invoice Draft (Snapshot Header)
  insert into public.invoices (
    organization_id, order_id, customer_id, status, draft_revision, supersedes_invoice_id, source_snapshot_hash,

    issuer_fiscal_profile_id, issuer_legal_name_snapshot, issuer_trade_name_snapshot,
    issuer_cnpj_snapshot, issuer_ie_snapshot, issuer_im_snapshot, issuer_tax_regime_snapshot, issuer_address_snapshot,

    customer_fiscal_profile_id, recipient_name_snapshot, recipient_document_snapshot,
    recipient_ie_snapshot, recipient_ie_indicator_snapshot, recipient_im_snapshot,
    recipient_final_consumer_snapshot, recipient_address_snapshot,

    total_amount, products_amount, total_products, total_freight, total_discounts, other_amount, subtotal_amount,
    created_by
  ) values (
    v_org_id, p_order_id, v_order.customer_id, 'draft', v_new_revision, v_existing_draft.id, v_snapshot_hash,

    v_org_profile.organization_id, (select name from public.organizations where id = v_org_id), null,
    v_org_profile.cpf_cnpj, v_org_profile.state_registration, v_org_profile.municipal_registration, v_org_profile.tax_regime::text, v_org_profile.fiscal_address,

    v_customer_profile.id, v_customer.name, v_customer_profile.cpf_cnpj,
    v_customer_profile.state_registration, v_customer_profile.state_registration_indicator::text, v_customer_profile.municipal_registration,
    v_customer_profile.final_consumer,
    (select jsonb_build_object('street', street, 'number', number, 'district', district, 'city', city, 'state', state, 'postal_code', postal_code, 'complement', complement) from public.customer_addresses where id = v_customer_profile.fiscal_address_id),

    v_total_invoice, v_total_products, v_total_products, v_total_freight, v_total_discount, v_total_other, v_total_products,
    auth.uid()
  ) returning id into v_new_invoice_id;

  -- 8. Create Invoice Items (Snapshots)
  for v_item in select i.*, p.name, p.sku from public.order_items i join public.products p on i.product_id = p.id where i.order_id = p_order_id
  loop
    insert into public.invoice_items (
      organization_id, invoice_id, product_id, item_sequence,
      sku_snapshot, description_snapshot, cfop_snapshot, ncm_snapshot, unit_snapshot, cest_snapshot,
      quantity, unit_price, total_price, discount_amount
    ) values (
      v_org_id, v_new_invoice_id, v_item.product_id, v_item.sequence,
      v_item.sku, v_item.name, null, null, null, null,
      v_item.quantity, v_item.unit_price, (v_item.quantity * v_item.unit_price), 0
    );
  end loop;

  -- 9. Record Invoice Event
  insert into public.invoice_events (organization_id, invoice_id, event_type, description, created_by)
  values (v_org_id, v_new_invoice_id, 'draft_created', 'Draft fiscal preparado (Revisao ' || v_new_revision || ').', auth.uid());

  return v_new_invoice_id;
end;
$$;

commit;