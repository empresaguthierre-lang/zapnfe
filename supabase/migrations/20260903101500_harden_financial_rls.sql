begin;

-- accounts_receivable
drop policy if exists acc_recv_org on public.accounts_receivable;
create policy acc_recv_select on public.accounts_receivable for select to authenticated using (public.is_organization_member(organization_id));

-- receivable_installments
drop policy if exists recv_inst_org on public.receivable_installments;
create policy recv_inst_select on public.receivable_installments for select to authenticated using (public.is_organization_member(organization_id));

-- receivable_payments
drop policy if exists recv_pay_org on public.receivable_payments;
drop policy if exists no_delete_receivable_payments on public.receivable_payments;
create policy recv_pay_select on public.receivable_payments for select to authenticated using (public.is_organization_member(organization_id));

-- financial_allocations
drop policy if exists fin_alloc_org on public.financial_allocations;
create policy fin_alloc_select on public.financial_allocations for select to authenticated using (public.is_organization_member(organization_id));

commit;
