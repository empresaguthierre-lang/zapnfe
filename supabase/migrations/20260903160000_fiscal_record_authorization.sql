begin;

alter table public.invoices 
  add column if not exists authorization_protocol text,
  add column if not exists authorized_at timestamptz;

create or replace function public.fiscal_record_authorization(
  p_invoice_id uuid,
  p_provider_reference text,
  p_access_key text,
  p_authorization_protocol text,
  p_authorized_at timestamptz,
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

  -- Ensure we are talking about the same external reference (or it's null in DB, but realistically it's set before submit)
  if v_invoice.provider_reference is not null and v_invoice.provider_reference <> p_provider_reference then
    raise exception 'FISCAL_REFERENCE_MISMATCH';
  end if;

  -- Idempotency and Conflict Resolution
  if v_invoice.status = 'authorized' then
    if v_invoice.access_key is not null and v_invoice.access_key <> p_access_key then
      raise exception 'FISCAL_AUTHORIZATION_FACT_CONFLICT';
    end if;
    -- Already authorized with same access key, idempotent success
    return;
  end if;

  update public.invoices
  set 
    status = 'authorized',
    access_key = coalesce(v_invoice.access_key, p_access_key),
    authorization_protocol = coalesce(v_invoice.authorization_protocol, p_authorization_protocol),
    authorized_at = coalesce(v_invoice.authorized_at, p_authorized_at),
    updated_at = now()
  where id = p_invoice_id;

  insert into public.invoice_events (
    organization_id, invoice_id, event_type, description, provider_response
  ) values (
    v_invoice.organization_id, p_invoice_id, 'authorized', 'Retorno do provedor: autorizado',
    p_raw_response
  );

end;
$$;

commit;
