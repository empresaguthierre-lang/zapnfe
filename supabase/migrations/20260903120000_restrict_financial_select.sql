begin;

-- Financial RLS: restrict to admin/manager
drop policy if exists acc_recv_select on public.accounts_receivable;
create policy acc_recv_select on public.accounts_receivable for select to authenticated using (public.has_organization_role(organization_id, array['admin', 'manager']::public.member_role[]));

drop policy if exists recv_inst_select on public.receivable_installments;
create policy recv_inst_select on public.receivable_installments for select to authenticated using (public.has_organization_role(organization_id, array['admin', 'manager']::public.member_role[]));

drop policy if exists recv_pay_select on public.receivable_payments;
create policy recv_pay_select on public.receivable_payments for select to authenticated using (public.has_organization_role(organization_id, array['admin', 'manager']::public.member_role[]));

drop policy if exists fin_alloc_select on public.financial_allocations;
create policy fin_alloc_select on public.financial_allocations for select to authenticated using (public.has_organization_role(organization_id, array['admin', 'manager']::public.member_role[]));

-- Banking RLS: restrict to admin/manager
drop policy if exists bnk_txn_select on public.bank_transactions;
create policy bnk_txn_select on public.bank_transactions for select to authenticated using (public.has_organization_role(organization_id, array['admin', 'manager']::public.member_role[]));

drop policy if exists bnk_rec_select on public.bank_reconciliations;
create policy bnk_rec_select on public.bank_reconciliations for select to authenticated using (public.has_organization_role(organization_id, array['admin', 'manager']::public.member_role[]));

drop policy if exists fin_txn_select on public.financial_transactions;
create policy fin_txn_select on public.financial_transactions for select to authenticated using (public.has_organization_role(organization_id, array['admin', 'manager']::public.member_role[]));

drop policy if exists int_trf_select on public.internal_bank_transfers;
create policy int_trf_select on public.internal_bank_transfers for select to authenticated using (public.has_organization_role(organization_id, array['admin', 'manager']::public.member_role[]));

-- Fiscal RLS: restrict to admin/manager
drop policy if exists inv_select on public.invoices;
create policy inv_select on public.invoices for select to authenticated using (public.has_organization_role(organization_id, array['admin', 'manager']::public.member_role[]));

drop policy if exists inv_items_select on public.invoice_items;
create policy inv_items_select on public.invoice_items for select to authenticated using (public.has_organization_role(organization_id, array['admin', 'manager']::public.member_role[]));

drop policy if exists inv_evt_select on public.invoice_events;
create policy inv_evt_select on public.invoice_events for select to authenticated using (public.has_organization_role(organization_id, array['admin', 'manager']::public.member_role[]));

commit;
