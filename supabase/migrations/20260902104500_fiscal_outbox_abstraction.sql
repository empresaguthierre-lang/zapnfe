begin;

-- =============================================================
-- BLOCK 4B: Fiscal Provider Abstraction & Outbox Pattern
-- =============================================================

-- 1. Canonical Statuses (Extending existing ones)
alter type public.invoice_status add value if not exists 'submission_pending';
alter type public.invoice_status add value if not exists 'processing';
alter type public.invoice_status add value if not exists 'error';
alter type public.invoice_status add value if not exists 'cancellation_pending';

-- 2. Outbox Jobs (Transactional safely decoupled execution)
create type public.outbox_job_status as enum ('pending', 'processing', 'completed', 'failed', 'dead_letter');

create table if not exists public.outbox_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  
  job_type text not null, -- e.g., 'fiscal.invoice.submit'
  entity_type text not null, -- e.g., 'invoice'
  entity_id uuid not null,
  
  payload jsonb,
  status public.outbox_job_status not null default 'pending',
  
  attempts int not null default 0,
  max_attempts int not null default 3,
  
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.outbox_jobs enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'outbox_org' and tablename = 'outbox_jobs') then
    create policy outbox_org on public.outbox_jobs 
      for all to authenticated using (public.is_organization_member(organization_id));
  end if;
end
$$;

-- Critical index for fast worker polling without table scans
create index if not exists idx_outbox_pending on public.outbox_jobs (status, available_at) where status = 'pending';

-- 3. Queue Invoice Submission (RPC)
create or replace function public.fiscal_queue_invoice_submission(p_invoice_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_invoice record;
begin
  -- 1. Lock invoice (Deterministic ordering for single entity is just by ID naturally)
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  
  -- 2. Real org resolution and membership check
  if not public.is_organization_member(v_invoice.organization_id) then
    raise exception 'UNAUTHORIZED';
  end if;

  -- 3. Idempotency check
  if v_invoice.status = 'submission_pending' then
    -- Already queued, safe return
    return;
  end if;

  if v_invoice.status <> 'draft' then
    raise exception 'INVALID_STATUS'; 
  end if;

  -- 4. Revalidate operations (Fiscal Guard)
  perform public.customer_assert_operation_allowed(v_invoice.customer_id, 'invoice_issue');
  
  -- 5. Execute state change
  update public.invoices 
  set status = 'submission_pending' 
  where id = p_invoice_id;
  
  -- 6. Events (History)
  insert into public.invoice_events(organization_id, invoice_id, event_type, description, created_by)
  values (v_invoice.organization_id, p_invoice_id, 'submission_queued', 'Envio de documento fiscal enfileirado para o provedor.', auth.uid());
  
  -- 7. Outbox (Trigger external effect safely)
  insert into public.outbox_jobs(organization_id, job_type, entity_type, entity_id, payload)
  values (v_invoice.organization_id, 'fiscal.invoice.submit', 'invoice', p_invoice_id, jsonb_build_object('action', 'issue'));
  
end;
$$;

commit;