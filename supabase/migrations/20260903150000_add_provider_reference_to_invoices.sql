begin;
alter table public.invoices add column provider_reference text;
commit;
