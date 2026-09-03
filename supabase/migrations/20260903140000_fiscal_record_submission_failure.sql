begin;

create or replace function public.fiscal_record_submission_failure(
  p_invoice_id uuid,
  p_error_code text,
  p_error_message text,
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

  update public.invoices
  set status = 'error', updated_at = now()
  where id = p_invoice_id;

  insert into public.invoice_events (
    organization_id, invoice_id, event_type, description, provider_response
  ) values (
    v_invoice.organization_id, p_invoice_id, 'error', p_error_message,
    coalesce(p_raw_response, jsonb_build_object('error_code', p_error_code))
  );

end;
$$;

commit;
