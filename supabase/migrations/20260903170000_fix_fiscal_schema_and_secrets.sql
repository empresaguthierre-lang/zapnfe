begin;

-- Invoices updated_at trigger
alter table public.invoices add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_invoices_updated_at()
returns trigger as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_invoices_updated_at on public.invoices;
create trigger trg_invoices_updated_at
before update on public.invoices
for each row execute function public.set_invoices_updated_at();

-- Fiscal provider accounts
alter table public.fiscal_provider_accounts add column if not exists credentials_reference text;

-- Add fiscal_record_rejection RPC
create or replace function public.fiscal_record_rejection(
  p_invoice_id uuid,
  p_provider_reference text,
  p_rejection_code text,
  p_rejection_message text,
  p_raw_response jsonb
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') != 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'UNAUTHORIZED'; -- Worker only
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'INVOICE_NOT_FOUND';
  end if;

  if v_invoice.provider_reference is not null and v_invoice.provider_reference <> p_provider_reference then
    raise exception 'FISCAL_REFERENCE_MISMATCH';
  end if;

  update public.invoices
  set status = 'rejected'
  where id = p_invoice_id;

  insert into public.invoice_events (
    organization_id, invoice_id, event_type, description, provider_response
  ) values (
    v_invoice.organization_id, p_invoice_id, 'rejected', coalesce(p_rejection_message, 'Rejeição SEFAZ'), coalesce(p_raw_response, '{}'::jsonb)
  );
end;
$$;

commit;
