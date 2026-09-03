begin;

-- bank_transactions
drop policy if exists bnk_txn_org on public.bank_transactions;
drop policy if exists no_delete_bank_transactions on public.bank_transactions;
create policy bnk_txn_select on public.bank_transactions for select to authenticated using (public.is_organization_member(organization_id));

-- bank_reconciliations
drop policy if exists bnk_rec_org on public.bank_reconciliations;
drop policy if exists no_delete_bank_reconciliations on public.bank_reconciliations;
create policy bnk_rec_select on public.bank_reconciliations for select to authenticated using (public.is_organization_member(organization_id));

-- financial_transactions
drop policy if exists fin_txn_org on public.financial_transactions;
create policy fin_txn_select on public.financial_transactions for select to authenticated using (public.is_organization_member(organization_id));

-- internal_bank_transfers
drop policy if exists int_trf_org on public.internal_bank_transfers;
create policy int_trf_select on public.internal_bank_transfers for select to authenticated using (public.is_organization_member(organization_id));

commit;
