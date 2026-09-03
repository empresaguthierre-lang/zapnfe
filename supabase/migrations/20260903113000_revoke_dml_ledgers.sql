begin;

-- Revoke DML directly at the table level for all ledgers
-- Financial
revoke insert, update, delete on public.accounts_receivable from authenticated, anon;
revoke insert, update, delete on public.receivable_installments from authenticated, anon;
revoke insert, update, delete on public.receivable_payments from authenticated, anon;
revoke insert, update, delete on public.financial_allocations from authenticated, anon;

-- Banking
revoke insert, update, delete on public.bank_transactions from authenticated, anon;
revoke insert, update, delete on public.bank_reconciliations from authenticated, anon;
revoke insert, update, delete on public.bank_reconciliation_items from authenticated, anon;
revoke insert, update, delete on public.financial_transactions from authenticated, anon;
revoke insert, update, delete on public.internal_bank_transfers from authenticated, anon;

-- Fiscal
revoke insert, update, delete on public.invoices from authenticated, anon;
revoke insert, update, delete on public.invoice_items from authenticated, anon;
revoke insert, update, delete on public.invoice_events from authenticated, anon;
revoke insert, update, delete on public.fiscal_taxes from authenticated, anon;

commit;
